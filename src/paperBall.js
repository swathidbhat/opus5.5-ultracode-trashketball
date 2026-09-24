import * as THREE from 'three';
import { rng, paperTexture } from './textures.js';

// Smooth 3D value noise on the unit sphere, used to crease the ball.
function noise3(rand) {
  const N = 16;
  const g = new Float32Array(N * N * N).map(() => rand());
  const at = (x, y, z) => g[((x & 15) * N + (y & 15)) * N + (z & 15)];
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fy = y - yi;
    const fz = z - zi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const w = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(at(xi, yi, zi), at(xi + 1, yi, zi), u), l(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), u), v),
      l(l(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), u), l(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
}

/**
 * A crumpled sheet: an icosphere pushed around by ridged noise and a few
 * flattened facets. The geometry is non-indexed, so normals come out faceted.
 */
function crumpledGeometry(radius, seed) {
  const rand = rng(seed);
  const n = noise3(rand);
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const dents = Array.from({ length: 10 }, () => {
    const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    return { v, w: 0.25 + rand() * 0.3, a: 0.12 + rand() * 0.12 };
  });
  const colors = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  const off = rand() * 10;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const ridge = 1 - Math.abs(n(d.x * 2.6 + off, d.y * 2.6, d.z * 2.6) * 2 - 1);
    const fine = n(d.x * 7 + 3, d.y * 7 + off, d.z * 7);
    let s = 0.9 + 0.2 * ridge + 0.08 * (fine - 0.5);
    for (const dent of dents) {
      const k = d.dot(dent.v);
      if (k > 1 - dent.w) s -= dent.a * ((k - (1 - dent.w)) / dent.w);
    }
    pos.setXYZ(i, d.x * radius * s, d.y * radius * s, d.z * radius * s);
    const shade = 0.62 + 0.3 * Math.min(1, Math.max(0, (s - 0.72) / 0.4));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export class PaperBallFactory {
  constructor(radius, { lineColor, tint } = {}) {
    this.radius = radius;
    this.geometries = Array.from({ length: 6 }, (_, i) => crumpledGeometry(radius, 101 + i * 17));
    this.materials = Array.from({ length: 3 }, (_, i) =>
      new THREE.MeshStandardMaterial({
        map: paperTexture(lineColor, tint, 3 + i),
        vertexColors: true,
        roughness: 0.95,
        envMapIntensity: 0.5,
        metalness: 0,
        flatShading: true,
      }),
    );
    this.count = 0;
  }

  create() {
    const i = this.count++;
    const mesh = new THREE.Mesh(this.geometries[i % this.geometries.length], this.materials[i % this.materials.length]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    return mesh;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) {
      m.map.dispose();
      m.dispose();
    }
  }
}
