import * as THREE from 'three';
import { World, Ball, BALL_RADIUS } from './physics.js';
import { PaperBallFactory } from './paperBall.js';
import { TrajectoryGuide, Trail, Burst } from './effects.js';
import { Sound } from './audio.js';
import { buildSeverance } from './levels/severance.js';
import { buildBeach } from './levels/beach.js';
import { disposeScene, pick } from './levels/builder.js';

const POINTS_PER_BASKET = 10;
const LEVEL_GOAL = { 1: 100, 2: 200 };
const LEVEL_BASE = { 1: 0, 2: 100 };
const SPEED_MIN = 2.2;
const SPEED_MAX = 12.5;
const YAW_MAX = 0.8;
const ARC_MIN = 15;
const ARC_MAX = 72;
const MAX_FLOOR_BALLS = 14;
const RELOAD_TIME = 0.45;
const GUIDE_MODES = ['full', 'short', 'off'];
const GUIDE_LABELS = { full: 'Guide: Full', short: 'Guide: Short', off: 'Guide: Off' };

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

// ------------------------------------------------------------------ renderer

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 9000);
camera.rotation.order = 'YXZ';
const resolution = new THREE.Vector2();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  fitCamera();
  resolution.set(w, h);
  if (state.trails) for (const t of state.trails) t.material.resolution.copy(resolution);
}

// Tall screens get a wider vertical FOV so the room isn't cropped to a slit,
// and the throwing hand moves inward so the ball stays on screen.
const MIN_HFOV = 58;
function fitCamera() {
  if (!state.level) return;
  const base = state.level.camera.fov;
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MIN_HFOV / 2)) / camera.aspect));
  camera.fov = clamp(Math.max(base, needed), base, 88);
  camera.updateProjectionMatrix();
  state.hand.copy(state.level.hand);
  state.hand.x *= clamp(camera.aspect / 1.4, 0.3, 1);
}

// ------------------------------------------------------------------ state

const sound = new Sound();
const params = new URLSearchParams(location.search);

const state = {
  phase: 'title',
  levelNum: 1,
  level: null,
  world: null,
  factory: null,
  guide: null,
  burst: null,
  score: 0,
  throws: 0,
  makes: 0,
  streak: 0,
  bestStreak: 0,
  levelThrows: 0,
  levelMakes: 0,
  levelBaskets: 0,
  aim: { yaw: 0, power: 0.42, arc: 45 },
  drag: null,
  held: null,
  heldPop: 1,
  reloadT: 0,
  thrown: [],
  trails: [],
  relocating: null,
  binMoving: false,
  timers: [],
  guideMode: 'full',
  camYaw: 0,
  time: 0,
  goalReached: false,
  ceilingHints: 0,
  hand: new THREE.Vector3(),
};

const launchPos = new THREE.Vector3();
const launchVel = new THREE.Vector3();
const predictBuf = new Float32Array(3 * 900);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();

function after(seconds, fn) {
  state.timers.push({ t: seconds, fn });
}

// ------------------------------------------------------------------ levels

function loadLevel(n) {
  if (state.held) state.held.removeFromParent();
  if (state.level) {
    for (const t of state.trails) t.dispose();
    disposeScene(state.level.scene);
    state.factory.dispose();
  }
  const world = new World();
  const level = (n === 1 ? buildSeverance : buildBeach)({ renderer, world });
  state.world = world;
  state.level = level;
  state.levelNum = n;
  state.factory = new PaperBallFactory(BALL_RADIUS, level.ball);
  state.guide = new TrajectoryGuide(level.guideColor);
  level.scene.add(state.guide.group);
  state.burst = new Burst(level.scene);
  state.thrown = [];
  state.trails = [];
  state.relocating = null;
  state.binMoving = false;
  state.timers = [];
  state.held = null;
  state.levelThrows = 0;
  state.levelMakes = 0;
  state.levelBaskets = 0;
  state.aim.yaw = 0;
  state.aim.power = 0.42;
  state.aim.arc = level.arc;
  state.ceilingHints = 0;

  const c = level.camera;
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.set(c.pitch, 0, 0);
  fitCamera();
  level.scene.add(camera);
  renderer.toneMappingExposure = level.exposure;

  level.bin.setPosition(level.firstBin.x, level.firstBin.z);
  spawnHeld(true);

  document.body.classList.toggle('theme-beach', level.theme === 'beach');
  document.body.classList.toggle('theme-lumon', level.theme === 'lumon');
  $('level-tag').textContent = level.tag;
  $('level-name').textContent = level.name;
  $('level-sub').textContent = level.sub;
  updateHud();
}

