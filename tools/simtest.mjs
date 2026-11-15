// Headless check of the simulation: prints the nav grid, then plays bot-only matches and reports
// how rounds end. Run with `node tools/simtest.mjs [matches]`.
import { createState } from '../game/src/sim/state.js';
import { beginMatch, stepSim } from '../game/src/sim/sim.js';
import { TICK, ATK } from '../game/src/sim/config.js';
import { BOUNDS, ROUTES, HOLDS, PLANT_SPOTS, SPAWNS } from '../game/src/sim/map.js';
import { isWalkable, findPath } from '../game/src/sim/nav.js';

for (let z = BOUNDS.z0; z < BOUNDS.z1; z++) {
  let row = '';
  for (let x = BOUNDS.x0; x < BOUNDS.x1; x++) row += isWalkable(x + 0.5, z + 0.5) ? '.' : '#';
  console.log(row);
}
// Every tactical point must be walkable and reachable from the attackers' spawn.
const buf = new Float32Array(96);
const pts = [];
ROUTES.flat().forEach((r) => r.pts.forEach((p) => pts.push([r.name, p[0], p[1]])));
HOLDS.flat().forEach((h) => pts.push(['hold', h.x, h.z]));
PLANT_SPOTS.flat().forEach((p) => pts.push(['plant', p[0], p[1]]));
SPAWNS.forEach((s) => s.xs.forEach((x) => pts.push(['spawn', x, s.z])));
let bad = 0;
for (const [name, x, z] of pts) {
  const n = findPath(0, 20.8, x, z, buf);
  if (!isWalkable(x, z) || n === 0) { bad++; console.log('BAD POINT', name, x, z, isWalkable(x, z), n); }
}
console.log('tactical points:', pts.length, 'bad:', bad);

const matches = Number(process.argv[2] || 2);
const reasons = {};
const wins = [0, 0];
let rounds = 0, ticks = 0, nan = 0, plants = 0, kills = 0;
const t0 = performance.now();
for (let m = 0; m < matches; m++) {
  const state = createState(1000 + m, ATK);
  state.actors[0].isBot = true; // let a bot drive the player's body
  beginMatch(state);
  let lastNum = 0;
  for (let i = 0; i < 60 * 60 * 40 && state.round.phase !== 'match'; i++) {
    stepSim(state, TICK);
    ticks++;
    for (let e = 0; e < state.evCount; e++) {
      const ev = state.events[e];
      if (ev.type === 14) plants++;
      if (ev.type === 4) kills++;
      if (ev.type === 19 && ev.s === 'over') { reasons[state.round.reason] = (reasons[state.round.reason] || 0) + 1; rounds++; wins[state.round.winner]++; }
    }
    state.evCount = 0;
    for (const a of state.actors) if (!Number.isFinite(a.x + a.y + a.z + a.yaw + a.pitch)) nan++;
    lastNum = state.round.num;
  }
  console.log(`match ${m}: score ${state.round.score.join('-')} after ${lastNum} rounds, atkSquad ${state.round.atkSquad}, phase ${state.round.phase}`);
}
console.log({ atkWins: wins[0], defWins: wins[1], rounds, reasons, plants, kills, nan, ticks, msPerTick: (performance.now() - t0) / ticks });
