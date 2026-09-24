import * as THREE from 'three';
import { LatheCollider } from './physics.js';
import { wireMeshAlpha, basketWeave } from './textures.js';

/**
 * Every bin shares one shape description so the mesh and the collider agree:
 * a tapered open cylinder of bottom radius rB, top radius rT and height H.
 */
class Bin {
  constructor({ rB, rT, H, thickness, e, mu, tag }) {
    this.rB = rB;
    this.rT = rT;
    this.H = H;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.collider = new LatheCollider({
      points: [
        [0, 0],
        [rB, 0],
        [rT, H],
      ],
      thickness,
      e,
      mu,
      tag,
    });
    this.x = 0;
    this.z = 0;
    this.wobble = 0;
    this.wobbleVel = 0;
    this.wobbleAxis = new THREE.Vector3(1, 0, 0);
  }

  radiusAt(y) {
    return this.rB + (this.rT - this.rB) * (y / this.H);
  }

  setPosition(x, z) {
    this.x = x;
    this.z = z;
    this.group.position.set(x, 0, z);
    this.collider.setPosition(x, 0, z);
  }

  /** True once a ball has dropped fully below the rim, inside the wall. */
  contains(p, r) {
    const y = p.y;
    if (y <= 0 || y > this.H - r * 1.2) return false;
    const rho = Math.hypot(p.x - this.x, p.z - this.z);
    return rho < this.radiusAt(y) - r * 0.4;
  }

  knock(fromX, fromZ, strength) {
    // Tilt away from the hit, then spring back.
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.wobbleAxis.set(dz / len, 0, -dx / len);
    this.wobbleVel += Math.min(0.9, strength * 0.22);
  }

  update(dt) {
    const k = 170;
    const c = 7;
    this.wobbleVel += (-k * this.wobble - c * this.wobbleVel) * dt;
    this.wobble += this.wobbleVel * dt;
    this.body.quaternion.setFromAxisAngle(this.wobbleAxis, this.wobble * 0.08);
  }
}

/** Level 1: a black wire-mesh office wastebasket with solid bands. */
export function createMeshBin() {
  const bin = new Bin({ rB: 0.13, rT: 0.17, H: 0.34, thickness: 0.008, e: 0.32, mu: 0.3, tag: 'metal' });
  const { rB, rT, H } = bin;

  const alpha = wireMeshAlpha([34, 11]);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1c1f22,
    metalness: 0.7,
    roughness: 0.42,
    alphaMap: alpha,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, H, 64, 1, true), wallMat);
  wall.position.y = H / 2;
  wall.castShadow = true;
  wall.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaMap: alpha,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  const solid = new THREE.MeshStandardMaterial({ color: 0x202326, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide });
  const band = (y0, y1) => {
    const r0 = bin.radiusAt(y0) + 0.001;
    const r1 = bin.radiusAt(y1) + 0.001;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 64, 1, true), solid);
    m.position.y = (y0 + y1) / 2;
    m.castShadow = true;
    return m;
  };
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rT, 0.009, 10, 72), solid);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H;
  rim.castShadow = true;
  const foot = new THREE.Mesh(new THREE.TorusGeometry(rB, 0.007, 8, 64), solid);
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.007;
  const base = new THREE.Mesh(new THREE.CircleGeometry(rB, 48), solid);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.004;
  base.receiveShadow = true;

  bin.body.add(wall, band(H - 0.03, H), band(0, 0.025), rim, foot, base);
  return bin;
}

/** Level 2: a tall woven seagrass basket with a rope rim and leather tabs. */
export function createWovenBin() {
  const bin = new Bin({ rB: 0.15, rT: 0.19, H: 0.44, thickness: 0.014, e: 0.22, mu: 0.55, tag: 'wicker' });
  const { rB, rT, H } = bin;
  const t = 0.01;

  const weave = basketWeave([3, 1.3]);
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(rT + t, rB + t, H, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: weave.map, bumpMap: weave.bump, bumpScale: 2.2, roughness: 0.82, metalness: 0 }),
  );
  outer.position.y = H / 2;
  outer.castShadow = true;
  outer.receiveShadow = true;

  const innerWeave = weave.map.clone();
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(rT - t, rB - t, H, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: innerWeave, color: 0x9a8a72, roughness: 0.9, side: THREE.BackSide }),
  );
  inner.position.y = H / 2;
  inner.receiveShadow = true;

  const ropeMat = new THREE.MeshStandardMaterial({ map: weave.map, color: 0xb58d5c, roughness: 0.85 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rT, 0.02, 14, 96), ropeMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H;
  rim.castShadow = true;

  const base = new THREE.Mesh(new THREE.CircleGeometry(rB, 48), new THREE.MeshStandardMaterial({ map: weave.map, color: 0x8a7658, roughness: 0.9 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.005;
  base.receiveShadow = true;

  const leather = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.55 });
  const tabs = [];
  for (const s of [-1, 1]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.012), leather);
    const y = H - 0.07;
    const r = bin.radiusAt(y) + t + 0.006;
    tab.position.set(s * r, y, 0);
    tab.rotation.y = Math.PI / 2;
    tab.rotation.x = s * 0.09;
    tab.castShadow = true;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.3 }));
    rivet.position.set(s * (r + 0.007), y + 0.018, 0);
    tabs.push(tab, rivet);
  }

  bin.body.add(outer, inner, rim, base, ...tabs);
  return bin;
}
