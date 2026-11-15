// Grenades: thrown bodies that bounce off the map, then burst (frag), blind (flash) or bloom into
// a cloud that blocks sight (smoke). They live in a fixed pool inside the state.

import { NADES, NADE_KINDS } from './config.js';
import { boxAt, sightClear } from './collide.js';
import { EV, emit, eyeY, noise } from './state.js';
import { blast } from './weapons.js';

const GRAVITY = 15, BOUNCE = 0.42, CLOUD_Y = 1.3;

export function throwNade(state, a, lob) {
  const g = state.nades.find((n) => !n.live);
  if (!g || a.nades[a.slot - 2] <= 0) return;
  a.nades[a.slot - 2]--;
  const cp = Math.cos(a.pitch), speed = lob ? 8 : 17;
  const dx = -Math.sin(a.yaw) * cp, dy = Math.sin(a.pitch), dz = -Math.cos(a.yaw) * cp;
  g.live = true;
  g.kind = NADE_KINDS[a.slot - 2];
  g.owner = a.id;
  g.cloud = 0;
  g.fuse = NADES[g.kind].fuse;
  g.x = a.x + dx * 0.4; g.y = eyeY(a) - 0.1 + dy * 0.4; g.z = a.z + dz * 0.4;
  g.vx = dx * speed + a.vx * 0.5; g.vy = dy * speed + 2.6; g.vz = dz * speed + a.vz * 0.5;
  emit(state, EV.THROW, a.id, g.x, g.y, g.z).s = g.kind;
}

// One axis of flight: step, and if that put the grenade inside a box (or the ground), step back
// and reflect that component. Returns true on a bounce.
function fly(g, axis, d) {
  g[axis] += d;
  if (!(axis === 'y' && g.y < 0.06) && !boxAt(g.x, g.y, g.z)) return false;
  g[axis] -= d;
  const v = 'v' + axis;
  g[v] *= -BOUNCE;
  return true;
}

function detonate(state, g) {
  const owner = state.actors[g.owner];
  const spec = NADES[g.kind];
  if (g.kind === 'smoke') {
    g.cloud = spec.life;
    g.vx = g.vy = g.vz = 0;
    emit(state, EV.SMOKE, g.owner, g.x, g.y, g.z);
    return;
  }
  g.live = false;
  noise(state, g.x, g.z, 40, owner.team);
  if (g.kind === 'frag') {
    emit(state, EV.BOOM, g.owner, g.x, g.y, g.z);
    blast(state, g.x, g.y + 0.2, g.z, spec.radius, spec.damage, owner, 'Frag');
    return;
  }
  emit(state, EV.FLASHBANG, g.owner, g.x, g.y, g.z);
  for (let i = 0; i < state.actors.length; i++) {
    const v = state.actors[i];
    const ey = eyeY(v);
    const d = Math.hypot(v.x - g.x, ey - g.y, v.z - g.z);
    if (!v.alive || d > spec.radius || !sightClear(g.x, g.y + 0.1, g.z, v.x, ey, v.z)) continue;
    // Looking at the burst blinds for seconds; a turned back takes a fraction of it.
    const facing = (-Math.sin(v.yaw) * (g.x - v.x) - Math.cos(v.yaw) * (g.z - v.z)) / Math.max(d, 0.01);
    v.flashT = Math.max(v.flashT, 3.4 * (1 - d / spec.radius) * (facing > 0.2 ? 1 : 0.3));
  }
}

export function stepNades(state, dt) {
  for (let i = 0; i < state.nades.length; i++) {
    const g = state.nades[i];
    if (!g.live) continue;
    if (g.cloud > 0) {
      g.cloud -= dt;
      if (g.cloud <= 0) g.live = false;
      continue;
    }
    g.vy -= GRAVITY * dt;
    const hitX = fly(g, 'x', g.vx * dt), hitZ = fly(g, 'z', g.vz * dt), hitY = fly(g, 'y', g.vy * dt);
    if (hitY) { g.vx *= 0.7; g.vz *= 0.7; }
    if ((hitX || hitZ || hitY) && Math.hypot(g.vx, g.vy, g.vz) > 1.5) emit(state, EV.BOUNCE, g.owner, g.x, g.y, g.z);
    g.fuse -= dt;
    if (g.fuse <= 0) detonate(state, g);
  }
}

/** Does a smoke cloud sit on the line between two points? Bots cannot see through one. */
export function smokeBetween(state, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  for (let i = 0; i < state.nades.length; i++) {
    const g = state.nades[i];
    if (!g.live || g.cloud <= 0) continue;
    const cx = g.x - ax, cy = g.y + CLOUD_Y - ay, cz = g.z - az;
    const t = Math.min(1, Math.max(0, (cx * dx + cy * dy + cz * dz) / len2));
    const r = NADES.smoke.radius * Math.min(1, (NADES.smoke.life - g.cloud) * 0.8 + 0.2);
    if (Math.hypot(cx - dx * t, cy - dy * t, cz - dz * t) < r) return true;
  }
  return false;
}