// ------------------------------------------------------------------ held ball & throwing

function spawnHeld(instant = false) {
  const mesh = state.factory.create();
  camera.add(mesh);
  mesh.position.copy(state.hand);
  state.held = mesh;
  state.heldPop = instant ? 1 : 0;
  mesh.scale.setScalar(instant ? 1 : 0.001);
  if (!instant) sound.crumple();
}

function canThrow() {
  return state.phase === 'play' && state.held && state.heldPop > 0.6 && !state.binMoving;
}

function computeLaunch() {
  const { yaw, power, arc } = state.aim;
  const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * power;
  const pitch = THREE.MathUtils.degToRad(arc);
  launchVel.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(speed);
  camera.updateMatrixWorld(true);
  state.held.getWorldPosition(launchPos);
}

function throwBall() {
  if (!canThrow()) return;
  computeLaunch();
  const ball = new Ball(BALL_RADIUS);
  ball.pos.x = launchPos.x;
  ball.pos.y = launchPos.y;
  ball.pos.z = launchPos.z;
  ball.vel.x = launchVel.x;
  ball.vel.y = launchVel.y;
  ball.vel.z = launchVel.z;
  // Natural backspin from the wrist flick; only visual.
  const s = 8 + Math.random() * 6;
  ball.spin.x = Math.cos(state.aim.yaw) * s;
  ball.spin.z = Math.sin(state.aim.yaw) * s;
  state.world.addBall(ball);

  const mesh = state.held;
  mesh.getWorldQuaternion(tmpQ);
  camera.remove(mesh);
  state.level.scene.add(mesh);
  mesh.position.copy(launchPos);
  mesh.quaternion.copy(tmpQ);
  mesh.scale.setScalar(1);

  const trail = new Trail(state.level.guideColor, resolution);
  state.level.scene.add(trail.line);
  trail.add(launchPos.x, launchPos.y, launchPos.z);
  state.trails.push(trail);

  state.thrown.push({ ball, mesh, trail, scored: false, resolved: false, inBin: false, age: 0, removing: 0 });
  state.held = null;
  state.reloadT = RELOAD_TIME;
  state.throws++;
  state.levelThrows++;
  sound.throw(state.aim.power);
  state.guide.hide();
  updateHud();
}

// ------------------------------------------------------------------ scoring

function onScore(t) {
  t.scored = true;
  t.resolved = true;
  t.inBin = true;
  state.score += POINTS_PER_BASKET;
  state.makes++;
  state.levelMakes++;
  state.levelBaskets++;
  state.streak++;
  state.bestStreak = Math.max(state.bestStreak, state.streak);

  const level = state.level;
  const bin = level.bin;
  sound.score(level.theme);
  const colors = level.theme === 'lumon' ? ['#8ff0e4', '#ffffff', '#cfe9ff', '#5fd1c4'] : ['#ffd49a', '#f2b27a', '#ffffff', '#9fc6c9', '#e2735a'];
  state.burst.emit(bin.x, bin.H + 0.05, bin.z, colors, 40);
  popup(`+${POINTS_PER_BASKET}`, bin.x, bin.H + 0.15, bin.z);
  const msg = state.streak >= 3 && state.streak % 2 === 1 ? level.messages.streak(state.streak) : pick(level.messages.score);
  toast(msg, true);
  updateHud();
  // A ball still in the air when the goal was reached scores, but doesn't re-trigger the flow.
  if (state.phase !== 'play') return;

  state.binMoving = true;
  const goal = LEVEL_GOAL[state.levelNum];
  if (state.levelNum === 1 && state.score >= goal) {
    state.phase = 'levelup';
    after(1.6, showLevelComplete);
  } else if (state.levelNum === 2 && state.score >= goal && !state.goalReached) {
    state.goalReached = true;
    state.phase = 'won';
    after(1.6, showWin);
  } else {
    after(1.0, startRelocation);
  }
}

