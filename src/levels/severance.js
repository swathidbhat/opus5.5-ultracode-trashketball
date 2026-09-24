// Level 1: the Macrodata Refinement floor. Vast white room, low tiled ceiling,
// green carpet, one four-desk pod with green partitions and retro terminals,
// and a doorway into an endless white hallway.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Builder } from './builder.js';
import * as T from '../textures.js';
import { createMeshBin } from '../bins.js';

const ROOM = { x0: -7, x1: 7, z0: -11, z1: 3.5, h: 2.75 };
const DOOR = { x0: 1.5, x1: 2.9, h: 2.3 };
const HALL_END = -27;

export function buildSeverance({ renderer, world }) {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0xe4ebe8);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 16, 48);
  const B = new Builder(scene, world);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2;

  // ------------------------------------------------------------ shell
  const carpet = T.carpetTextures([W / 0.75, D / 0.75]);
  const carpetMat = new THREE.MeshStandardMaterial({ map: carpet.map, bumpMap: carpet.bump, bumpScale: 1.4, roughness: 1 });
  B.mesh(new THREE.PlaneGeometry(W, D), carpetMat, { x: cx, z: cz, rx: -Math.PI / 2, cast: false });
  B.solid({ x: 0, y: -0.5, z: -8, w: 40, h: 1, d: 60, e: 0.22, mu: 0.75, tag: 'carpet' });

  const ceilMat = new THREE.MeshStandardMaterial({ map: T.ceilingTiles([W / 1.2, D / 1.2]), roughness: 0.95 });
  B.mesh(new THREE.PlaneGeometry(W, D), ceilMat, { x: cx, y: ROOM.h, z: cz, rx: Math.PI / 2, cast: false });
  B.solid({ x: 0, y: ROOM.h + 0.5, z: -8, w: 40, h: 1, d: 60, e: 0.3, mu: 0.4, tag: 'ceiling' });

  const wallMat = new THREE.MeshStandardMaterial({ map: T.paintedWall([234, 237, 233], [4, 1]), roughness: 0.93 });
  const wallSurface = { e: 0.35, mu: 0.4, tag: 'wall' };
  const H = ROOM.h;
  // Side and back walls.
  B.box(0.1, H, D, wallMat, { x: ROOM.x0 - 0.05, z: cz, cast: false, solid: wallSurface });
  B.box(0.1, H, D, wallMat, { x: ROOM.x1 + 0.05, z: cz, cast: false, solid: wallSurface });
  B.box(W, H, 0.1, wallMat, { x: cx, z: ROOM.z1 + 0.05, cast: false, solid: wallSurface });
  // Far wall with a doorway into the hallway.
  const fz = ROOM.z0 - 0.05;
  B.box(DOOR.x0 - ROOM.x0, H, 0.1, wallMat, { x: (ROOM.x0 + DOOR.x0) / 2, z: fz, cast: false, solid: wallSurface });
  B.box(ROOM.x1 - DOOR.x1, H, 0.1, wallMat, { x: (ROOM.x1 + DOOR.x1) / 2, z: fz, cast: false, solid: wallSurface });
  B.box(DOOR.x1 - DOOR.x0, H - DOOR.h, 0.1, wallMat, { x: (DOOR.x0 + DOOR.x1) / 2, y: DOOR.h, z: fz, cast: false });

  // Baseboards.
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9ddd8, roughness: 0.6 });
  B.box(W, 0.09, 0.02, trimMat, { x: cx, z: ROOM.z1 - 0.01, cast: false });
  B.box(0.02, 0.09, D, trimMat, { x: ROOM.x0 + 0.01, z: cz, cast: false });
  B.box(0.02, 0.09, D, trimMat, { x: ROOM.x1 - 0.01, z: cz, cast: false });
  B.box(DOOR.x0 - ROOM.x0, 0.09, 0.02, trimMat, { x: (ROOM.x0 + DOOR.x0) / 2, z: ROOM.z0 + 0.01, cast: false });
  B.box(ROOM.x1 - DOOR.x1, 0.09, 0.02, trimMat, { x: (ROOM.x1 + DOOR.x1) / 2, z: ROOM.z0 + 0.01, cast: false });
  // Door frame.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9cfca, roughness: 0.5 });
  B.box(0.06, DOOR.h, 0.16, frameMat, { x: DOOR.x0 + 0.03, z: ROOM.z0 - 0.04, cast: false });
  B.box(0.06, DOOR.h, 0.16, frameMat, { x: DOOR.x1 - 0.03, z: ROOM.z0 - 0.04, cast: false });
  B.box(DOOR.x1 - DOOR.x0, 0.06, 0.16, frameMat, { x: (DOOR.x0 + DOOR.x1) / 2, y: DOOR.h - 0.06, z: ROOM.z0 - 0.04, cast: false });

  buildHallway(B, wallMat);

  // ------------------------------------------------------------ lights
  const troffers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.62, 0.02, 1.22),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf3f9ff, emissiveIntensity: 2.4 }),
    24,
  );
  const m4 = new THREE.Matrix4();
  let ti = 0;
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    for (const z of [-9.4, -6.9, -4.4, -1.9, 0.6, 3.0]) {
      if (x === 4.5 && z === -6.9) continue;
      m4.makeTranslation(x, ROOM.h - 0.005, z);
      troffers.setMatrixAt(ti++, m4);
    }
  }
  troffers.count = ti;
  scene.add(troffers);
  // One tube that flickers, as they do.
  const flickerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf3f9ff, emissiveIntensity: 2.4 });
  B.mesh(new THREE.BoxGeometry(0.62, 0.02, 1.22), flickerMat, { x: 4.5, y: ROOM.h - 0.005, z: -6.9, cast: false, receive: false });

  scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x4d6f5a, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(1.2, 9, 0.5);
  key.target.position.set(0.2, 0, -4.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 20 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xeaf4ff, 6, 12, 2);
  fill.position.set(-2.3, 2.5, -4.4);
  scene.add(fill);

  // ------------------------------------------------------------ the MDR pod
  const screen = T.mdrScreen();
  buildPod(B, screen.texture);

  // ------------------------------------------------------------ foreground desk
  const laminate = new THREE.MeshStandardMaterial({ color: 0xe6e7e1, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e948f, metalness: 0.6, roughness: 0.45 });
  B.box(1.5, 0.035, 1.2, laminate, { x: 1.0, y: 0.705, z: -0.1, round: 0.008, solid: { e: 0.4, mu: 0.35, tag: 'desk' } });
  B.box(0.04, 0.705, 1.0, steel, { x: 1.7, z: -0.1 });
  // Paper tray with a stack of fresh sheets: the ammunition.
  const paperStackMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f1, roughness: 0.9 });
  const tray = B.box(0.25, 0.018, 0.33, new THREE.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.5 }), { x: 0.55, y: 0.74, z: -0.42, ry: 0.12 });
  B.box(0.21, 0.045, 0.297, paperStackMat, { x: 0.55, y: 0.758, z: -0.42, ry: 0.12 });
  tray.receiveShadow = true;
  // "The You You Are" paperback.
  const book = B.box(0.14, 0.022, 0.21, new THREE.MeshStandardMaterial({ color: 0xc8742e, roughness: 0.7 }), { x: 0.93, y: 0.74, z: -0.58, ry: -0.35 });
  book.castShadow = true;
  // Mug.
  const mug = B.mesh(new THREE.CylinderGeometry(0.04, 0.037, 0.095, 24), new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.3 }), { x: 1.22, y: 0.79, z: -0.46 });
  B.mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), mug.material, { x: 1.265, y: 0.79, z: -0.46, ry: Math.PI / 2, parent: scene });
  B.solidFrom(mug, { e: 0.35, mu: 0.3, tag: 'desk' });

  // ------------------------------------------------------------ walls: portrait, sign, doors
  const gold = new THREE.MeshStandardMaterial({ color: 0xa27f3c, metalness: 0.85, roughness: 0.35 });
  const pw = 0.82;
  const ph = 1.06;
  const px = -2.35;
  const py = 1.55;
  const pz = ROOM.z0 + 0.012;
  B.mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: T.founderPortrait(), roughness: 0.55 }), { x: px, y: py, z: pz, cast: false });
  const fr = 0.07;
  B.box(pw + fr * 2, fr, 0.04, gold, { x: px, y: py + ph / 2, z: pz, cast: false });
  B.box(pw + fr * 2, fr, 0.04, gold, { x: px, y: py - ph / 2 - fr, z: pz, cast: false });
  B.box(fr, ph, 0.04, gold, { x: px - pw / 2 - fr / 2, y: py - ph / 2, z: pz, cast: false });
  B.box(fr, ph, 0.04, gold, { x: px + pw / 2 + fr / 2, y: py - ph / 2, z: pz, cast: false });
  B.box(0.3, 0.06, 0.012, gold, { x: px, y: py - ph / 2 - 0.2, z: pz, cast: false });

  B.mesh(
    new THREE.PlaneGeometry(1.5, 0.32),
    new THREE.MeshStandardMaterial({ map: T.plaqueTexture(['MACRODATA REFINEMENT']), roughness: 0.5 }),
    { x: 4.35, y: 1.95, z: ROOM.z0 + 0.012, cast: false },
  );
  B.mesh(
    new THREE.PlaneGeometry(0.9, 0.2),
    new THREE.MeshStandardMaterial({ map: T.plaqueTexture(['WELLNESS'], { logo: false }), roughness: 0.5 }),
    { x: ROOM.x0 + 0.012, y: 2.35, z: -8.4, ry: Math.PI / 2, cast: false },
  );
  const walnut = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.55 });
  B.box(0.05, 2.1, 0.95, walnut, { x: ROOM.x0 + 0.03, z: -8.4, cast: false });
  B.mesh(new THREE.SphereGeometry(0.03, 12, 10), steel, { x: ROOM.x0 + 0.08, y: 1.02, z: -8.05 });

  // Credenza, snake plant and water cooler on the right.
  B.box(0.5, 0.72, 2.2, walnut, { x: ROOM.x1 - 0.3, z: -8.8, round: 0.02, solid: { e: 0.4, mu: 0.4, tag: 'desk' } });
  snakePlant(B, ROOM.x1 - 0.32, 0.72, -9.5);
  waterCooler(B, ROOM.x1 - 0.35, -6.3);

  // ------------------------------------------------------------ bin
  const bin = createMeshBin();
  scene.add(bin.group);
  world.add(bin.collider);

  let screenClock = 0;
  let flickerClock = 3;
  return {
    id: 1,
    scene,
    theme: 'lumon',
    tag: 'Level 1',
    name: 'Macrodata Refinement',
    sub: 'Lumon Industries · Severed Floor',
    exposure: 1.0,
    camera: { x: 0, y: 1.28, z: 0.05, pitch: -0.15, fov: 60 },
    arc: 36,
    hand: new THREE.Vector3(0.15, -0.2, -0.52),
    ball: { lineColor: 'rgba(88,140,210,0.55)', tint: '#f7f6f0' },
    guideColor: 0x8ff0e4,
    bin,
    binArea: { x0: -0.7, x1: 2.6, z0: -7.0, z1: -2.5 },
    binAvoid: [{ x: -2.35, z: -4.5, r: 2.2 }],
    firstBin: { x: 0.35, z: -3.1 },
    ambience: 'office',
    messages: {
      score: [
        'Refined.',
        'Excellent, refiner.',
        'Kier smiles upon you.',
        'Please enjoy each basket equally.',
        'The work is mysterious and important.',
        'A melon bar is in your future.',
        'Praise Kier.',
        'Your outie felt that.',
        'Numbers: sorted.',
      ],
      miss: ['The numbers resisted.', 'Please try again, refiner.', 'Consult the handbook.', 'Unrefined.', 'Wellness session pending.'],
      streak: (n) => `Compliance streak ×${n}`,
    },
    update(dt, t) {
      screenClock -= dt;
      if (screenClock <= 0) {
        screen.draw(t);
        screenClock = 0.12;
      }
      flickerClock -= dt;
      if (flickerClock < 0) {
        flickerMat.emissiveIntensity = Math.random() < 0.5 ? 0.3 : 2.4;
        if (flickerClock < -0.4) {
          flickerMat.emissiveIntensity = 2.4;
          flickerClock = 4 + Math.random() * 7;
        }
      }
    },
  };
}

