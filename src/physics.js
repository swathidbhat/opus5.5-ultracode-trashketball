// Paper-ball physics: gravity, quadratic air drag, and sphere-vs-world contacts
// with restitution and Coulomb friction. The trajectory preview runs the exact
// same integrator, so the guide line matches the real flight until first contact.

export const GRAVITY = 9.81;
export const BALL_RADIUS = 0.05;
// k = ½·ρ·Cd·A / m for a tightly balled ~15 g sheet: drag acceleration = k·|v|·v.
// Terminal velocity is √(g/k) ≈ 10.7 m/s, so long lobs visibly steepen on the way down.
export const DRAG = 0.085;
export const STEP = 1 / 480;

const REST_SPEED = 0.09;
const REST_TIME = 0.3;
// Below this normal speed a contact stops bouncing and just settles.
const BOUNCE_CUTOFF = 0.35;
const BALL_MATERIAL = { e: 0.3, mu: 0.4, tag: 'ball' };

export class Ball {
  constructor(radius = BALL_RADIUS) {
    this.radius = radius;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spin = { x: 0, y: 0, z: 0 };
    this.sleeping = false;
    this.restTime = 0;
    this.touching = false;
    this.grounded = false;
    this.lumpy = true;
  }

  wake() {
    this.sleeping = false;
    this.restTime = 0;
  }
}

function integrate(b, h) {
  const v = b.vel;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const k = DRAG * speed;
  v.x -= k * v.x * h;
  v.y -= (GRAVITY + k * v.y) * h;
  v.z -= k * v.z * h;
  b.pos.x += v.x * h;
  b.pos.y += v.y * h;
  b.pos.z += v.z * h;
}

/** Oriented box (rotation about Y only). Position is the box centre. */
export class BoxCollider {
  constructor({ x = 0, y = 0, z = 0, w, h, d, rotY = 0, e = 0.3, mu = 0.5, tag = 'hard' }) {
    this.cx = x;
    this.cy = y;
    this.cz = z;
    this.hx = w / 2;
    this.hy = h / 2;
    this.hz = d / 2;
    this.cos = Math.cos(rotY);
    this.sin = Math.sin(rotY);
    this.e = e;
    this.mu = mu;
    this.tag = tag;
    this.enabled = true;
    this.bound = Math.hypot(this.hx, this.hy, this.hz);
  }

  collide(b, r, res) {
    const dx = b.pos.x - this.cx;
    const dy = b.pos.y - this.cy;
    const dz = b.pos.z - this.cz;
    const reach = this.bound + r;
    if (dx * dx + dy * dy + dz * dz > reach * reach) return;

    const lx = this.cos * dx - this.sin * dz;
    const lz = this.sin * dx + this.cos * dz;
    const ly = dy;
    const qx = Math.max(-this.hx, Math.min(this.hx, lx));
    const qy = Math.max(-this.hy, Math.min(this.hy, ly));
    const qz = Math.max(-this.hz, Math.min(this.hz, lz));
    let nx = lx - qx;
    let ny = ly - qy;
    let nz = lz - qz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= r * r) return;

    let depth;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx /= d;
      ny /= d;
      nz /= d;
      depth = r - d;
    } else {
      // Centre is inside the box: push out along the axis of least penetration.
      const px = this.hx - Math.abs(lx);
      const py = this.hy - Math.abs(ly);
      const pz = this.hz - Math.abs(lz);
      nx = ny = nz = 0;
      if (py <= px && py <= pz) {
        ny = Math.sign(ly) || 1;
        depth = py + r;
      } else if (px <= pz) {
        nx = Math.sign(lx) || 1;
        depth = px + r;
      } else {
        nz = Math.sign(lz) || 1;
        depth = pz + r;
      }
    }
    const wx = this.cos * nx + this.sin * nz;
    const wz = -this.sin * nx + this.cos * nz;
    res.contact(b, wx, ny, wz, depth, this);
  }
}

/**
 * A surface of revolution around a vertical axis, described by a 2D profile
 * polyline of [radius, height] points and a wall half-thickness. Used for bins:
 * [[0,0],[rBottom,0],[rTop,height]] gives a closed base, a tapered wall and a
 * rounded rim for free (the rim is just the end of the wall segment).
 */