function onMiss(t) {
  t.resolved = true;
  state.streak = 0;
  if (Math.random() < 0.65) toast(pick(state.level.messages.miss), false);
  updateHud();
  // Keep the floor tidy: fade out the oldest missed balls.
  const floor = state.thrown.filter((x) => !x.inBin && x.resolved && !x.removing);
  for (let i = 0; i < floor.length - MAX_FLOOR_BALLS; i++) floor[i].removing = 0.001;
}

// ------------------------------------------------------------------ bin relocation

function pickBinSpot() {
  const level = state.level;
  const { x0, x1, z0, z1 } = level.binArea;
  const bin = level.bin;
  // Bins drift farther away as the level progresses.
  const progress = clamp(state.levelBaskets / 9, 0, 1);
  const zFar = z1 + (z0 - z1) * (0.45 + 0.55 * progress);
  for (let i = 0; i < 80; i++) {
    const x = x0 + Math.random() * (x1 - x0);
    const z = z1 + Math.random() * (zFar - z1);
    if (Math.hypot(x - bin.x, z - bin.z) < 1.0) continue;
    if (level.binAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + bin.rT + 0.05)) continue;
    return { x, z };
  }
  return { x: level.firstBin.x, z: level.firstBin.z };
}

function startRelocation() {
  if (state.phase !== 'play') return;
  state.binMoving = true;
  state.relocating = { t: 0, to: pickBinSpot(), swapped: false };
  state.level.bin.collider.enabled = false;
  state.guide.hide();
}

function updateRelocation(dt) {
  const r = state.relocating;
  if (!r) return;
  const bin = state.level.bin;
  r.t += dt;
  const OUT = 0.3;
  const IN = 0.45;
  if (r.t < OUT) {
    const s = Math.max(0.001, 1 - (r.t / OUT) ** 2);
    bin.group.scale.setScalar(s);
    for (const t of state.thrown) if (t.inBin) t.mesh.scale.setScalar(s);
    return;
  }
  if (!r.swapped) {
    r.swapped = true;
    const inTheWay = (t) => t.inBin || Math.hypot(t.ball.pos.x - r.to.x, t.ball.pos.z - r.to.z) < bin.rT + 0.12;
    for (const t of state.thrown.filter(inTheWay)) removeThrown(t);
    bin.setPosition(r.to.x, r.to.z);
  }
  const k = Math.min(1, (r.t - OUT) / IN);
  bin.group.scale.setScalar(Math.max(0.001, easeOutBack(k)));
  if (k >= 1) {
    bin.group.scale.setScalar(1);
    bin.collider.enabled = true;
    state.relocating = null;
    state.binMoving = false;
  }
}

function removeThrown(t) {
  state.world.removeBall(t.ball);
  t.mesh.removeFromParent();
  t.trail.fading = true;
  const i = state.thrown.indexOf(t);
  if (i >= 0) state.thrown.splice(i, 1);
}

// ------------------------------------------------------------------ per-frame updates

function updateCamera(dt) {
  const c = state.level.camera;
  const target = state.phase === 'title' ? Math.sin(state.time * 0.15) * 0.12 : state.aim.yaw * 0.35;
  state.camYaw += (target - state.camYaw) * Math.min(1, dt * 5);
  camera.rotation.y = -state.camYaw;
  camera.rotation.x = c.pitch + Math.sin(state.time * 0.9) * 0.003;
  camera.position.y = c.y + Math.sin(state.time * 1.3) * 0.004;
}