function buildHallway(B, wallMat) {
  const w = DOOR.x1 - DOOR.x0;
  const cxh = (DOOR.x0 + DOOR.x1) / 2;
  const z0 = ROOM.z0 - 0.1;
  const len = z0 - HALL_END;
  const hallMat = new THREE.MeshStandardMaterial({ map: wallMat.map, color: 0xf4f6f3, emissive: 0xffffff, emissiveIntensity: 0.16, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xa9b3ad, roughness: 0.95 });
  const hallLight = new THREE.PointLight(0xf2f8ff, 8, 14, 1.6);
  hallLight.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h - 0.3, ROOM.z0 - 5);
  const hallLight2 = hallLight.clone();
  hallLight2.position.z = HALL_END + 3;
  B.scene.add(hallLight, hallLight2);
  const zc = (z0 + HALL_END) / 2;
  B.mesh(new THREE.PlaneGeometry(w, len), floorMat, { x: cxh, y: 0.001, z: zc, rx: -Math.PI / 2, cast: false });
  B.mesh(new THREE.PlaneGeometry(w, len), hallMat, { x: cxh, y: DOOR.h, z: zc, rx: Math.PI / 2, cast: false });
  // Right wall is continuous; left wall has a side passage near the end.
  B.mesh(new THREE.PlaneGeometry(len, DOOR.h), hallMat, { x: DOOR.x1, y: DOOR.h / 2, z: zc, ry: -Math.PI / 2, cast: false });
  const gap0 = HALL_END + 2.2;
  const gap1 = gap0 + 1.4;
  const l1 = z0 - gap1;
  B.mesh(new THREE.PlaneGeometry(l1, DOOR.h), hallMat, { x: DOOR.x0, y: DOOR.h / 2, z: (z0 + gap1) / 2, ry: Math.PI / 2, cast: false });
  B.mesh(new THREE.PlaneGeometry(gap0 - HALL_END, DOOR.h), hallMat, { x: DOOR.x0, y: DOOR.h / 2, z: (gap0 + HALL_END) / 2, ry: Math.PI / 2, cast: false });
  B.mesh(new THREE.PlaneGeometry(w, DOOR.h), hallMat, { x: cxh, y: DOOR.h / 2, z: HALL_END, cast: false });
  // Side passage stub.
  B.mesh(new THREE.PlaneGeometry(3, DOOR.h), hallMat, { x: DOOR.x0 - 1.5, y: DOOR.h / 2, z: gap1, rx: 0, ry: Math.PI, cast: false });
  B.mesh(new THREE.PlaneGeometry(3, DOOR.h), hallMat, { x: DOOR.x0 - 1.5, y: DOOR.h / 2, z: gap0, cast: false });
  B.mesh(new THREE.PlaneGeometry(3, 1.4), floorMat, { x: DOOR.x0 - 1.5, y: 0.001, z: (gap0 + gap1) / 2, rx: -Math.PI / 2, cast: false });
  B.mesh(new THREE.PlaneGeometry(3, 1.4), hallMat, { x: DOOR.x0 - 1.5, y: DOOR.h, z: (gap0 + gap1) / 2, rx: Math.PI / 2, cast: false });
  // Light strips.
  const strip = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2 });
  for (let z = z0 - 1; z > HALL_END + 0.5; z -= 2.2) {
    B.mesh(new THREE.BoxGeometry(0.28, 0.02, 1.3), strip, { x: cxh, y: DOOR.h - 0.01, z, cast: false, receive: false });
  }
  // Keep balls out of the hallway.
  B.solid({ x: cxh, y: 1.2, z: ROOM.z0 - 0.6, w, h: 2.4, d: 0.2, e: 0.3, mu: 0.4, tag: 'wall' });
}

