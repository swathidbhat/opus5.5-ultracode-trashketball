// Level 2: an oceanfront beach house at golden hour. Double-height living room,
// floor-to-ceiling glass onto a teak deck, sand, surf and a low sun.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder } from './builder.js';
import { LatheCollider } from '../physics.js';
import * as T from '../textures.js';
import { createWovenBin } from '../bins.js';

const ROOM = { x0: -5.5, x1: 5.5, z0: -10, z1: 3, h: 5.8 };
const SUN_DIR = new THREE.Vector3(-0.42, 0.3, -1).normalize();
const SHORE_Z = -54;
const SAND_TOP = -1.8;
const SEA_Y = -2.2;
const TABLE = { x: 0.15, z: -5.0 };

const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
`;

const GLSL_SKY = /* glsl */ `
  vec3 skyColor(vec3 d, vec3 sunDir) {
    float h = d.y;
    vec3 zenith = vec3(0.05, 0.16, 0.46);
    vec3 mid = vec3(0.2, 0.4, 0.72);
    vec3 horizon = vec3(0.95, 0.6, 0.4);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zenith, smoothstep(0.2, 0.85, h));
    float sd = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.55, 0.26) * pow(sd, 5.0) * 0.6;
    col += vec3(1.0, 0.8, 0.55) * pow(sd, 90.0) * 1.6;
    if (h < 0.0) col = mix(horizon, vec3(0.5, 0.55, 0.58), smoothstep(0.0, -0.15, h));
    return col;
  }