function updateHeld(dt) {
  if (!state.held) {
    if (state.phase === 'play' && !state.relocating) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) spawnHeld();
    }
    return;
  }
  state.heldPop = Math.min(1, state.heldPop + dt * 4);
  const h = state.held;
  h.scale.setScalar(Math.max(0.001, easeOutBack(state.heldPop)));
  const pull = state.drag ? state.aim.power : 0;
  h.position.copy(state.hand);
  h.position.y += -0.025 * pull + Math.sin(state.time * 2) * 0.004;
  h.position.z += 0.05 * pull;
  h.rotation.y += dt * 0.3;
}

function updateGuide() {
  if (!canThrow() || state.guideMode === 'off') {
    state.guide.hide();
    return;
  }
  computeLaunch();
  const res = state.world.predict(launchPos, launchVel, 3.5, predictBuf, 4);
  state.guide.show(predictBuf, res.count, res.hit, state.guideMode, state.time, camera.position);
}

function syncBalls(dt) {
  const bin = state.level.bin;
  for (const t of [...state.thrown]) {
    const b = t.ball;
    t.age += dt;
    t.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    const w = Math.hypot(b.spin.x, b.spin.y, b.spin.z);
    if (w > 1e-3 && !b.sleeping) {
      tmpAxis.set(b.spin.x / w, b.spin.y / w, b.spin.z / w);
      tmpQ.setFromAxisAngle(tmpAxis, w * dt);
      t.mesh.quaternion.premultiply(tmpQ);
    }

    if (!t.trail.fading) {
      if (b.sleeping || t.age > 3 || t.inBin) t.trail.fading = true;
      else t.trail.add(b.pos.x, b.pos.y, b.pos.z);
    }

    if (!t.scored && !state.relocating && bin.contains(b.pos, b.radius)) onScore(t);
    if (!t.resolved && (b.sleeping || t.age > 9 || b.pos.y < -3)) onMiss(t);
    if (b.pos.y < -3) removeThrown(t);

    if (t.removing > 0) {
      t.removing += dt * 3;
      t.mesh.scale.setScalar(Math.max(0.001, 1 - t.removing));
      if (t.removing >= 1) removeThrown(t);
    }
  }
  for (let i = state.trails.length - 1; i >= 0; i--) {
    const tr = state.trails[i];
    tr.update(dt);
    if (tr.done) {
      tr.line.removeFromParent();
      tr.dispose();
      state.trails.splice(i, 1);
    }
  }
}

function handleEvents() {
  const level = state.level;
  for (const ev of state.world.events) {
    sound.impact(ev.tag, ev.speed);
    if (ev.tag === 'ceiling' && state.ceilingHints < 2) {
      state.ceilingHints++;
      toast('Low ceiling. Try a flatter arc.');
    }
    if (ev.collider === level.bin.collider && ev.speed > 0.8) level.bin.knock(ev.x, ev.z, ev.speed);
    if (level.onImpact) level.onImpact(ev);
  }
  state.world.events.length = 0;
}

function updateTimers(dt) {
  for (let i = state.timers.length - 1; i >= 0; i--) {
    const t = state.timers[i];
    t.t -= dt;
    if (t.t <= 0) {
      state.timers.splice(i, 1);
      t.fn();
    }
  }
}

function update(dt) {
  state.time += dt;
  updateTimers(dt);
  updateCamera(dt);
  updateHeld(dt);
  state.world.step(dt);
  syncBalls(dt);
  handleEvents();
  updateRelocation(dt);
  state.level.bin.update(dt);
  updateGuide();
  updateAimReadout();
  state.burst.update(dt);
  state.level.update(dt, state.time);
}