export class LatheCollider {
  constructor({ points, thickness = 0.008, e = 0.3, mu = 0.4, tag = 'bin' }) {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.t = thickness;
    this.e = e;
    this.mu = mu;
    this.tag = tag;
    this.enabled = true;
    this.segs = [];
    this.maxR = 0;
    this.top = -Infinity;
    this.bottom = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const [r0, y0] = points[i];
      const [r1, y1] = points[i + 1];
      this.segs.push([r0, y0, r1, y1]);
    }
    for (const [r, y] of points) {
      this.maxR = Math.max(this.maxR, r);
      this.top = Math.max(this.top, y);
      this.bottom = Math.min(this.bottom, y);
    }
  }

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  collide(b, r, res) {
    const reach = r + this.t;
    for (const s of this.segs) {
      const dx = b.pos.x - this.x;
      const dz = b.pos.z - this.z;
      const ly = b.pos.y - this.y;
      if (ly < this.bottom - reach || ly > this.top + reach) return;
      const rho = Math.sqrt(dx * dx + dz * dz);
      if (rho > this.maxR + reach) return;
      const ux = rho > 1e-6 ? dx / rho : 1;
      const uz = rho > 1e-6 ? dz / rho : 0;

      const ex = s[2] - s[0];
      const ey = s[3] - s[1];
      let t = ((rho - s[0]) * ex + (ly - s[1]) * ey) / (ex * ex + ey * ey);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      let nr = rho - (s[0] + ex * t);
      let ny = ly - (s[1] + ey * t);
      const dist = Math.sqrt(nr * nr + ny * ny);
      if (dist >= reach) continue;
      if (dist > 1e-9) {
        nr /= dist;
        ny /= dist;
      } else {
        const len = Math.hypot(ex, ey);
        nr = ey / len;
        ny = -ex / len;
      }
      res.contact(b, ux * nr, ny, uz * nr, reach - dist, this);
    }
  }
}

export class World {
  constructor() {
    this.colliders = [];
    this.balls = [];
    this.events = [];
    this.acc = 0;
    this.random = Math.random;
  }

  add(collider) {
    this.colliders.push(collider);
    return collider;
  }

  /** Thin surfaces lying on top of others (rugs) go first so they win the contact. */
  addFirst(collider) {
    this.colliders.unshift(collider);
    return collider;
  }

  addBall(ball) {
    this.balls.push(ball);
  }

  removeBall(ball) {
    const i = this.balls.indexOf(ball);
    if (i >= 0) this.balls.splice(i, 1);
  }

  step(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 48) {
      this.substep(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 48) this.acc = 0;
  }

  substep(h) {
    const balls = this.balls;
    for (const b of balls) {
      if (b.sleeping) continue;
      integrate(b, h);
      b.touching = false;
      b.grounded = false;
    }
    for (const b of balls) {
      if (b.sleeping) continue;
      for (const c of this.colliders) if (c.enabled) c.collide(b, b.radius, this);
    }
    this.collideBalls();
    for (const b of balls) {
      if (b.sleeping) continue;
      const v = b.vel;
      if (b.touching && v.x * v.x + v.y * v.y + v.z * v.z < REST_SPEED * REST_SPEED) {
        b.restTime += h;
        if (b.restTime > REST_TIME) {
          b.sleeping = true;
          v.x = v.y = v.z = 0;
          b.spin.x = b.spin.y = b.spin.z = 0;
        }
      } else {
        b.restTime = 0;
      }
    }
  }

