import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const SPACING = 0.11;
const SHORT_FRACTION = 0.35;

/** The aiming guide: evenly spaced dots along the predicted path plus a landing ring. */
export class TrajectoryGuide {
  constructor(color) {
    this.group = new THREE.Group();
    this.max = 180;
    this.dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.dotMat, this.max);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 4;
    this.group.add(this.dots);

    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.marker = new THREE.Group();
    this.marker.add(new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 48), ringMat));
    this.marker.add(new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), ringMat));
    this.marker.renderOrder = 4;
    this.group.add(this.marker);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.n = new THREE.Vector3();
  }

  hide() {
    this.dots.count = 0;
    this.marker.visible = false;
  }

  /**
   * @param pts flat xyz sample array from World.predict
   * @param mode 'full' | 'short' | 'off'
   */
  show(pts, count, hit, mode, time, eye) {
    if (mode === 'off' || count < 2) return this.hide();
    let total = 0;
    for (let i = 1; i < count; i++) total += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    const limit = mode === 'short' ? total * SHORT_FRACTION : total;

    // March along the polyline placing a dot every SPACING metres; the offset drifts so dots flow forward.
    let next = 0.06 + ((time * 0.35) % SPACING);
    let travelled = 0;
    let n = 0;
    for (let i = 1; i < count && n < this.max; i++) {
      const ax = pts[i * 3 - 3];
      const ay = pts[i * 3 - 2];
      const az = pts[i * 3 - 1];
      const bx = pts[i * 3];
      const by = pts[i * 3 + 1];
      const bz = pts[i * 3 + 2];
      const seg = Math.hypot(bx - ax, by - ay, bz - az);
      while (next <= travelled + seg && next <= limit && n < this.max) {
        const t = (next - travelled) / seg;
        this.p.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
        // Size dots by distance to the eye so they read the same on screen near and far.
        const f = next / limit;
        const dist = eye ? this.p.distanceTo(eye) : 3;
        const taper = mode === 'short' ? 1 - f * 0.8 : 1 - f * 0.25;
        this.s.setScalar(Math.min(0.03, Math.max(0.0025, dist * 0.0042)) * taper);
        this.m.compose(this.p, this.q.identity(), this.s);
        this.dots.setMatrixAt(n++, this.m);
        next += SPACING;
      }
      travelled += seg;
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;

    if (hit && mode === 'full') {
      this.marker.visible = true;
      this.n.set(hit.nx, hit.ny, hit.nz);
      this.marker.position.set(hit.x + hit.nx * 0.004, hit.y + hit.ny * 0.004, hit.z + hit.nz * 0.004);
      this.marker.quaternion.setFromUnitVectors(this.zAxis, this.n);
      this.marker.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
    } else {
      this.marker.visible = false;
    }
  }

  setColor(color) {
    this.dotMat.color.set(color);
    this.marker.children[0].material.color.set(color);
  }
}

/** A fading streak behind each thrown ball. */
export class Trail {
  constructor(color, resolution) {
    this.geometry = new LineGeometry();
    this.material = new LineMaterial({ color, linewidth: 3, transparent: true, opacity: 0.6, depthWrite: false, worldUnits: false, toneMapped: false });
    this.material.resolution.copy(resolution);
    this.line = new Line2(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.renderOrder = 3;
    this.points = [];
    this.age = 0;
    this.fading = false;
    this.done = false;
  }

  add(x, y, z) {
    const n = this.points.length;
    if (n >= 3) {
      const dx = x - this.points[n - 3];
      const dy = y - this.points[n - 2];
      const dz = z - this.points[n - 1];
      if (dx * dx + dy * dy + dz * dz < 0.0009) return;
    }
    if (n > 3 * 600) return;
    this.points.push(x, y, z);
    if (this.points.length >= 6) {
      this.geometry.setPositions(this.points);
      this.line.computeLineDistances();
    }
  }

  update(dt) {
    this.age += dt;
    if (this.fading) {
      this.material.opacity = Math.max(0, this.material.opacity - dt * 0.6);
      if (this.material.opacity <= 0) this.done = true;
    }
    this.line.visible = this.points.length >= 6;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Confetti-like paper flecks that burst out of the bin on a score. */
export class Burst {
  constructor(scene) {
    this.max = 160;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.018, 0.026), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    scene.add(this.mesh);
    this.parts = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  emit(x, y, z, colors, n = 40) {
    for (let i = 0; i < n && this.parts.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 1.6 + Math.random() * 1.8;
      const out = 0.4 + Math.random() * 0.9;
      this.parts.push({
        x,
        y,
        z,
        vx: Math.cos(a) * out,
        vy: up,
        vz: Math.sin(a) * out,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        wr: (Math.random() - 0.5) * 20,
        life: 1.1 + Math.random() * 0.5,
        color: colors[i % colors.length],
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= 5.5 * dt;
      p.vx *= 1 - 2 * dt;
      p.vz *= 1 - 2 * dt;
      p.vy *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wr * dt;
      p.ry += p.wr * 0.7 * dt;
    }
    for (const p of this.parts) {
      this.q.setFromEuler(this.e.set(p.rx, p.ry, 0));
      this.s.setScalar(Math.min(1, p.life * 2));
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
