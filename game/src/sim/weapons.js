// Gunplay for one actor per tick: draw, reload, the accuracy cone, recoil, hit-scan against
// head / body / leg volumes, armour, wall penetration and damage. Bots fire through this same code.

import { ECON, WEAPONS } from './config.js';
import { clamp } from './math.js';
import { castRay, rayHit } from './collide.js';
import { runShare } from './movement.js';
import { EV, emit, eyeY, noise } from './state.js';
import { dropBomb } from './round.js';
import { throwNade } from './grenades.js';

const HEAD = 2, BODY = 1, LEGS = 0;
const ZONE_MUL = [0.75, 1, 0]; // legs, body; the head uses the weapon's own multiplier
const HEAD_R = 0.15, BODY_R = 0.29, RANGE = 120;
let zone = BODY;

/** The gun in hand, or null while a grenade is. */
export const gunOf = (a) => (a.slot < 2 ? WEAPONS[a.guns[a.slot]] : null);
export const bestGunSlot = (a) => (a.guns[0] ? 0 : 1);

/** Give a gun a full magazine and reserve in its slot. */
export function giveGun(a, id) {
  const g = WEAPONS[id];
  a.guns[g.slot] = id;
  a.mag[g.slot] = g.mag;
  a.res[g.slot] = g.reserve;
}

// Where a ray enters an actor, or -1. Sets `zone`. The head is a sphere, the rest an upright
// cylinder whose lower 42% counts as legs; crouching shrinks the whole silhouette.
function rayActor(v, ox, oy, oz, dx, dy, dz) {
  let best = -1;
  const hx = ox - v.x, hy = oy - (v.y + v.h - HEAD_R), hz = oz - v.z;
  let b = hx * dx + hy * dy + hz * dz;
  let disc = b * b - (hx * hx + hy * hy + hz * hz - HEAD_R * HEAD_R);
  if (disc >= 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0) { best = t; zone = HEAD; }
  }
  const a2 = dx * dx + dz * dz;
  if (a2 > 1e-8) {
    b = hx * dx + hz * dz;
    disc = b * b - a2 * (hx * hx + hz * hz - BODY_R * BODY_R);
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a2;
      const y = oy + dy * t - v.y;
      if (t > 0 && y >= 0 && y <= v.h - HEAD_R * 1.6 && (best < 0 || t < best)) {
        best = t;
        zone = y < v.h * 0.42 ? LEGS : BODY;
      }
    }
  }
  return best;
}

/** Apply damage; handles armour, death, the kill reward and dropping the charge. */
export function hurt(state, victim, attacker, dmg, hitZone, through, cause) {
  const gun = WEAPONS[cause];
  if (victim.armor > 0 && hitZone !== LEGS && (hitZone !== HEAD || victim.helmet)) {
    const pass = gun ? gun.armor : 0.6;
    victim.armor = Math.max(0, victim.armor - dmg * (1 - pass) * 0.5);
    dmg *= pass;
  }
  dmg = Math.round(dmg);
  if (dmg <= 0 || !victim.alive) return;
  victim.hp -= dmg;
  victim.hurtT = 0.6;
  victim.hurtYaw = Math.atan2(-(attacker.x - victim.x), -(attacker.z - victim.z));
  const e = emit(state, victim.hp > 0 ? EV.HURT : EV.KILL, attacker.id, victim.x, victim.y + victim.h * 0.6, victim.z);
  e.b = victim.id;
  e.n = hitZone === HEAD ? 2 : through ? 1 : 0; // 2 headshot, 1 through cover
  e.s = gun ? gun.name : cause;
  if (victim.hp > 0) return;
  victim.hp = 0;
  victim.alive = false;
  victim.deaths++;
  victim.zoomed = false;
  victim.useT = 0;
  if (attacker.team !== victim.team) {
    attacker.kills++;
    attacker.money = Math.min(ECON.max, attacker.money + (gun ? gun.reward : 300));
  }
  if (state.bomb.carrier === victim.id) dropBomb(state, victim);
}

// The accuracy cone right now: tight when still and crouched, wide on the run, wider in the air,
// and growing with each shot of a spray. The crosshair gap shows this number.
function coneOf(a, gun) {
  let cone = gun.spread;
  if (gun.zoom) cone = a.zoomed ? 0.0006 : gun.spread;
  if (a.crouch > 0.5) cone *= 0.72;
  cone += gun.moveSpread * clamp(runShare(a), 0, 1.15);
  if (!a.onGround) cone += gun.moveSpread * 1.4 + 0.025;
  return cone + Math.min(a.shots, 12) * gun.kick * 0.055;
}