function buildPod(B, screenTex) {
  const C = { x: -2.35, z: -4.5 };
  const deskW = 1.3;
  const deskD = 1.1;
  const topY = 0.74;
  const laminate = new THREE.MeshStandardMaterial({ color: 0xe9eae5, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa09c, metalness: 0.55, roughness: 0.45 });
  const felt = new THREE.MeshStandardMaterial({ map: T.feltTexture([70, 112, 84], [3, 1.5]), roughness: 1 });
  const deskSurface = { e: 0.4, mu: 0.35, tag: 'desk' };
  const feltSurface = { e: 0.18, mu: 0.8, tag: 'fabric' };

  // Plus-shaped partition through the pod.
  B.box(deskW * 2 + 0.05, 1.22, 0.05, felt, { x: C.x, z: C.z, solid: feltSurface });
  B.box(0.05, 1.22, deskD * 2 + 0.05, felt, { x: C.x, z: C.z, solid: feltSurface });
  B.box(deskW * 2 + 0.07, 0.025, 0.07, steel, { x: C.x, y: 1.22, z: C.z });
  B.box(0.07, 0.025, deskD * 2 + 0.07, steel, { x: C.x, y: 1.22, z: C.z });

  const cream = new THREE.MeshStandardMaterial({ color: 0xd9d1b9, roughness: 0.55 });
  const creamDark = new THREE.MeshStandardMaterial({ color: 0xc4bb9f, roughness: 0.6 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.25, roughness: 0.2, metalness: 0 });

  const rand = T.rng(42);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dx = C.x + (sx * deskW) / 2;
      const dz = C.z + (sz * deskD) / 2;
      B.box(deskW - 0.02, 0.035, deskD - 0.02, laminate, { x: dx, y: topY - 0.035, z: dz, round: 0.008, solid: deskSurface });
      B.box(0.04, topY - 0.035, deskD - 0.12, steel, { x: C.x + sx * (deskW - 0.04), z: dz });

      const term = terminal(cream, creamDark, screenMat);
      term.position.set(dx, topY, C.z + sz * 0.3);
      term.rotation.y = sz > 0 ? 0 : Math.PI;
      B.scene.add(term);
      B.solidFrom(term.userData.monitor, { e: 0.35, mu: 0.3, tag: 'desk' });

      const chair = officeChair();
      chair.position.set(dx + (rand() - 0.5) * 0.3, 0, C.z + sz * 1.6);
      chair.rotation.y = (sz > 0 ? Math.PI : 0) + (rand() - 0.5) * 0.7;
      B.scene.add(chair);
      B.solidFrom(chair.userData.seat, { e: 0.2, mu: 0.6, tag: 'fabric' });
      B.solidFrom(chair.userData.back, { e: 0.2, mu: 0.6, tag: 'fabric' });
    }
  }
}

