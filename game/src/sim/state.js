// The whole match lives in one state object made here. The sim/ modules are the only writers;
// the renderer, HUD and audio read it and drain its event queue. Nothing in it is a three.js object.

import { ATK, DEF, BOT_NAMES, ECON, MOVE, RULES } from './config.js';
import { makeRng } from './math.js';

/** Things that happened this frame, for the view layer (sound, effects, kill feed). */
export const EV = {
  SHOT: 1, IMPACT: 2, HURT: 3, KILL: 4, STEP: 5, RELOAD: 6, DRY: 7, THROW: 8, BOUNCE: 9, BOOM: 10,
  FLASHBANG: 11, SMOKE: 12, PLANTING: 13, PLANTED: 14, DEFUSING: 15, DEFUSED: 16, BEEP: 17,
  EXPLODE: 18, PHASE: 19, BOUGHT: 20, RADIO: 21, PICKUP: 22, LAND: 23, DENIED: 24,
};
const MAX_EVENTS = 256;
const MAX_NADES = 16;
const MAX_NOISES = 16;

function makeCmd() {
  // One tick of intent. The player's comes from the keyboard and mouse, a bot's from its brain;
  // movement and weapons cannot tell the two apart.
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, crouch: false, walk: false, fire: false, zoom: false, reload: false, use: false, slot: -1, buy: '' };
}

function makeActor(id, squad, team, isBot, name) {
  return {
    id, squad, team, isBot, name,
    alive: false, hp: 0, armor: 0, helmet: false, kit: false, money: ECON.start, kills: 0, deaths: 0,
    x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    h: MOVE.standH, crouch: 0, onGround: true, stride: 0,
    guns: [null, 'wren'], mag: [0, 0], res: [0, 0], nades: [0, 0, 0], slot: 1,
    cooldown: 0, reloadT: 0, drawT: 0, shots: 0, sinceShot: 9, punchP: 0, punchY: 0, spread: 0,
    triggerHeld: false, zoomed: false, flashT: 0, useT: 0, hurtT: 0, hurtYaw: 0,
    cmd: makeCmd(), brain: null,
  };
}

export function createState(seed, playerTeam) {
  const state = {
    seed, rng: makeRng(seed), tick: 0, time: 0,
    playerId: 0, viewId: 0,
    actors: [],
    nades: [],
    // The charge: carried by an attacker, dropped where its carrier fell, or planted on a site.
    bomb: { mode: 'none', carrier: -1, x: 0, y: 0, z: 0, site: -1, timer: 0, beepT: 0, defuser: -1, planter: -1 },
    round: { phase: 'menu', t: 0, num: 0, score: [0, 0], lossRun: [0, 0], atkSquad: playerTeam === ATK ? 0 : 1, winner: -1, reason: '', matchOver: false, fresh: false },
    // Each team's plan for the round: the site attackers push, the site defenders believe is hit.
    plan: [{ site: 0, called: -1, calledT: 0, radioT: -9 }, { site: 0, called: -1, calledT: 0, radioT: -9 }],
    events: [], evCount: 0,
    noises: [], noiseHead: 0,
  };
  for (let squad = 0; squad < 2; squad++) {
    const team = squad === 0 ? playerTeam : 1 - playerTeam;
    for (let i = 0; i < RULES.teamSize; i++) {
      const id = squad * RULES.teamSize + i;
      const human = id === 0;
      state.actors.push(makeActor(id, squad, team, !human, human ? 'You' : BOT_NAMES[squad][i]));
    }
  }
  for (let i = 0; i < MAX_EVENTS; i++) state.events.push({ type: 0, a: -1, b: -1, n: 0, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, s: '' });
  for (let i = 0; i < MAX_NADES; i++) state.nades.push({ live: false, kind: '', owner: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, cloud: 0 });
  for (let i = 0; i < MAX_NOISES; i++) state.noises.push({ tick: -1, x: 0, z: 0, r: 0, team: 0 });
  return state;
}

/** Queue an event for the view layer and return its record to fill in. Records are reused. */
export function emit(state, type, a = -1, x = 0, y = 0, z = 0) {
  const e = state.events[state.evCount < MAX_EVENTS ? state.evCount++ : MAX_EVENTS - 1];
  e.type = type; e.a = a; e.b = -1; e.n = 0; e.x = x; e.y = y; e.z = z; e.s = '';
  return e;
}

/** A sound a bot can hear: gunfire, running steps, a charge being planted or defused. */
export function noise(state, x, z, r, team) {
  const n = state.noises[state.noiseHead];
  state.noiseHead = (state.noiseHead + 1) % MAX_NOISES;
  n.tick = state.tick; n.x = x; n.z = z; n.r = r; n.team = team;
}

export const eyeY = (a) => a.y + a.h - MOVE.eyeDrop;
export const teamAlive = (state, team) => {
  let n = 0;
  for (let i = 0; i < state.actors.length; i++) if (state.actors[i].alive && state.actors[i].team === team) n++;
  return n;
};
export const other = (team) => (team === ATK ? DEF : ATK);

/** Put the player's squad on a side (and the other squad on the other) before a match starts. */
export function setPlayerTeam(state, team) {
  state.round.atkSquad = team === ATK ? 0 : 1;
  for (let i = 0; i < state.actors.length; i++) state.actors[i].team = state.actors[i].squad === 0 ? team : other(team);
}