// Drop the render resolution in steps if frames run slow. The ceiling only ever
// ratchets down, so it can't oscillate between two sizes.
const perf = { acc: 0, n: 0, ratio: Math.min(window.devicePixelRatio, 2), ceiling: Math.min(window.devicePixelRatio, 2) };
function adaptResolution(raw) {
  if (document.visibilityState !== 'visible' || raw > 0.25) return;
  perf.acc += raw;
  perf.n++;
  if (perf.n < 90) return;
  const avg = perf.acc / perf.n;
  perf.acc = perf.n = 0;
  if (avg > 1 / 45 && perf.ratio > 1) {
    perf.ceiling = perf.ratio - 0.25;
    perf.ratio = Math.max(1, perf.ceiling);
  } else if (avg < 1 / 75 && perf.ratio < perf.ceiling) {
    perf.ratio = Math.min(perf.ceiling, perf.ratio + 0.25);
  } else {
    return;
  }
  renderer.setPixelRatio(perf.ratio);
  resize();
}

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  if (state.level) {
    update(dt);
    renderer.render(state.level.scene, camera);
    adaptResolution(raw);
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ HUD

function updateHud() {
  const n = state.levelNum;
  const goal = LEVEL_GOAL[n];
  const base = LEVEL_BASE[n];
  $('score').textContent = state.score;
  $('goal').textContent = goal;
  $('bar-fill').style.width = `${clamp((state.score - base) / (goal - base), 0, 1) * 100}%`;
  $('stat-throws').textContent = `${state.throws} ${state.throws === 1 ? 'throw' : 'throws'}`;
  $('stat-acc').textContent = state.throws ? `${Math.round((state.makes / state.throws) * 100)}% made` : '0% made';
  $('stat-streak').textContent = `streak ${state.streak}`;
}

let lastReadout = '';
function updateAimReadout() {
  const { power, arc, yaw } = state.aim;
  const yawDeg = Math.round(THREE.MathUtils.radToDeg(yaw));
  const key = `${Math.round(power * 100)}|${Math.round(arc)}|${yawDeg}|${!!state.drag}`;
  if (key === lastReadout) return;
  lastReadout = key;
  $('power-fill').style.width = `${power * 100}%`;
  $('aim-power').textContent = `${Math.round(power * 100)}%`;
  $('aim-arc').textContent = `${Math.round(arc)}°`;
  $('aim-yaw').textContent = yawDeg === 0 ? '0°' : `${Math.abs(yawDeg)}° ${yawDeg > 0 ? 'R' : 'L'}`;
  $('aim-readout').classList.toggle('idle', !state.drag);
}

let toastTimer = 0;
function toast(msg, good = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('good', good);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
}

function popup(text, x, y, z) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  el.style.left = `${((tmpV.x + 1) / 2) * window.innerWidth}px`;
  el.style.top = `${((1 - tmpV.y) / 2) * window.innerHeight}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function showOverlay(html) {
  $('overlay-card').innerHTML = html;
  $('overlay').classList.remove('hidden');
  document.body.classList.remove('playing');
  const primary = $('overlay-card').querySelector('button.primary');
  if (primary) primary.focus({ preventScroll: true });
}

function hideOverlay() {
  $('overlay').classList.add('hidden');
  document.body.classList.add('playing');
}

function statsRow() {
  const acc = state.levelThrows ? Math.round((state.levelMakes / state.levelThrows) * 100) : 0;
  return `
    <div class="stat-row">
      <div class="stat"><b>${state.levelThrows}</b><span>Throws</span></div>
      <div class="stat"><b>${acc}%</b><span>Accuracy</span></div>
      <div class="stat"><b>${state.bestStreak}</b><span>Best streak</span></div>
    </div>`;
}

function showTitle() {
  showOverlay(`
    <div class="kicker">Two floors · one wastebasket at a time</div>
    <h2>Trashketball</h2>
    <p>Crumple, aim, release. Every paper ball that lands in the bin is worth 10 points. Refine 100 points on the severed floor to earn a stay at the beach house.</p>
    <ul>
      <li><b>Drag</b><span>Up and down sets power, left and right sets direction. The dotted guide traces the flight.</span></li>
      <li><b>Release</b><span>Throws the ball. Right-click or Esc cancels the drag.</span></li>
      <li><b>Arc</b><span>Scroll to raise or lower the arc. W and S, or the Arc buttons, work too.</span></li>
      <li><b>Keys</b><span>Arrows fine-tune, Space throws, T cycles the guide, M mutes.</span></li>
    </ul>
    <div class="actions"><button type="button" class="primary" id="btn-start">Begin refinement</button></div>
  `);
  $('btn-start').addEventListener('click', () => {
    sound.init();
    sound.startAmbience(state.level.ambience);
    state.phase = 'play';
    hideOverlay();
    toast('Please enjoy each basket equally.', true);
  });
}

function showLevelComplete() {
  sound.levelUp();
  showOverlay(`
    <div class="kicker">Quota met · ${state.score} points</div>
    <h2>Refinement complete</h2>
    <p>Your outie has booked you a week at an oceanfront beach house. The bins there are woven, the ceilings are high, and the view is the Pacific. Please enjoy it equally.</p>
    ${statsRow()}
    <div class="actions"><button type="button" class="primary" id="btn-next">Check in to the beach house</button></div>
  `);
  $('btn-next').addEventListener('click', () => transitionTo(2));
}

function showWin() {
  sound.levelUp();
  showOverlay(`
    <div class="kicker">${state.score} points · five-star stay</div>
    <h2>You nailed the vacation</h2>
    <p>Two floors, one very tired wastebasket. The beach house stays open: keep shooting for a longer streak, or start over from the severed floor.</p>
    ${statsRow()}
    <div class="actions">
      <button type="button" class="primary" id="btn-keep">Keep playing</button>
      <button type="button" class="secondary" id="btn-restart">Play again</button>
    </div>
  `);
  $('btn-keep').addEventListener('click', () => {
    state.phase = 'play';
    hideOverlay();
    startRelocation();
  });
  $('btn-restart').addEventListener('click', () => location.assign(location.pathname));
}

function transitionTo(n) {
  state.phase = 'transition';
  $('overlay').classList.add('hidden');
  $('fade').classList.add('on');
  sound.stopAmbience();
  setTimeout(() => {
    loadLevel(n);
    sound.startAmbience(state.level.ambience);
    setTimeout(() => {
      $('fade').classList.remove('on');
      state.phase = 'play';
      document.body.classList.add('playing');
      toast(n === 2 ? 'Welcome to Casa Marea.' : 'Welcome back, refiner.', true);
    }, 150);
  }, 750);
}

// ------------------------------------------------------------------ input

function cancelDrag() {
  const d = state.drag;
  if (!d) return;
  state.aim.yaw = d.yaw0;
  state.aim.power = d.power0;
  state.drag = null;
  document.body.classList.remove('dragging');
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'play') return;
  if (e.button === 2) {
    cancelDrag();
    return;
  }
  if (e.button !== 0) return;
  sound.init();
  canvas.setPointerCapture(e.pointerId);
  state.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw0: state.aim.yaw, power0: state.aim.power };
  document.body.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  const d = state.drag;
  if (!d || e.pointerId !== d.id) return;
  const H = window.innerHeight;
  const dx = e.clientX - d.x;
  const dy = d.y - e.clientY;
  state.aim.yaw = clamp(d.yaw0 + (dx / H) * 1.1, -YAW_MAX, YAW_MAX);
  state.aim.power = clamp(d.power0 + dy / (H * 0.55), 0, 1);
});

canvas.addEventListener('pointerup', (e) => {
  const d = state.drag;
  if (!d || e.pointerId !== d.id) return;
  state.drag = null;
  document.body.classList.remove('dragging');
  throwBall();
});

canvas.addEventListener('pointercancel', cancelDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (state.phase !== 'play') return;
    state.aim.arc = clamp(state.aim.arc - Math.sign(e.deltaY) * 2, ARC_MIN, ARC_MAX);
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
  const fine = e.shiftKey ? 4 : 1;
  const aim = state.aim;
  switch (e.key) {
    case 'Escape':
      cancelDrag();
      break;
    case ' ':
      e.preventDefault();
      if (!state.drag) throwBall();
      break;
    case 'ArrowLeft':
      aim.yaw = clamp(aim.yaw - 0.0087 * fine, -YAW_MAX, YAW_MAX);
      break;
    case 'ArrowRight':
      aim.yaw = clamp(aim.yaw + 0.0087 * fine, -YAW_MAX, YAW_MAX);
      break;
    case 'ArrowUp':
      e.preventDefault();
      aim.power = clamp(aim.power + 0.005 * fine, 0, 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      aim.power = clamp(aim.power - 0.005 * fine, 0, 1);
      break;
    case 'w':
    case 'W':
      aim.arc = clamp(aim.arc + fine, ARC_MIN, ARC_MAX);
      break;
    case 's':
    case 'S':
      aim.arc = clamp(aim.arc - fine, ARC_MIN, ARC_MAX);
      break;
    case 't':
    case 'T':
      cycleGuide();
      break;
    case 'm':
    case 'M':
      toggleSound();
      break;
    default:
  }
});

function cycleGuide() {
  const i = GUIDE_MODES.indexOf(state.guideMode);
  state.guideMode = GUIDE_MODES[(i + 1) % GUIDE_MODES.length];
  $('btn-traj').textContent = GUIDE_LABELS[state.guideMode];
}

function toggleSound() {
  sound.setMuted(!sound.muted);
  $('btn-sound').textContent = sound.muted ? 'Sound: Off' : 'Sound: On';
}

$('btn-traj').addEventListener('click', cycleGuide);
$('btn-arc-up').addEventListener('click', () => (state.aim.arc = clamp(state.aim.arc + 2, ARC_MIN, ARC_MAX)));
$('btn-arc-down').addEventListener('click', () => (state.aim.arc = clamp(state.aim.arc - 2, ARC_MIN, ARC_MAX)));
// Release focus after a click so Space keeps throwing instead of re-pressing the button.
for (const b of document.querySelectorAll('.controls button')) b.addEventListener('click', () => b.blur());
$('btn-sound').addEventListener('click', () => {
  sound.init();
  toggleSound();
});

window.addEventListener('resize', resize);

// ------------------------------------------------------------------ boot

const startLevel = params.get('level') === '2' ? 2 : 1;
if (startLevel === 2) state.score = LEVEL_BASE[2];
loadLevel(startLevel);
resize();
if (startLevel === 1) {
  showTitle();
} else {
  showOverlay(`
    <div class="kicker">Level 2</div>
    <h2>Casa Marea</h2>
    <p>Straight to the beach house. Sink ten more baskets to finish your stay.</p>
    <div class="actions"><button type="button" class="primary" id="btn-start">Start</button></div>
  `);
  $('btn-start').addEventListener('click', () => {
    sound.init();
    sound.startAmbience(state.level.ambience);
    state.phase = 'play';
    hideOverlay();
  });
}
requestAnimationFrame(frame);

// Small hook for automated play-testing from the console.
window.__trashketball = {
  state,
  renderer,
  aim(yawDeg, power, arc) {
    state.aim.yaw = THREE.MathUtils.degToRad(yawDeg);
    state.aim.power = power;
    if (arc) state.aim.arc = arc;
  },
  throw: throwBall,
  /** Advance the game by `seconds` of simulated time (works while the tab is hidden). */
  step(seconds, render = false) {
    for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
    if (render) renderer.render(state.level.scene, camera);
  },
  predict() {
    computeLaunch();
    const r = state.world.predict(launchPos, launchVel, 3.5, predictBuf, 4);
    return r.hit && { x: r.hit.x, y: r.hit.y, z: r.hit.z, tag: r.hit.collider.tag };
  },
};