`;

export function buildBeach({ renderer, world }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2c9a0);
  const B = new Builder(scene, world);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const cx = 0;
  const cz = (ROOM.z0 + ROOM.z1) / 2;

  // ------------------------------------------------------------ outside
  const sky = buildSky(scene);
  const ocean = buildOcean(scene);
  buildShore(B);

  // ------------------------------------------------------------ interior shell
  const oak = T.plankTexture({ base: [214, 182, 140], repeat: [W / 1.6, D / 1.6], seed: 4 });
  const floorMat = new THREE.MeshStandardMaterial({ map: oak, roughness: 0.42, metalness: 0 });
  B.mesh(new THREE.PlaneGeometry(W, D), floorMat, { x: cx, z: cz, rx: -Math.PI / 2, cast: false });
  B.solid({ x: 0, y: -0.5, z: -4, w: 30, h: 1, d: 30, e: 0.45, mu: 0.3, tag: 'wood' });

  const plaster = T.paintedWall([243, 238, 229], [3, 2], 9);
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 });
  const wallSurface = { e: 0.35, mu: 0.4, tag: 'wall' };
  B.box(0.12, ROOM.h, D, wallMat, { x: ROOM.x0 - 0.06, z: cz, cast: false, solid: wallSurface });
  B.box(0.12, ROOM.h, D, wallMat, { x: ROOM.x1 + 0.06, z: cz, cast: false, solid: wallSurface });
  B.box(W, ROOM.h, 0.12, wallMat, { x: cx, z: ROOM.z1 + 0.06, cast: false, solid: wallSurface });
  B.mesh(new THREE.PlaneGeometry(W, D), wallMat, { x: cx, y: ROOM.h, z: cz, rx: Math.PI / 2, cast: false });
  B.solid({ x: 0, y: ROOM.h + 0.5, z: -4, w: 30, h: 1, d: 30, e: 0.3, mu: 0.4, tag: 'ceiling' });

  // Exposed timber beams.
  const beamMat = new THREE.MeshStandardMaterial({ map: T.plankTexture({ S: 512, plankCount: 2, base: [132, 98, 68], spread: 18, seed: 9 }), roughness: 0.7 });
  for (let z = ROOM.z0 + 0.9; z < ROOM.z1; z += 1.8) {
    B.box(W, 0.26, 0.18, beamMat, { x: cx, y: ROOM.h - 0.26, z, cast: false });
  }

  // Floor-to-ceiling window wall.
  const bronze = new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.6, roughness: 0.45 });
  const panes = 6;
  for (let i = 0; i <= panes; i++) {
    const x = ROOM.x0 + (W * i) / panes;
    B.box(0.07, ROOM.h, 0.12, bronze, { x, z: ROOM.z0, receive: false });
  }
  B.box(W, 0.07, 0.12, bronze, { x: cx, y: 3.1, z: ROOM.z0, receive: false });
  B.box(W, 0.05, 0.14, bronze, { x: cx, y: 0, z: ROOM.z0, cast: false });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xeaf4f6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.2 });
  const glassMesh = B.mesh(new THREE.PlaneGeometry(W, ROOM.h), glass, { x: cx, y: ROOM.h / 2, z: ROOM.z0, cast: false, receive: false });
  glassMesh.renderOrder = 2;
  B.solid({ x: cx, y: ROOM.h / 2, z: ROOM.z0 - 0.02, w: W, h: ROOM.h, d: 0.06, e: 0.5, mu: 0.2, tag: 'glass' });

  // ------------------------------------------------------------ lights
  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0xe8cfa8, 1.0));
  const sun = new THREE.DirectionalLight(0xffcf94, 4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(30).add(new THREE.Vector3(0, 0, -5));
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 5, far: 60 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ------------------------------------------------------------ furniture
  buildIsland(B);

  const rug = T.juteTexture();
  B.box(4.6, 0.012, 3.6, new THREE.MeshStandardMaterial({ map: rug, roughness: 1 }), {
    x: TABLE.x - 0.5,
    z: TABLE.z,
    cast: false,
    solid: { e: 0.22, mu: 0.8, tag: 'rug', first: true },
  });

  const boucle = T.boucleTextures([236, 229, 216], [5, 5]);
  const boucleMat = new THREE.MeshPhysicalMaterial({
    map: boucle.map,
    bumpMap: boucle.bump,
    bumpScale: 3,
    roughness: 0.95,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff),
  });
  curvedSofa(B, boucleMat);

  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x8a3f26, roughness: 0.78, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffa27a) });
  barrelChair(B, velvet, 2.15, -4.25);
  barrelChair(B, velvet, 2.15, -5.95);

  coffeeTable(B);
  sideTable(B, 2.55, -5.1);
  daybed(B, boucleMat);
  const floorLamp = arcLamp(B);

  const pendant = rattanPendant(B, scene);

  fiddleLeaf(B, -4.6, -8.9);
  birdOfParadise(B, 4.6, -8.7);
  artwork(B);
  shelves(B);

  // ------------------------------------------------------------ bin
  const bin = createWovenBin();
  scene.add(bin.group);
  world.add(bin.collider);

  return {
    id: 2,
    scene,
    theme: 'beach',
    tag: 'Level 2',
    name: 'Casa Marea',
    sub: 'Oceanfront beach house · 5★ stay',
    exposure: 0.78,
    camera: { x: 0, y: 1.62, z: 0.85, pitch: -0.13, fov: 64 },
    arc: 48,
    hand: new THREE.Vector3(0.15, -0.21, -0.52),
    ball: { lineColor: null, tint: '#f5eee2' },
    guideColor: 0xff6b3d,
    bin,
    binArea: { x0: -1.0, x1: 2.0, z0: -7.9, z1: -2.9 },
    binAvoid: [
      { x: TABLE.x, z: TABLE.z, r: 0.95 },
      { x: 2.15, z: -4.25, r: 0.65 },
      { x: 2.15, z: -5.95, r: 0.65 },
      { x: 2.55, z: -5.1, r: 0.4 },
      { x: -1.35, z: -3.4, r: 0.6 },
      { x: -1.35, z: -6.6, r: 0.6 },
      { x: 0, z: -9.2, r: 0.9 },
      { x: 3.6, z: -6.9, r: 0.4 },
    ],
    firstBin: { x: 0.9, z: -3.4 },
    ambience: 'beach',
    messages: {
      score: ['Swish.', 'Five stars.', 'Superhost energy.', 'Nothing but wicker.', "Chef's kiss.", 'Ocean view, perfect shot.', 'Mimosa earned.', 'Vacation mode: on.'],
      miss: ["That's going in the review.", 'Check-out is at eleven.', 'The sofa survived.', 'Sandy fingers.', 'Blame the sea breeze.'],
      streak: (n) => `${n} in a row. Book it again.`,
    },
    onImpact(ev) {
      if (ev.collider === pendant.collider) pendant.push(ev.speed);
    },
    update(dt, t) {
      sky.material.uniforms.time.value = t;
      ocean.material.uniforms.time.value = t;
      for (const p of scene.userData.palms) {
        for (const f of p.children) {
          if (!f.userData.frond) continue;
          f.rotation.z = f.userData.el + Math.sin(t * 1.1 + f.userData.phase) * 0.035;
        }
      }
      pendant.update(dt);
      floorLamp.update(t);
    },
  };
}

// ------------------------------------------------------------------ sky & sea

function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN_DIR }, time: { value: 0 } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d, sunDir);
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(12.0, 9.0, 6.0) * smoothstep(0.99955, 0.99975, sd);
        float h = d.y;
        vec2 uv = d.xz / (h + 0.12) * 0.7 + vec2(time * 0.006, time * 0.002);
        float c = smoothstep(0.5, 0.82, fbm(uv * 1.4));
        c *= smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.55, 0.9, h));
        vec3 cloud = mix(vec3(0.95, 0.78, 0.72), vec3(1.2, 0.72, 0.45), pow(sd, 3.0));
        col = mix(col, cloud, c * 0.75);
        // Push saturation a little so the golden hour survives tone mapping.
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, 1.25) * 0.85;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), mat);
  // Drawn after the interior so the depth test skips every pixel the room already covers.
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function buildOcean(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN_DIR }, time: { value: 0 }, shoreZ: { value: SHORE_Z } },
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float time;
      uniform float shoreZ;
      varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      vec2 wave(vec2 p, vec2 dir, float freq, float amp, float speed) {
        dir = normalize(dir);
        float ph = dot(p, dir) * freq - time * speed;
        return dir * (amp * freq * cos(ph));
      }
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec2 p = vWorld.xz;
        vec2 g = vec2(0.0);
        g += wave(p, vec2(0.15, 1.0), 0.32, 0.22, 1.1);
        g += wave(p, vec2(-0.35, 1.0), 0.55, 0.12, 1.5);
        g += wave(p, vec2(0.6, 0.8), 1.1, 0.05, 2.2);
        g += wave(p, vec2(-0.8, 0.5), 1.9, 0.025, 2.9);
        g += (vec2(noise(p * 1.7 + time * 0.6), noise(p * 1.7 - time * 0.5 + 7.0)) - 0.5) * 0.18;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(60.0, 900.0, dist) * 0.8));
        float ndv = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyColor(normalize(R), sunDir) * 0.75;
        float shallow = smoothstep(shoreZ - 60.0, shoreZ, vWorld.z);
        vec3 body = mix(vec3(0.003, 0.04, 0.09), vec3(0.01, 0.2, 0.24), shallow);
        vec3 col = mix(body, refl, F * 0.9);
        float s = max(dot(R, sunDir), 0.0);
        col += vec3(1.0, 0.78, 0.5) * (pow(s, 700.0) * 30.0 + pow(s, 80.0) * 0.8);
        float dz = vWorld.z - shoreZ;
        if (dz > -24.0) {
          float n = fbm(p * 0.3 + vec2(0.0, time * 0.12));
          float swash = sin(dz * 0.5 + time * 1.1 + n * 5.0);
          float foam = smoothstep(0.8, 1.0, swash) * smoothstep(-22.0, -3.0, dz) + smoothstep(-3.0, 0.0, dz);
          foam *= 0.55 + 0.45 * n;
          col = mix(col, vec3(0.92, 0.94, 0.95), clamp(foam, 0.0, 1.0) * 0.85);
        }
        vec3 haze = skyColor(normalize(vec3(-V.x, 0.015, -V.z)), sunDir);
        col = mix(col, haze * 0.85, smoothstep(400.0, 3500.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 4500), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, SEA_Y, -2250 - 20);
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Distant headlands on the horizon.
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x9aa7a6, fog: false });
  const hill = (x, z, sx, sy, sz) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), hillMat);
    m.position.set(x, SEA_Y - sy * 0.25, z);
    m.scale.set(sx, sy, sz);
    scene.add(m);
  };
  hill(2300, -3400, 1100, 170, 500);
  hill(3000, -3000, 600, 110, 300);
  hill(-3200, -3600, 900, 90, 400);
  return mesh;
}

function buildShore(B) {
  const scene = B.scene;
  // Teak deck continuing the floor outside.
  const teak = T.plankTexture({ S: 512, plankCount: 6, base: [150, 104, 70], spread: 30, repeat: [14, 3], seed: 12, seam: 0.4 });
  const teakMat = new THREE.MeshStandardMaterial({ map: teak, roughness: 0.7 });
  B.mesh(new THREE.PlaneGeometry(26, 4.6), teakMat, { x: 0, y: 0, z: ROOM.z0 - 2.3, rx: -Math.PI / 2, cast: false });
  B.box(26, 1.8, 0.2, teakMat, { x: 0, y: -1.8, z: ROOM.z0 - 4.7, cast: false });
  // Glass balustrade.
  const railGlass = new THREE.MeshStandardMaterial({ color: 0xdff0f2, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
  B.mesh(new THREE.PlaneGeometry(26, 1.0), railGlass, { x: 0, y: 0.5, z: ROOM.z0 - 4.55, cast: false, receive: false });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc7c9c7, metalness: 0.9, roughness: 0.3 });
  B.box(26, 0.04, 0.06, steel, { x: 0, y: 1.0, z: ROOM.z0 - 4.55, cast: false });

  // Deck loungers.
  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.8 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x8c6a4a, roughness: 0.6 });
  for (const x of [-3.2, 3.2]) {
    const g = new THREE.Group();
    g.position.set(x, 0, ROOM.z0 - 2.4);
    g.rotation.y = x < 0 ? 0.25 : -0.25;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 1.9), frame);
    base.position.y = 0.14;
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.1, 1.3, 3, 0.04), white);
    pad.position.set(0, 0.33, -0.25);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.1, 0.75, 3, 0.04), white);
    back.position.set(0, 0.55, 0.62);
    back.rotation.x = -0.75;
    g.add(base, pad, back);
    scene.add(g);
  }

  // Sand sloping down to the waterline.
  const sandLen = 120;
  const sandMat = new THREE.MeshStandardMaterial({ map: T.sandTexture([80, 24]), roughness: 1 });
  const sand = B.mesh(new THREE.PlaneGeometry(400, sandLen), sandMat, { x: 0, cast: false });
  const slope = (SEA_Y - SAND_TOP) / (SHORE_Z - (ROOM.z0 - 4.7));
  sand.rotation.x = -Math.PI / 2 - Math.atan(slope);
  const zMid = ROOM.z0 - 4.7 - sandLen / 2;
  sand.position.set(0, SAND_TOP + slope * (zMid - (ROOM.z0 - 4.7)), zMid);

  // Palms.
  const frondTex = T.frondTexture();
  const barkTex = T.barkTexture();
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
  scene.userData.palms = [];
  const sandY = (z) => SAND_TOP + slope * (z - (ROOM.z0 - 4.7));
  const spots = [
    [-8.5, -19, 7.5, 1.6, 0.4],
    [7.8, -21, 8.5, -1.9, 2.6],
    [12.5, -31, 9.5, -1.2, 2.0],
    [-13, -30, 8.0, 1.4, 0.9],
    [-19, -40, 9.0, 1.0, 0.2],
  ];
  const rand = T.rng(3);
  for (const [x, z, h, lean, rot] of spots) {
    scene.userData.palms.push(palm(scene, x, sandY(z), z, h, lean, rot, frondMat, barkMat, rand));
  }
}

function palm(scene, x, y, z, h, lean, rot, frondMat, barkMat, rand) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.1, h * 0.6, 0), new THREE.Vector3(lean, h, 0));
  const seg = 24;
  const radial = 10;
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, p);
    const r = 0.2 - 0.08 * t + 0.12 * Math.pow(1 - t, 8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(p).multiplyScalar(r).add(p);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, barkMat);
  g.add(trunk);

  const top = curve.getPointAt(1);
  const count = 13;
  for (let i = 0; i < count; i++) {
    const L = 2.3 + rand() * 0.9;
    const fg = new THREE.PlaneGeometry(L, 0.75, 14, 2);
    fg.translate(L / 2, 0, 0);
    fg.rotateX(-Math.PI / 2);
    const fp = fg.attributes.position;
    for (let k = 0; k < fp.count; k++) {
      const fx = fp.getX(k);
      const fz = fp.getZ(k);
      const droop = 0.55 * Math.pow(fx / L, 2) * L * 0.5;
      fp.setY(k, -droop - Math.abs(fz) * 0.35);
    }
    fg.computeVertexNormals();
    const f = new THREE.Mesh(fg, frondMat);
    f.position.copy(top);
    f.rotation.order = 'YZX';
    const el = 0.35 - rand() * 0.75;
    f.rotation.y = (i / count) * Math.PI * 2 + rand() * 0.3;
    f.rotation.z = el;
    f.userData = { frond: true, el, phase: rand() * 6 };
    g.add(f);
  }
  scene.add(g);
  return g;
}

// ------------------------------------------------------------------ furniture

function smoothGeometry(geo) {
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  geo.dispose();
  return merged;
}

/** An annular sector extruded upward with soft rounded edges. Angles are shape angles. */
function sectorGeometry(rIn, rOut, a0, a1, height, bevel) {
  const s = new THREE.Shape();
  const ri = Math.max(0.001, rIn + bevel);
  const ro = rOut - bevel;
  const da = bevel / ((rIn + rOut) / 2);
  s.absarc(0, 0, ro, a0 + da, a1 - da, false);
  if (rIn <= 0) s.lineTo(0, 0);
  else s.absarc(0, 0, ri, a1 - da, a0 + da, true);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 64,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return smoothGeometry(geo);
}

function discGeometry(r, height, bevel) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r - bevel, 0, Math.PI * 2, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return smoothGeometry(geo);
}

const fabricSurface = { e: 0.15, mu: 0.8, tag: 'fabric' };

function curvedSofa(B, boucleMat) {
  const a0 = THREE.MathUtils.degToRad(126);
  const a1 = THREE.MathUtils.degToRad(234);
  const g = new THREE.Group();
  g.position.set(TABLE.x, 0, TABLE.z);
  B.scene.add(g);
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x6e5238, roughness: 0.6 });
  const add = (geo, mat, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(sectorGeometry(1.85, 2.58, a0 + 0.02, a1 - 0.02, 0.12, 0.01), plinthMat);
  const n = 3;
  const gap = 0.012;
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n + gap;
    const s1 = a0 + ((a1 - a0) * (i + 1)) / n - gap;
    add(sectorGeometry(1.7, 2.42, s0, s1, 0.3, 0.075), boucleMat, 0.12);
  }
  add(sectorGeometry(2.34, 2.68, a0, a1, 0.74, 0.11), boucleMat, 0.1);

  // Throw pillows leaning against the back.
  const colors = [0x9aa889, 0xc9774e, 0x2f4458, 0xe8dcc5, 0x9aa889];
  const pillowGeo = new RoundedBoxGeometry(0.46, 0.44, 0.14, 4, 0.07);
  colors.forEach((c, i) => {
    const a = a0 + ((a1 - a0) * (i + 0.6)) / (colors.length + 0.2);
    const r = 2.2;
    const p = new THREE.Mesh(pillowGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    p.position.set(Math.cos(a) * r, 0.62, -Math.sin(a) * r);
    p.rotation.order = 'YXZ';
    p.rotation.y = a - Math.PI / 2;
    p.rotation.x = -0.25;
    p.rotation.z = (Math.random() - 0.5) * 0.2;
    p.castShadow = true;
    g.add(p);
  });

  const slices = 6;
  for (let i = 0; i < slices; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / slices;
    const da = (a1 - a0) / slices;
    const seatR = 2.06;
    const backR = 2.51;
    B.solid({ x: TABLE.x + Math.cos(a) * seatR, y: 0.21, z: TABLE.z - Math.sin(a) * seatR, w: 0.72, h: 0.42, d: 2 * seatR * Math.sin(da / 2) + 0.04, rotY: a, ...fabricSurface });
    B.solid({ x: TABLE.x + Math.cos(a) * backR, y: 0.42, z: TABLE.z - Math.sin(a) * backR, w: 0.34, h: 0.84, d: 2 * backR * Math.sin(da / 2) + 0.04, rotY: a, ...fabricSurface });
  }
}

function barrelChair(B, velvet, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dx = TABLE.x - x;
  const dz = TABLE.z - z;
  const len = Math.hypot(dx, dz);
  const theta = Math.atan2(dz / len, -dx / len);
  g.rotation.y = theta;
  B.scene.add(g);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.3 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 48), brass);
  plinth.position.y = 0.03;
  const base = new THREE.Mesh(discGeometry(0.4, 0.2, 0.04), velvet);
  base.position.y = 0.06;
  const seat = new THREE.Mesh(discGeometry(0.4, 0.16, 0.07), velvet);
  seat.position.y = 0.25;
  const span = THREE.MathUtils.degToRad(118);
  const back = new THREE.Mesh(sectorGeometry(0.3, 0.46, -span, span, 0.56, 0.06), velvet);
  back.position.y = 0.24;
  for (const m of [plinth, base, seat, back]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  const seatCol = B.world.add(
    new LatheCollider({
      points: [
        [0, 0.41],
        [0.4, 0.41],
        [0.4, 0],
      ],
      thickness: 0.01,
      ...fabricSurface,
    }),
  );
  seatCol.setPosition(x, 0, z);
  for (let i = 0; i < 4; i++) {
    const a = -span + ((2 * span) * (i + 0.5)) / 4 + theta;
    const r = 0.38;
    B.solid({ x: x + Math.cos(a) * r, y: 0.4, z: z - Math.sin(a) * r, w: 0.16, h: 0.8, d: 0.36, rotY: a, ...fabricSurface });
  }
}

function coffeeTable(B) {
  const trav = T.travertineTexture([1, 1]);
  const mat = new THREE.MeshStandardMaterial({ map: trav, roughness: 0.55 });
  const top = B.mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 72), mat, { x: TABLE.x, y: 0.435, z: TABLE.z });
  const ped = B.mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.4, 48), mat, { x: TABLE.x, y: 0.2, z: TABLE.z });
  top.castShadow = ped.castShadow = true;
  const col = B.world.add(
    new LatheCollider({
      points: [
        [0, 0.47],
        [0.62, 0.47],
        [0.62, 0.4],
        [0.34, 0.4],
        [0.4, 0],
      ],
      thickness: 0.004,
      e: 0.45,
      mu: 0.3,
      tag: 'stone',
    }),
  );
  col.setPosition(TABLE.x, 0, TABLE.z);

  // Styling: books, a ceramic vase with pampas.
  const bookColors = [0x2f4458, 0xd9cbb2, 0xb4643e];
  bookColors.forEach((c, i) => {
    B.box(0.34 - i * 0.03, 0.035, 0.26 - i * 0.02, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), {
      x: TABLE.x + 0.18,
      y: 0.47 + i * 0.035,
      z: TABLE.z + 0.12,
      ry: 0.3 + i * 0.12,
    });
  });
  const vaseProfile = [
    [0, 0],
    [0.07, 0],
    [0.1, 0.06],
    [0.095, 0.14],
    [0.05, 0.22],
    [0.035, 0.27],
    [0.045, 0.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const vase = B.mesh(new THREE.LatheGeometry(vaseProfile, 40), new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.65 }), { x: TABLE.x - 0.22, y: 0.47, z: TABLE.z - 0.1 });
  vase.castShadow = true;
  const plume = new THREE.MeshStandardMaterial({ color: 0xe2cfa9, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const stem = B.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 5), plume, { x: TABLE.x - 0.22 + Math.cos(a) * 0.05, y: 0.47 + 0.55, z: TABLE.z - 0.1 + Math.sin(a) * 0.05 });
    stem.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    const head = B.mesh(new THREE.SphereGeometry(1, 12, 10), plume, { x: stem.position.x - Math.cos(a) * 0.12, y: 0.47 + 0.92, z: stem.position.z - Math.sin(a) * 0.12 });
    head.scale.set(0.05, 0.2, 0.05);
    head.rotation.copy(stem.rotation);
  }
}

function sideTable(B, x, z) {
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8924f, metalness: 1, roughness: 0.28 });
  B.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 40), brass, { x, y: 0.55, z });
  B.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.54, 12), brass, { x, y: 0.27, z });
  B.mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 40), brass, { x, y: 0.01, z });
  const col = B.world.add(
    new LatheCollider({
      points: [
        [0, 0.565],
        [0.24, 0.565],
        [0.24, 0.54],
        [0.02, 0.54],
        [0.02, 0],
      ],
      thickness: 0.004,
      e: 0.4,
      mu: 0.25,
      tag: 'metal',
    }),
  );
  col.setPosition(x, 0, z);
  // A glass of something cold.
  B.mesh(
    new THREE.CylinderGeometry(0.035, 0.03, 0.12, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xf6c9a8, transparent: true, opacity: 0.55, roughness: 0.05 }),
    { x: x + 0.06, y: 0.625, z: z - 0.04 },
  );
}

function daybed(B, boucleMat) {
  const z = ROOM.z0 + 0.85;
  const oakMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3e, roughness: 0.55 });
  B.box(4.2, 0.12, 0.86, oakMat, { x: 0, z, solid: { e: 0.3, mu: 0.4, tag: 'wood' } });
  B.box(4.1, 0.26, 0.82, boucleMat, { x: 0, y: 0.12, z, round: 0.08, solid: fabricSurface });
  const linen = new THREE.MeshStandardMaterial({ color: 0xd8ccb8, roughness: 0.95 });
  for (const s of [-1, 1]) {
    const bolster = B.mesh(new THREE.CapsuleGeometry(0.12, 0.62, 8, 20), linen, { x: s * 1.85, y: 0.5, z, rz: 0, rx: Math.PI / 2 });
    bolster.rotation.set(Math.PI / 2, 0, 0);
  }
  const throwMat = new THREE.MeshStandardMaterial({ color: 0x3c5a6e, roughness: 1 });
  B.box(0.9, 0.03, 0.84, throwMat, { x: 0.9, y: 0.38, z, ry: 0.05, round: 0.012 });
}

function buildIsland(B) {
  const marble = T.marbleTexture();
  const topMat = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18, metalness: 0 });
  const fluted = T.flutedTexture([16, 1]);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.6, bumpMap: fluted, bumpScale: 3 });
  const iz = -0.08;
  B.box(2.8, 0.05, 1.0, topMat, { x: 0, y: 0.9, z: iz, round: 0.012, solid: { e: 0.45, mu: 0.25, tag: 'stone' } });
  B.box(2.66, 0.9, 0.86, bodyMat, { x: 0, z: iz, solid: { e: 0.4, mu: 0.3, tag: 'wood' } });

  // Bowl of lemons.
  const bowlProfile = [
    [0, 0],
    [0.08, 0],
    [0.16, 0.05],
    [0.19, 0.11],
    [0.18, 0.11],
    [0.15, 0.055],
    [0.0, 0.015],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = B.mesh(new THREE.LatheGeometry(bowlProfile, 40), new THREE.MeshStandardMaterial({ color: 0x2f4458, roughness: 0.35, side: THREE.DoubleSide }), { x: -0.7, y: 0.95, z: -0.3 });
  bowl.castShadow = true;
  const lemon = new THREE.MeshStandardMaterial({ color: 0xf2c93a, roughness: 0.5 });
  const spots = [
    [0.0, 0.07, 0.0],
    [0.07, 0.06, 0.04],
    [-0.06, 0.06, 0.05],
    [0.04, 0.06, -0.07],
    [-0.05, 0.13, -0.02],
  ];
  for (const [x, y, z] of spots) {
    const l = B.mesh(new THREE.SphereGeometry(0.042, 18, 14), lemon, { x: -0.7 + x, y: 0.95 + y, z: -0.3 + z });
    l.scale.set(1, 0.85, 1.25);
    l.rotation.y = x * 20;
  }
  // A few sheets of paper, waiting to be crumpled.
  const paper = new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.9 });
  for (let i = 0; i < 3; i++) B.box(0.21, 0.004, 0.297, paper, { x: 0.62 + i * 0.01, y: 0.95 + i * 0.004, z: -0.34 + i * 0.012, ry: 0.2 + i * 0.1 });
}

function arcLamp(B) {
  const brass = new THREE.MeshStandardMaterial({ color: 0xbd9754, metalness: 1, roughness: 0.25 });
  const marble = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.3 });
  const bx = 3.7;
  const bz = -7.0;
  B.mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 36), marble, { x: bx, y: 0.03, z: bz });
  const end = new THREE.Vector3(2.35, 2.05, -5.2);
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(bx, 0.05, bz), new THREE.Vector3(bx, 2.2, bz), new THREE.Vector3(bx - 0.2, 2.7, bz + 0.5), end.clone().add(new THREE.Vector3(0, 0.15, 0)));
  B.mesh(new THREE.TubeGeometry(curve, 48, 0.014, 8, false), brass, {});
  const shade = B.mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbd9754, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }), {
    x: end.x,
    y: end.y,
    z: end.z,
  });
  const bulb = B.mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3 }), { x: end.x, y: end.y - 0.02, z: end.z, cast: false });
  const light = new THREE.PointLight(0xffc98a, 2.5, 5, 2);
  light.position.set(end.x, end.y - 0.1, end.z);
  B.scene.add(light);
  B.solid({ x: bx, y: 0.03, z: bz, w: 0.4, h: 0.06, d: 0.4, e: 0.3, mu: 0.4, tag: 'stone' });
  return {
    update(t) {
      light.intensity = 2.5 + Math.sin(t * 7.3) * 0.02;
      bulb.material.emissiveIntensity = 3;
      shade.rotation.y = 0;
    },
  };
}

function rattanPendant(B, scene) {
  const top = ROOM.h;
  const pivot = new THREE.Group();
  pivot.position.set(TABLE.x, top, TABLE.z);
  scene.add(pivot);
  const drop = 2.35;
  const R = 0.5;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, drop - R, 6), new THREE.MeshStandardMaterial({ color: 0x2a2320 }));
  cord.position.y = -(drop - R) / 2;
  pivot.add(cord);
  const lattice = T.rattanLattice([7, 3]);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 32),
    new THREE.MeshStandardMaterial({ map: lattice.map, alphaMap: lattice.alpha, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
  );
  globe.position.y = -drop;
  globe.castShadow = true;
  pivot.add(globe);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 4 }));
  bulb.position.y = -drop;
  pivot.add(bulb);
  const light = new THREE.PointLight(0xffb870, 5, 9, 2);
  light.position.y = -drop;
  pivot.add(light);

  const profile = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    profile.push([Math.sin(a) * R, -Math.cos(a) * R]);
  }
  const collider = B.world.add(new LatheCollider({ points: profile, thickness: 0.01, e: 0.3, mu: 0.5, tag: 'wicker' }));
  collider.setPosition(TABLE.x, top - drop, TABLE.z);

  let angle = 0;
  let vel = 0;
  const axis = new THREE.Vector3(1, 0, 0.3).normalize();
  return {
    collider,
    push(speed) {
      vel += Math.min(0.5, speed * 0.05);
    },
    update(dt) {
      const w2 = 9.81 / drop;
      vel += (-w2 * angle - 0.35 * vel) * dt;
      angle += vel * dt;
      pivot.quaternion.setFromAxisAngle(axis, angle);
    },
  };
}

function leafShape(len, half) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(half * 0.9, len * 0.12, half * 1.1, len * 0.55, half * 0.8, len * 0.8);
  s.bezierCurveTo(half * 0.55, len * 0.98, half * 0.1, len, 0, len);
  s.bezierCurveTo(-half * 0.1, len, -half * 0.55, len * 0.98, -half * 0.8, len * 0.8);
  s.bezierCurveTo(-half * 1.1, len * 0.55, -half * 0.9, len * 0.12, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, 0.35 * Math.pow(y / len, 2) * len - Math.abs(x) * 0.35);
  }
  geo.computeVertexNormals();
  return geo;
}

function pot(B, x, z, r, h, color) {
  const profile = [
    [0, 0],
    [r * 0.78, 0],
    [r, h * 0.85],
    [r * 1.02, h],
    [r * 0.92, h],
    [r * 0.9, h * 0.9],
    [0, h * 0.9],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const m = B.mesh(new THREE.LatheGeometry(profile, 48), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), { x, z });
  const col = B.world.add(
    new LatheCollider({
      points: [
        [0, h * 0.9],
        [r, h],
        [r * 0.78, 0],
      ],
      thickness: 0.01,
      e: 0.35,
      mu: 0.4,
      tag: 'stone',
    }),
  );
  col.setPosition(x, 0, z);
  return m;
}

function fiddleLeaf(B, x, z) {
  pot(B, x, z, 0.36, 0.62, 0xe9e4da);
  const bark = new THREE.MeshStandardMaterial({ color: 0x6d5a45, roughness: 0.9 });
  B.mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.9, 8), bark, { x, y: 0.56 + 0.95, z });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5a2b, roughness: 0.45, side: THREE.DoubleSide });
  const geos = [leafShape(0.34, 0.12), leafShape(0.28, 0.1), leafShape(0.4, 0.14)];
  const rand = T.rng(19);
  for (let i = 0; i < 52; i++) {
    const y = 1.0 + rand() * 1.55;
    const l = new THREE.Mesh(geos[i % 3], leafMat);
    l.position.set(x + (rand() - 0.5) * 0.12, y, z + (rand() - 0.5) * 0.12);
    l.rotation.order = 'YXZ';
    l.rotation.y = rand() * Math.PI * 2;
    l.rotation.x = 0.7 + rand() * 0.9;
    l.rotation.z = (rand() - 0.5) * 0.6;
    l.castShadow = true;
    B.scene.add(l);
  }
}

function birdOfParadise(B, x, z) {
  pot(B, x, z, 0.32, 0.55, 0xb9876a);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3c, roughness: 0.7 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 0.5, side: THREE.DoubleSide });
  const blade = leafShape(0.75, 0.16);
  const rand = T.rng(29);
  for (let i = 0; i < 11; i++) {
    const az = rand() * Math.PI * 2;
    const tilt = 0.15 + rand() * 0.45;
    const len = 0.9 + rand() * 0.8;
    const stem = new THREE.Group();
    stem.position.set(x, 0.5, z);
    stem.rotation.order = 'YXZ';
    stem.rotation.set(tilt, az, 0);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, len, 6), stemMat);
    s.position.y = len / 2;
    const l = new THREE.Mesh(blade, leafMat);
    l.position.y = len - 0.05;
    l.rotation.set(0.25, 0, 0);
    l.castShadow = true;
    stem.add(s, l);
    B.scene.add(stem);
  }
}

function artwork(B) {
  const w = 2.3;
  const h = 1.72;
  const x = ROOM.x0 + 0.02;
  const y = 2.45;
  const z = -5.4;
  B.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: T.abstractArt(), roughness: 0.85 }), { x: x + 0.025, y, z, ry: Math.PI / 2, cast: false });
  const oakMat = new THREE.MeshStandardMaterial({ color: 0xb48e62, roughness: 0.6 });
  const f = 0.045;
  B.box(0.05, f, w + f * 2, oakMat, { x: x + 0.02, y: y + h / 2, z, cast: false });
  B.box(0.05, f, w + f * 2, oakMat, { x: x + 0.02, y: y - h / 2 - f, z, cast: false });
  B.box(0.05, h, f, oakMat, { x: x + 0.02, y: y - h / 2, z: z - w / 2 - f / 2, cast: false });
  B.box(0.05, h, f, oakMat, { x: x + 0.02, y: y - h / 2, z: z + w / 2 + f / 2, cast: false });
}

function shelves(B) {
  const walnut = new THREE.MeshStandardMaterial({ color: 0x5e4330, roughness: 0.5 });
  const x = ROOM.x1 - 0.16;
  const z = -3.2;
  const rand = T.rng(55);
  const decor = [0xe9e2d4, 0x2f4458, 0xc9774e, 0x9aa889, 0xd9cbb2];
  for (const y of [1.25, 1.75, 2.25]) {
    B.box(0.3, 0.04, 2.0, walnut, { x, y, z, solid: { e: 0.4, mu: 0.4, tag: 'wood' } });
    let zz = z - 0.85;
    while (zz < z + 0.85) {
      if (rand() < 0.55) {
        const n = 3 + Math.floor(rand() * 5);
        for (let i = 0; i < n; i++) {
          const h = 0.18 + rand() * 0.08;
          B.box(0.2, h, 0.035, new THREE.MeshStandardMaterial({ color: decor[Math.floor(rand() * decor.length)], roughness: 0.85 }), { x: x + 0.02, y: y + 0.04, z: zz + i * 0.037 });
        }
        zz += n * 0.037 + 0.12;
      } else {
        const r = 0.05 + rand() * 0.04;
        const v = B.mesh(new THREE.CylinderGeometry(r * 0.7, r, 0.14 + rand() * 0.12, 24), new THREE.MeshStandardMaterial({ color: decor[Math.floor(rand() * decor.length)], roughness: 0.6 }), { x, y: y + 0.12, z: zz + r });
        v.position.y = y + 0.04 + v.geometry.parameters.height / 2;
        zz += r * 2 + 0.15;
      }
    }
  }
}
