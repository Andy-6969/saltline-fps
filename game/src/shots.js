// Staged stills for the screenshots: `?shot=1&seed=7&...` plays the real simulation forward,
// bots and all, to a moment worth a picture and holds it. The frame is the game's own renderer
// and HUD; shots.json lists the stills taken.

import { ATK, DEF, RULES } from './sim/config.js';
import { setPlayerTeam } from './sim/state.js';
import { beginMatch } from './sim/sim.js';

export function stageShot(query, state, step, input, draw) {
  const me = state.actors[state.playerId];
  const list = (key) => (query.get(key) || '').split(',').filter(Boolean);
  setPlayerTeam(state, query.get('as') === 'def' ? DEF : ATK);
  beginMatch(state);
  for (const a of state.actors) a.money = Number(query.get('money')) || a.money;
  const buys = list('buy'), held = list('hold'), at = list('at').map(Number);
  const run = (ticks, drive) => {
    for (let i = 0; i < ticks; i++) {
      me.cmd.buy = buys.shift() || '';
      if (drive) drive(me.cmd);
      step();
    }
  };
  const live = Number(query.get('t')) || 0;
  if (live > 0) run(Math.round((RULES.freezeT + live) * 60));
  else run(20);
  if (at.length === 4) {
    me.x = me.px = at[0]; me.z = me.pz = at[1];
    me.cmd.yaw = at[2]; me.cmd.pitch = at[3];
    input.face(at[2], at[3]);
    me.vx = me.vz = 0;
  }
  const press = (cmd) => { for (const key of held) cmd[key] = true; };
  run(Number(query.get('ticks')) || 12, press);
  draw(); // settle the camera there, so effects of the last steps start from the right place
  run(4, press);
  input.buyOpen = query.get('open') === 'buy';
  input.scores = query.get('open') === 'scores';
}
