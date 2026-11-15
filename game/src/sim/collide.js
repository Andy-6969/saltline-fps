// Collision against the map's boxes: body movement with step-up, ray casts for bullets and sight.
// Results come back in module-level records, so a ray cast allocates nothing.

import { BOXES } from './map.js';
import { MOVE } from './config.js';

const EPS = 1e-4;

/** The last ray cast: nearest hit of any box (t, normal, box) and nearest hit of a solid, non-thin box. */
export const rayHit = { t: 0, tSolid: 0, nx: 0, ny: 0, nz: 0, box: null };

/** Cast a ray up to maxT against every box and the ground. Returns true when anything was hit. */
export function castRay(ox, oy, oz, dx, dy, dz, maxT) {
  const h = rayHit;
  h.t = maxT;
  h.tSolid = maxT;
  h.box = null;
  h.nx = h.nz = 0;
  h.ny = 1;
  if (dy < -1e-9) {
    const tg = -oy / dy;
    if (tg >= 0 && tg < maxT) h.t = h.tSolid = tg;
  }
  const ix = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
  const iy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
  const iz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    let t0 = (b.x0 - ox) * ix;
    let t1 = (b.x1 - ox) * ix;
    let axis = 0;
    let near = t0 < t1 ? t0 : t1;
    let far = t0 < t1 ? t1 : t0;
    t0 = (b.y0 - oy) * iy;
    t1 = (b.y1 - oy) * iy;
    const ny = t0 < t1 ? t0 : t1;
    if (ny > near) { near = ny; axis = 1; }
    far = Math.min(far, t0 < t1 ? t1 : t0);
    t0 = (b.z0 - oz) * iz;
    t1 = (b.z1 - oz) * iz;
    const nz = t0 < t1 ? t0 : t1;
    if (nz > near) { near = nz; axis = 2; }
    far = Math.min(far, t0 < t1 ? t1 : t0);
    if (near > far || far < 0 || near < 0) continue;
    if (!b.thin && near < h.tSolid) h.tSolid = near;
    if (near < h.t) {
      h.t = near;
      h.box = b;
      h.nx = axis === 0 ? -Math.sign(dx) : 0;
      h.ny = axis === 1 ? -Math.sign(dy) : 0;
      h.nz = axis === 2 ? -Math.sign(dz) : 0;
    }
  }
  return h.t < maxT;
}

/** True when nothing stands between two points (thin cover blocks sight too). */
export function sightClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return true;
  return !castRay(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05);
}

/** The box containing a point, or null: grenades bounce off what this returns. */
export function boxAt(x, y, z) {
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return b;
  }
  return null;
}

function bodyFree(x, y, z, h) {
  const r = MOVE.radius - EPS;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y < b.y1) return false;
  }
  return true;
}

/** Can this body stand up from a crouch where it is? */
export const canStand = (a) => bodyFree(a.x, a.y + EPS, a.z, MOVE.standH);

// Push the body out of every box it overlaps along one axis. A low ledge met while walking is
// stepped onto instead, which is what lets a player walk up onto a half crate.
function resolve(a, axis, d) {
  const r = MOVE.radius;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (a.x + r <= b.x0 || a.x - r >= b.x1 || a.z + r <= b.z0 || a.z - r >= b.z1) continue;
    if (a.y + a.h <= b.y0 || a.y >= b.y1) continue;
    if (axis === 1) {
      if (d > 0) a.y = b.y0 - a.h;
      else { a.y = b.y1; a.onGround = true; }
      a.vy = 0;
    } else if (a.onGround && b.y1 - a.y <= MOVE.stepUp && bodyFree(a.x, b.y1 + EPS, a.z, a.h)) {
      a.y = b.y1;
    } else if (axis === 0) {
      a.x = d > 0 ? b.x0 - r : b.x1 + r;
      a.vx = 0;
    } else {
      a.z = d > 0 ? b.z0 - r : b.z1 + r;
      a.vz = 0;
    }
  }
}

/** Move a body by its velocity for dt, one axis at a time, sliding along what it meets. */
export function moveBody(a, dt) {
  let d = a.vx * dt;
  a.x += d;
  resolve(a, 0, d);
  d = a.vz * dt;
  a.z += d;
  resolve(a, 2, d);
  a.onGround = false;
  d = a.vy * dt;
  a.y += d;
  resolve(a, 1, d);
  if (a.y <= 0) {
    a.y = 0;
    a.vy = 0;
    a.onGround = true;
  }
}
