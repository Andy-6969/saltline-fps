// One fixed step of the whole simulation. main.js calls this at 60 Hz whatever the frame rate;
// rendering only ever reads the state this advances.

import { MOVE } from './config.js';
import { stepBots, planRound } from './bots.js';
import { stepMovement } from './movement.js';
import { stepWeapon } from './weapons.js';
import { stepNades } from './grenades.js';
import { stepRound, stepUse, tryBuy } from './round.js';

export { startMatch as beginMatch } from './round.js';

// Bodies do not block each other, they nudge apart: nobody gets body-blocked in a doorway.
function separate(state) {
  const min = MOVE.radius * 2;
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < state.actors.length; j++) {
      const o = state.actors[j];
      const dx = o.x - a.x, dz = o.z - a.z, d = Math.hypot(dx, dz);
      if (!o.alive || d >= min || d < 1e-4) continue;
      const push = ((min - d) / d) * 0.5 * 6;
      a.vx -= dx * push; a.vz -= dz * push;
      o.vx += dx * push; o.vz += dz * push;
    }
  }
}

export function stepSim(state, dt) {
  const phase = state.round.phase;
  if (phase === 'menu' || phase === 'match') return;
  state.tick++;
  state.time += dt;
  if (state.round.fresh) {
    state.round.fresh = false;
    planRound(state);
  }
  stepBots(state, dt);
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    a.flashT = Math.max(0, a.flashT - dt);
    a.hurtT = Math.max(0, a.hurtT - dt);
    if (!a.alive) { a.px = a.x; a.py = a.y; a.pz = a.z; continue; }
    if (a.cmd.buy) { tryBuy(state, a, a.cmd.buy); a.cmd.buy = ''; }
    stepMovement(state, a, dt);
    stepWeapon(state, a, dt);
    stepUse(state, a, dt);
  }
  separate(state);
  stepNades(state, dt);
  stepRound(state, dt);

  // A dead player watches through a living teammate's eyes.
  const me = state.actors[state.playerId];
  if (me.alive) state.viewId = me.id;
  else if (!state.actors[state.viewId].alive || state.viewId === me.id) {
    const mate = state.actors.find((a) => a.alive && a.team === me.team);
    state.viewId = mate ? mate.id : me.id;
  }
}
