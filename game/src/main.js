// SALTLINE entry point: builds the state, the view and the UI, then runs the loop.
// The simulation advances in fixed 1/60 s steps however fast frames arrive; each frame is drawn
// part-way between the last two steps, so motion is smooth on any display.

import { ATK, DEF, TEAM_NAMES, TICK } from './sim/config.js';
import { EV, createState, setPlayerTeam } from './sim/state.js';
import { beginMatch, stepSim } from './sim/sim.js';
import { createView } from './render/view.js';
import { createInput } from './ui/input.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './ui/audio.js';
import { stageShot } from './shots.js';

const query = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const state = createState(Number(query.get('seed')) || (Date.now() & 0xffff), ATK);
const input = createInput(canvas);
const view = createView(canvas, state);
const hud = createHud(state, input);
const audio = createAudio(state);
const screens = { menu: document.getElementById('menu'), pause: document.getElementById('pause'), end: document.getElementById('end') };
const me = state.actors[state.playerId];
const shot = query.get('shot'); // a staged still for the screenshots: see shots.js
let last = performance.now(), pending = 0;

function showScreen(name) {
  for (const key of Object.keys(screens)) screens[key].classList.toggle('on', key === name);
}

function play(team) {
  setPlayerTeam(state, team);
  beginMatch(state);
  audio.unlock();
  input.lock();
  showScreen('');
}
document.getElementById('playAtk').onclick = () => play(ATK);
document.getElementById('playDef').onclick = () => play(DEF);
document.getElementById('resume').onclick = () => input.lock();
document.getElementById('again').onclick = () => { state.round.phase = 'menu'; showScreen('menu'); };
// Losing the pointer mid-match pauses it: the loop below only steps while the mouse is held.
input.onLockChange = (locked) => {
  const phase = state.round.phase;
  if (phase !== 'menu' && phase !== 'match') showScreen(locked ? '' : 'pause');
};

/** Advance the simulation one step and hand its events to everything that shows or plays them. */
function step() {
  if (!shot) input.sample(me.cmd);
  stepSim(state, TICK);
  for (let i = 0; i < state.evCount; i++) {
    const e = state.events[i];
    view.onEvent(e);
    hud.onEvent(e);
    audio.onEvent(e);
    if (e.type === EV.PHASE && e.s === 'freeze') input.face(me.yaw, 0); // respawned: look where the spawn faces
    if (e.type === EV.PHASE && e.s === 'match') {
      const won = state.round.score[me.squad] > state.round.score[1 - me.squad];
      document.getElementById('endTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
      document.getElementById('endText').textContent = `${TEAM_NAMES[me.team]} ${state.round.score[me.squad]} : ${state.round.score[1 - me.squad]} ${TEAM_NAMES[1 - me.team]}`;
      document.exitPointerLock();
      showScreen('end');
    }
  }
  state.evCount = 0;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (input.locked) {
    pending += dt;
    while (pending >= TICK) {
      step();
      pending -= TICK;
    }
  }
  view.render(dt, input.locked ? pending / TICK : 1);
  hud.update(dt, view.camera.fov);
  requestAnimationFrame(frame);
}

if (shot) {
  showScreen('');
  stageShot(query, state, step, input, () => view.render(1, 1));
  view.render(0.012, 1);
  hud.update(0.012, view.camera.fov);
  // Keep drawing the frozen moment (no time passes), and say so for whoever takes the picture.
  const hold = () => {
    view.render(0, 1);
    hud.update(0, view.camera.fov);
    document.title = 'shot-ready';
    requestAnimationFrame(hold);
  };
  requestAnimationFrame(hold);
} else requestAnimationFrame(frame);