  collideBalls() {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (a.sleeping && c.sleeping) continue;
        const dx = c.pos.x - a.pos.x;
        const dy = c.pos.y - a.pos.y;
        const dz = c.pos.z - a.pos.z;
        const min = a.radius + c.radius;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        const overlap = min - d;
        const vrel = (c.vel.x - a.vel.x) * nx + (c.vel.y - a.vel.y) * ny + (c.vel.z - a.vel.z) * nz;

        if (a.sleeping || c.sleeping) {
          // A gentle touch treats the resting ball as static so piles stay put.
          if (Math.abs(vrel) < 0.8) {
            if (a.sleeping) this.contact(c, nx, ny, nz, overlap, BALL_MATERIAL);
            else this.contact(a, -nx, -ny, -nz, overlap, BALL_MATERIAL);
            continue;
          }
          a.wake();
          c.wake();
        }

        a.pos.x -= nx * overlap * 0.5;
        a.pos.y -= ny * overlap * 0.5;
        a.pos.z -= nz * overlap * 0.5;
        c.pos.x += nx * overlap * 0.5;
        c.pos.y += ny * overlap * 0.5;
        c.pos.z += nz * overlap * 0.5;
        a.touching = c.touching = true;
        if (vrel < 0) {
          const j = (-(1 + BALL_MATERIAL.e) * vrel) / 2;
          a.vel.x -= nx * j;
          a.vel.y -= ny * j;
          a.vel.z -= nz * j;
          c.vel.x += nx * j;
          c.vel.y += ny * j;
          c.vel.z += nz * j;
          if (-vrel > 0.6) this.events.push({ tag: 'ball', speed: -vrel, x: a.pos.x, y: a.pos.y, z: a.pos.z, collider: null, ball: a });
        }
      }
    }
  }

  /** Resolve one contact: separate, bounce along the normal, apply friction along the surface. */
  contact(b, nx, ny, nz, depth, col) {
    b.pos.x += nx * depth;
    b.pos.y += ny * depth;
    b.pos.z += nz * depth;
    b.touching = true;
    if (ny > 0.55) b.grounded = true;

    const v = b.vel;
    const vn = v.x * nx + v.y * ny + v.z * nz;
    if (vn >= 0) return;
    const impact = -vn;
    const e = impact < BOUNCE_CUTOFF ? 0 : col.e;

    let tx = v.x - vn * nx;
    let ty = v.y - vn * ny;
    let tz = v.z - vn * nz;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-6) {
      // Coulomb friction impulse, capped near the rolling limit of a hollow shell.
      const f = Math.max(0.6, 1 - (col.mu * (1 + e) * impact) / tl);
      tx *= f;
      ty *= f;
      tz *= f;
      // A crumpled ball is lumpy: hard hits scatter the rebound direction a little.
      if (b.lumpy && impact > 1.2) {
        const ang = (this.random() - 0.5) * 0.5;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const cx = ny * tz - nz * ty;
        const cy = nz * tx - nx * tz;
        const cz = nx * ty - ny * tx;
        tx = tx * cs + cx * sn;
        ty = ty * cs + cy * sn;
        tz = tz * cs + cz * sn;
      }
    }
    const out = e * impact;
    v.x = tx + nx * out;
    v.y = ty + ny * out;
    v.z = tz + nz * out;

    // Rolling contact: spin = (n × v_t) / r.
    const r = b.radius;
    b.spin.x = (ny * tz - nz * ty) / r;
    b.spin.y = (nz * tx - nx * tz) / r;
    b.spin.z = (nx * ty - ny * tx) / r;

    if (impact > 0.45) {
      this.events.push({ tag: col.tag, speed: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, collider: col, ball: b });
    }
  }

  /**
   * Simulate a throw from (pos, vel) until the first contact with anything.
   * Writes sample points into `out` (flat xyz array) and returns the count and hit.
   */
  predict(pos, vel, maxTime, out, sampleEvery = 4) {
    const probe = this._probe || (this._probe = new Ball());
    const rec = this._recorder || (this._recorder = { hit: null, contact: recordContact });
    probe.pos.x = pos.x;
    probe.pos.y = pos.y;
    probe.pos.z = pos.z;
    probe.vel.x = vel.x;
    probe.vel.y = vel.y;
    probe.vel.z = vel.z;
    rec.hit = null;

    const maxPts = Math.floor(out.length / 3);
    let count = 0;
    const push = () => {
      if (count >= maxPts) return;
      out[count * 3] = probe.pos.x;
      out[count * 3 + 1] = probe.pos.y;
      out[count * 3 + 2] = probe.pos.z;
      count++;
    };
    push();

    const steps = Math.ceil(maxTime / STEP);
    const r = probe.radius;
    for (let i = 1; i <= steps; i++) {
      integrate(probe, STEP);
      for (const c of this.colliders) {
        if (!c.enabled) continue;
        c.collide(probe, r, rec);
        if (rec.hit) break;
      }
      if (!rec.hit) {
        for (const b of this.balls) {
          if (!b.sleeping) continue;
          const dx = probe.pos.x - b.pos.x;
          const dy = probe.pos.y - b.pos.y;
          const dz = probe.pos.z - b.pos.z;
          const min = r + b.radius;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2) || 1;
            rec.contact(probe, dx / d, dy / d, dz / d, min - d, BALL_MATERIAL);
            break;
          }
        }
      }
      if (rec.hit) {
        push();
        break;
      }
      if (i % sampleEvery === 0) push();
      if (probe.pos.y < -4) break;
    }
    return { count, hit: rec.hit };
  }
}

function recordContact(b, nx, ny, nz, depth, col) {
  if (this.hit) return;
  const r = b.radius;
  this.hit = {
    x: b.pos.x - nx * (r - depth),
    y: b.pos.y - ny * (r - depth),
    z: b.pos.z - nz * (r - depth),
    nx,
    ny,
    nz,
    collider: col,
  };
}