function fireGun(state, a, gun) {
  const rng = state.rng;
  a.mag[a.slot]--;
  a.cooldown = 1 / gun.rate;
  const ox = a.x, oy = eyeY(a), oz = a.z;
  noise(state, ox, oz, 48, a.team);
  for (let p = 0; p < gun.pellets; p++) {
    const r = a.spread * Math.sqrt(rng()), th = rng() * 6.2832;
    const yaw = a.yaw + a.punchY + r * Math.cos(th);
    const pitch = a.pitch + a.punchP + r * Math.sin(th);
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    castRay(ox, oy, oz, dx, dy, dz, RANGE);
    const tWall = rayHit.t, tSolid = rayHit.tSolid;
    const mat = rayHit.box ? rayHit.box.mat : 'ground';
    const nx = rayHit.nx, ny = rayHit.ny, nz = rayHit.nz;
    // Nearest enemy the ray enters before solid cover. Thin cover (wood, sheet) only weakens it.
    let victim = null, tHit = gun.wall > 0 ? tSolid : tWall, hitZone = BODY;
    for (let i = 0; i < state.actors.length; i++) {
      const v = state.actors[i];
      if (!v.alive || v.team === a.team) continue;
      const t = rayActor(v, ox, oy, oz, dx, dy, dz);
      if (t > 0 && t < tHit) { tHit = t; victim = v; hitZone = zone; }
    }
    const end = victim ? tHit : tWall;
    const shot = emit(state, EV.SHOT, a.id, ox, oy, oz);
    shot.x2 = ox + dx * end; shot.y2 = oy + dy * end; shot.z2 = oz + dz * end;
    shot.n = p;
    if (tWall < RANGE && (!victim || tHit > tWall)) {
      const imp = emit(state, EV.IMPACT, a.id, ox + dx * tWall, oy + dy * tWall, oz + dz * tWall);
      imp.x2 = nx; imp.y2 = ny; imp.z2 = nz;
      imp.s = mat;
    }
    if (victim) {
      const through = tHit > tWall;
      let dmg = gun.dmg * Math.pow(gun.falloff, tHit / 10) * (hitZone === HEAD ? gun.head : ZONE_MUL[hitZone]);
      if (through) dmg *= gun.wall;
      hurt(state, victim, a, dmg, hitZone, through, a.guns[a.slot]);
    }
  }
  // Recoil: the view climbs, then weaves; the pattern is fixed per weapon, so it can be learned.
  const n = a.shots;
  a.punchP += gun.kick * (n < 9 ? 1 : 0.4);
  a.punchY += gun.sway * Math.sin(n * 0.85 + 0.6) * (n > 2 ? 1 : 0.25);
  a.shots++;
  a.sinceShot = 0;
}

export function stepWeapon(state, a, dt) {
  const c = a.cmd;
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.drawT = Math.max(0, a.drawT - dt);
  a.sinceShot += dt;
  if (a.sinceShot > 0.28) a.shots = Math.max(0, a.shots - 16 * dt);

  // Swap what is in hand.
  if (c.slot >= 0 && c.slot !== a.slot && (c.slot < 2 ? a.guns[c.slot] : a.nades[c.slot - 2] > 0)) {
    a.slot = c.slot;
    a.drawT = 0.45;
    a.reloadT = 0;
    a.shots = 0;
  }
  const gun = gunOf(a);
  const recover = Math.min(1, (gun ? gun.recover : 8) * dt);
  a.punchP -= a.punchP * recover;
  a.punchY -= a.punchY * recover;
  const busy = a.drawT > 0 || a.useT > 0 || state.round.phase === 'freeze';

  if (!gun) {
    a.zoomed = false;
    a.spread = 0.02;
    // A grenade leaves the hand on release of the trigger; right mouse makes it a short lob.
    if (a.triggerHeld && !c.fire && !busy) {
      throwNade(state, a, c.zoom);
      a.cooldown = 0.5;
      if (a.nades[a.slot - 2] <= 0) { a.slot = bestGunSlot(a); a.drawT = 0.45; }
    }
    a.triggerHeld = c.fire;
    return;
  }

  const s = a.slot;
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0) {
      const take = Math.min(gun.mag - a.mag[s], a.res[s]);
      a.mag[s] += take;
      a.res[s] -= take;
      a.reloadT = 0;
    }
  } else if ((c.reload || a.mag[s] === 0) && a.mag[s] < gun.mag && a.res[s] > 0 && !busy) {
    a.reloadT = gun.reload;
    emit(state, EV.RELOAD, a.id, a.x, a.y, a.z).s = gun.kind;
  }
  a.zoomed = gun.zoom > 0 && c.zoom && a.reloadT === 0 && !busy;
  a.spread = coneOf(a, gun);

  if (c.fire && !busy && a.cooldown === 0 && a.reloadT === 0 && (gun.auto || !a.triggerHeld)) {
    if (a.mag[s] > 0) fireGun(state, a, gun);
    else if (!a.triggerHeld) emit(state, EV.DRY, a.id, a.x, a.y, a.z);
  }
  a.triggerHeld = c.fire;
}

/** Blast damage with line of sight and distance falloff: frag grenades and the charge use it. */
export function blast(state, x, y, z, radius, damage, owner, cause) {
  for (let i = 0; i < state.actors.length; i++) {
    const v = state.actors[i];
    if (!v.alive) continue;
    const cy = v.y + v.h * 0.6;
    const d = Math.hypot(v.x - x, cy - y, v.z - z);
    if (d >= radius) continue;
    const blocked = d > 0.5 && castRay(x, y, z, (v.x - x) / d, (cy - y) / d, (v.z - z) / d, d - 0.3) && rayHit.tSolid < d - 0.3;
    if (cause === 'charge' || !blocked) hurt(state, v, owner, damage * (1 - d / radius), BODY, false, cause);
  }
}

