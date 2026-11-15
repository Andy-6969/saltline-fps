// Keyboard and mouse. The mouse turns the view at once; everything else is sampled into the
// player's command record once per simulation step, so the simulation never touches the DOM.

import { BUY_ORDER } from '../sim/config.js';

const SENSITIVITY = 0.0021;
const SLOT_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };
const BUY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

export function createInput(canvas) {
  const held = new Set();
  const input = {
    locked: false, buyOpen: false, scores: false,
    yaw: 0, pitch: 0, // where the mouse has turned the view
    onLockChange: null,
  };
  let fire = false, zoom = false, jump = false, slot = -1, buy = '';

  let loose = false; // playing without pointer lock, where an embedded frame refuses it
  function setLocked(on) {
    input.locked = on;
    if (!on) { held.clear(); fire = zoom = false; }
    if (input.onLockChange) input.onLockChange(on);
  }
  document.addEventListener('pointerlockchange', () => setLocked(document.pointerLockElement === canvas));
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.yaw -= e.movementX * SENSITIVITY;
    input.pitch = Math.max(-1.5, Math.min(1.5, input.pitch - e.movementY * SENSITIVITY));
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) fire = true;
    if (e.button === 2) zoom = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) fire = false;
    if (e.button === 2) zoom = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (!input.locked) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === 'Escape' && loose) setLocked(false);
    if (e.code === 'Space') jump = true;
    if (e.code === 'KeyB') input.buyOpen = !input.buyOpen;
    else if (input.buyOpen && BUY_KEYS.includes(e.code)) buy = BUY_ORDER[BUY_KEYS.indexOf(e.code)];
    else if (e.code in SLOT_KEYS) slot = SLOT_KEYS[e.code];
    if (e.code === 'Tab') input.scores = true;
  });
  document.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (e.code === 'Tab') input.scores = false;
  });

  /** Take the pointer (must be called from a click). */
  input.lock = () => {
    const asked = canvas.requestPointerLock();
    if (asked) asked.catch(() => { loose = true; setLocked(true); });
  };
  /** Point the view somewhere: used when a round respawns the player. */
  input.face = (yaw, pitch) => { input.yaw = yaw; input.pitch = pitch; };

  /** Write this step's intent into a command record; one-shot presses are consumed. */
  input.sample = (cmd) => {
    cmd.mx = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    cmd.mz = (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0);
    cmd.yaw = input.yaw;
    cmd.pitch = input.pitch;
    cmd.crouch = held.has('ControlLeft') || held.has('KeyC');
    cmd.walk = held.has('ShiftLeft');
    cmd.reload = held.has('KeyR');
    cmd.use = held.has('KeyE');
    cmd.fire = fire && !input.buyOpen;
    cmd.zoom = zoom;
    cmd.jump = jump;
    cmd.slot = slot;
    if (buy) cmd.buy = buy;
    jump = false;
    slot = -1;
    buy = '';
  };
  return input;
}
