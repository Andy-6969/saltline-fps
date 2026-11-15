// Body movement for one actor per tick: acceleration and friction on the ground, a little air
// control, crouching, jumping, and the footstep noise that running makes and walking does not.

import { MOVE, WEAPONS } from './config.js';
import { clamp, lerp } from './math.js';
import { canStand, moveBody } from './collide.js';
import { EV, emit, noise } from './state.js';

/** True while the actor may not walk: buy time, or hands busy planting or defusing. */
const rooted = (state, a) => state.round.phase === 'freeze' || a.useT > 0;

export function stepMovement(state, a, dt) {
  const c = a.cmd;
  a.px = a.x; a.py = a.y; a.pz = a.z;
  a.yaw = c.yaw;
  a.pitch = clamp(c.pitch, -1.5, 1.5);

  // Crouch eases in and out; standing up is refused under a low ceiling.
  const wantCrouch = c.crouch || (a.crouch > 0.5 && !canStand(a));
  a.crouch = clamp(a.crouch + (wantCrouch ? 1 : -1) * MOVE.crouchRate * dt, 0, 1);
  a.h = lerp(MOVE.standH, MOVE.crouchH, a.crouch);

  const still = rooted(state, a);
  const gun = a.slot < 2 ? WEAPONS[a.guns[a.slot]] : null;
  let top = MOVE.run * (gun ? gun.speed : 1);
  if (a.crouch > 0.5) top *= MOVE.crouchMul;
  else if (c.walk || a.zoomed) top *= MOVE.walkMul;

  // Wish direction in world space from the local stick (mx strafe, mz forward).
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  let wx = cos * c.mx - sin * c.mz;
  let wz = -sin * c.mx - cos * c.mz;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  if (still) wx = wz = 0;

  if (a.onGround) {
    // Friction first, so releasing the keys (or tapping the opposite one) stops the body quickly.
    const speed = Math.hypot(a.vx, a.vz);
    if (speed > 0) {
      const keep = Math.max(0, speed - Math.max(speed, 1.6) * MOVE.friction * dt) / speed;
      a.vx *= keep;
      a.vz *= keep;
    }
    accelerate(a, wx, wz, top, MOVE.accel * dt);
    if (c.jump && !still) {
      a.vy = MOVE.jump;
      a.onGround = false;
    }
  } else {
    accelerate(a, wx, wz, Math.min(top, 1), MOVE.airAccel * dt);
  }
  a.vy -= MOVE.gravity * dt;

  const fall = a.vy, wasGround = a.onGround;
  moveBody(a, dt);

  const moved = Math.hypot(a.x - a.px, a.z - a.pz);
  if (a.onGround && !wasGround && fall < -6) {
    emit(state, EV.LAND, a.id, a.x, a.y, a.z);
    noise(state, a.x, a.z, 12, a.team);
  }
  // Only a run is loud: shift-walking and crouching make no step events and no noise for bots.
  if (a.onGround && moved / dt > MOVE.run * 0.62) {
    a.stride += moved;
    if (a.stride > 2.3) {
      a.stride = 0;
      emit(state, EV.STEP, a.id, a.x, a.y, a.z);
      noise(state, a.x, a.z, 13, a.team);
    }
  }
}

// Quake-style acceleration: add speed along the wish direction only up to the cap, which gives
// crisp starts and makes counter-strafing (tapping the opposite key) the fastest way to stop.
function accelerate(a, wx, wz, top, amount) {
  const along = a.vx * wx + a.vz * wz;
  const add = Math.min(amount, top - along);
  if (add > 0) {
    a.vx += wx * add;
    a.vz += wz * add;
  }
}

/** Planar speed as a share of a full run, 0..1+: the accuracy penalty and view bob read it. */
export const runShare = (a) => Math.hypot(a.vx, a.vz) / MOVE.run;
