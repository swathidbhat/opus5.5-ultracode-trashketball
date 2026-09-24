import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BoxCollider } from '../physics.js';

/** Small helper for placing meshes and matching box colliders in world space. */
export class Builder {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
  }

  mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true, parent = this.scene } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  /** A box whose bottom sits at `y`. Pass `solid` ({e, mu, tag}) to make it collidable. */
  box(w, h, d, mat, { x = 0, y = 0, z = 0, ry = 0, cast = true, receive = true, solid = null, parent, round = 0 } = {}) {
    const geo = round > 0 ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d);
    const m = this.mesh(geo, mat, { x, y: y + h / 2, z, ry, cast, receive, parent });
    if (solid) this.solid({ x, y: y + h / 2, z, w, h, d, rotY: ry, ...solid });
    return m;
  }

  solid(opts) {
    const c = new BoxCollider(opts);
    return opts.first ? this.world.addFirst(c) : this.world.add(c);
  }

  /** Axis-aligned collider around an object's current world bounds. */
  solidFrom(object, surface, shrink = 0) {
    object.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(object);
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    return this.solid({ x: c.x, y: c.y, z: c.z, w: size.x - shrink, h: size.y - shrink, d: size.z - shrink, ...surface });
  }
}

export function disposeScene(scene) {
  const textures = new Set();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) textures.add(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) textures.add(u.value);
      m.dispose();
    }
  });
  for (const t of textures) t.dispose();
  if (scene.environment) scene.environment.dispose();
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