function terminal(cream, creamDark, screenMat) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const monitor = new THREE.Group();
  g.add(monitor);
  add(new RoundedBoxGeometry(0.26, 0.04, 0.24, 2, 0.01), creamDark, 0, 0.02, -0.05);
  const face = add(new RoundedBoxGeometry(0.4, 0.33, 0.14, 3, 0.02), cream, 0, 0.21, 0);
  const hood = add(new RoundedBoxGeometry(0.32, 0.27, 0.2, 3, 0.03), cream, 0, 0.215, -0.15);
  monitor.add(face, hood);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.225), screenMat);
  scr.position.set(0, 0.215, 0.0715);
  g.add(scr);
  // Keyboard with the trackball.
  add(new RoundedBoxGeometry(0.4, 0.035, 0.16, 2, 0.01), cream, 0, 0.018, 0.26, 0.06);
  add(new THREE.SphereGeometry(0.026, 20, 14), new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.25 }), 0.16, 0.045, 0.28);
  g.userData.monitor = monitor;
  return g;
}

function officeChair() {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x1f2224, roughness: 0.45 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: 1, roughness: 0.25 });
  const mk = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const seat = mk(new RoundedBoxGeometry(0.5, 0.08, 0.48, 3, 0.03), leather, 0, 0.47, 0);
  const back = mk(new RoundedBoxGeometry(0.48, 0.42, 0.07, 3, 0.03), leather, 0, 0.8, -0.25, -0.12);
  mk(new THREE.BoxGeometry(0.05, 0.3, 0.03), chrome, 0, 0.57, -0.26, -0.1);
  mk(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 12), chrome, 0, 0.26, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = mk(new THREE.BoxGeometry(0.3, 0.025, 0.04), chrome, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15);
    arm.rotation.y = -a;
    mk(new THREE.SphereGeometry(0.025, 10, 8), leather, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
  }
  g.userData.seat = seat;
  g.userData.back = back;
  return g;
}

function snakePlant(B, x, y, z) {
  const pot = B.mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 24), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 }), { x, y: y + 0.13, z });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 0.6, side: THREE.DoubleSide });
  const rand = T.rng(8);
  for (let i = 0; i < 9; i++) {
    const h = 0.45 + rand() * 0.35;
    const m = B.mesh(new THREE.ConeGeometry(0.035, h, 6), leaf, { x: x + (rand() - 0.5) * 0.12, y: y + 0.26 + h / 2, z: z + (rand() - 0.5) * 0.12 });
    m.scale.z = 0.3;
    m.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
  }
  return pot;
}

function waterCooler(B, x, z) {
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45 });
  B.box(0.32, 0.95, 0.32, white, { x, z, round: 0.02, solid: { e: 0.35, mu: 0.4, tag: 'wall' } });
  B.mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.42, 28),
    new THREE.MeshPhysicalMaterial({ color: 0x8ec9e8, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.55 }),
    { x, y: 1.17, z },
  );
}
