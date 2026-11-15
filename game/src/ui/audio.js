// Sound, synthesised with the Web Audio API: no audio files. Gunshots are shaped noise over a
// low thump, tuned per weapon class; every world sound is panned and faded by where it happened
// relative to the listener, so a shot from Long Quay sounds like it came from Long Quay.

import { WEAPONS } from '../sim/config.js';
import { EV } from '../sim/state.js';

// Per weapon class: [noise seconds, low-pass Hz, thump Hz, loudness].
const GUN_VOICE = { pistol: [0.14, 3800, 150, 0.55], smg: [0.11, 4600, 170, 0.5], rifle: [0.2, 3000, 105, 0.8], shotgun: [0.34, 1900, 70, 1], sniper: [0.5, 2300, 58, 1.1] };

export function createAudio(state) {
  let ctx = null, master = null, noiseBuf = null;

  /** Browsers only allow audio after a click: called from the menu button. */
  function unlock() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const squash = ctx.createDynamicsCompressor();
    master.connect(squash).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // Where a world sound sits for the listener: [gain, pan]. A sound with no place is centred.
  const place = [1, 0];
  function locate(x, z, reach) {
    const me = state.actors[state.viewId];
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
    place[0] = Math.max(0, 1 - d / reach) ** 1.6;
    place[1] = d < 0.5 ? 0 : Math.max(-1, Math.min(1, (Math.cos(me.yaw) * dx - Math.sin(me.yaw) * dz) / d));
    return place;
  }
  function out(gain, pan, t, attack, decay) {
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(p).connect(master);
    return g;
  }
  function noise(gain, pan, dur, cutoff, type = 'lowpass', delay = 0) {
    if (gain < 0.004) return;
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    src.loopStart = Math.random() * 0.5;
    f.type = type;
    f.frequency.value = cutoff;
    src.connect(f).connect(out(gain, pan, t, 0.002, dur));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }
  function tone(gain, pan, dur, freq, slideTo = freq, wave = 'sine', delay = 0) {
    if (gain < 0.004) return;
    const t = ctx.currentTime + delay, osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    osc.connect(out(gain, pan, t, 0.004, dur));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Play the sound of one simulation event. */
  function onEvent(e) {
    if (!ctx) return;
    const mine = e.a === state.viewId, actor = e.a >= 0 ? state.actors[e.a] : null;
    if (e.type === EV.SHOT && e.n === 0) {
      const v = GUN_VOICE[WEAPONS[actor.guns[actor.slot]].kind], [g, pan] = locate(e.x, e.z, 85);
      const far = 1 - g; // distance dulls the crack and leaves the thump
      noise(g * v[3], pan, v[0], v[1] * (1 - far * 0.75));
      noise(g * v[3] * 0.4 * (1 - far), pan, 0.03, 7000, 'highpass');
      tone(g * v[3] * 0.9, pan, v[0] * 0.8, v[2] * 1.6, v[2] * 0.5);
      if (far > 0.25) noise(g * 0.25, -pan, v[0] * 2, 900, 'lowpass', 0.09); // the report coming back off the walls
    } else if (e.type === EV.IMPACT && Math.random() < 0.5) {
      const [g, pan] = locate(e.x, e.z, 22);
      noise(g * 0.25, pan, 0.05, e.s === 'metal' || e.s === 'sheet' || e.s === 'container' ? 6500 : 2200, 'bandpass');
    } else if (e.type === EV.STEP || e.type === EV.LAND) {
      const [g, pan] = locate(e.x, e.z, 20);
      noise(g * (mine ? 0.16 : 0.3) * (e.type === EV.LAND ? 1.8 : 1), pan, 0.07, 420 + Math.random() * 160);
    } else if (e.type === EV.RELOAD) {
      const [g, pan] = locate(e.x, e.z, 16), dur = WEAPONS[actor.guns[actor.slot]].reload;
      noise(g * 0.35, pan, 0.03, 3200, 'bandpass', 0.15);
      noise(g * 0.4, pan, 0.04, 2400, 'bandpass', dur * 0.55);
      noise(g * 0.5, pan, 0.03, 4200, 'bandpass', dur * 0.88);
    } else if (e.type === EV.DRY) noise(0.25, 0, 0.02, 5000, 'bandpass');
    else if (e.type === EV.BOUNCE) { const [g, pan] = locate(e.x, e.z, 26); noise(g * 0.35, pan, 0.03, 2600, 'bandpass'); tone(g * 0.2, pan, 0.05, 900, 500); }
    else if (e.type === EV.BOOM || e.type === EV.EXPLODE) {
      const big = e.type === EV.EXPLODE ? 1.6 : 1, [g, pan] = locate(e.x, e.z, 110 * big);
      noise(g * 1.3, pan, 0.9 * big, 700);
      tone(g * 1.2, pan, 0.7 * big, 90, 28);
    } else if (e.type === EV.FLASHBANG) {
      const [g, pan] = locate(e.x, e.z, 70);
      noise(g, pan, 0.25, 5000, 'highpass');
      if (state.actors[state.viewId].flashT > 0.5) tone(0.22, 0, 2.6, 4100, 3900); // ears ringing
    } else if (e.type === EV.SMOKE) { const [g, pan] = locate(e.x, e.z, 30); noise(g * 0.5, pan, 1.6, 1500, 'bandpass'); }
    else if (e.type === EV.BEEP) { const [g, pan] = locate(e.x, e.z, 45); tone(g * 0.35 + 0.02, pan, 0.07, 1480, 1480, 'square'); }
    else if (e.type === EV.PLANTING || e.type === EV.DEFUSING) { const [g, pan] = locate(e.x, e.z, 25); for (let i = 0; i < 4; i++) tone(g * 0.25, pan, 0.04, 900 + i * 120, 900 + i * 120, 'square', i * 0.12); }
    else if (e.type === EV.PLANTED) { tone(0.3, 0, 0.5, 220, 110, 'sawtooth'); tone(0.25, 0, 0.18, 880, 880, 'square', 0.1); }
    else if (e.type === EV.DEFUSED) { tone(0.3, 0, 0.12, 660); tone(0.3, 0, 0.3, 990, 990, 'sine', 0.12); }
    else if (e.type === EV.HURT || e.type === EV.KILL) {
      if (e.b === state.viewId) { noise(0.5, 0, 0.12, 500); tone(0.3, 0, 0.15, 140, 70); }
      else if (mine) tone(e.n === 2 ? 0.4 : 0.22, 0, e.n === 2 ? 0.22 : 0.05, e.n === 2 ? 2500 : 1100, e.n === 2 ? 1900 : 900, 'triangle'); // hit tick; a headshot rings
    } else if (!mine && e.type !== EV.PHASE) return;
    else if (e.type === EV.BOUGHT) { tone(0.2, 0, 0.06, 1300); tone(0.2, 0, 0.1, 1750, 1750, 'sine', 0.07); }
    else if (e.type === EV.DENIED) tone(0.2, 0, 0.14, 170, 150, 'square');
    else if (e.type === EV.PICKUP) tone(0.2, 0, 0.1, 700, 1000);
    else if (e.type === EV.PHASE && e.s === 'live') { tone(0.25, 0, 0.12, 520); tone(0.25, 0, 0.25, 780, 780, 'sine', 0.13); }
    else if (e.type === EV.PHASE && e.s === 'over') {
      const won = state.round.winner === state.actors[state.playerId].team;
      [0, 1, 2].forEach((i) => tone(0.22, 0, 0.5, (won ? [392, 494, 587] : [330, 277, 220])[i], undefined, 'triangle', i * 0.14));
    }
  }

  return { unlock, onEvent };
}
