// The view: owns the three.js renderer, scene and camera, and draws the simulation's state.
// It reads the state and never writes it. Frames are drawn between simulation steps, so every
// moving thing is placed by blending its last two stepped positions (`alpha`).

import * as THREE from 'three';
import { MOVE, WEAPONS } from '../sim/config.js';
import { clamp, lerp } from '../sim/math.js';
import { EV } from '../sim/state.js';
import { buildWorld } from './world.js';
import { createActors } from './actors.js';
import { createEffects } from './effects.js';
import { createViewmodel } from './viewmodel.js';
import { createPost } from './post.js';

const FOV = 74;

export function createView(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.06, 600);
  camera.rotation.order = 'YXZ';
  buildWorld(scene, renderer);
  const actors = createActors(scene, state);
  const effects = createEffects(scene, state);
  const viewmodel = createViewmodel(scene.environment);
  const post = createPost(renderer);
  const from = new THREE.Vector3();
  let time = 0, bob = 0, dip = 0, fov = FOV;
  let scale = 1, slow = 0, frameT = 1 / 60; // adaptive quality: see render()

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
    const w = Math.max(2, Math.floor(canvas.clientWidth * ratio)), h = Math.max(2, Math.floor(canvas.clientHeight * ratio));
    renderer.setSize(w, h, false);
    post.resize(w, h);
    camera.aspect = viewmodel.camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewmodel.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /** Route one simulation event to the effects that show it. */
  function onEvent(e) {
    const mine = e.a === state.viewId;
    if (e.type === EV.SHOT) {
      if (mine) viewmodel.muzzleWorld(camera, from); else actors.muzzleOf(e.a, from);
      if (mine && e.n === 0) viewmodel.fired(WEAPONS[state.actors[e.a].guns[state.actors[e.a].slot]]);
    } else if (e.type === EV.LAND && mine) dip = 0.09;
    effects.onEvent(e, from, mine);
  }

  function placeCamera(dt, alpha) {
    const a = state.actors[state.viewId];
    if (state.round.num === 0) {
      // Before the match: a slow flight over the works.
      camera.position.set(Math.sin(time * 0.07) * 34, 17, Math.cos(time * 0.07) * 30);
      camera.lookAt(0, 1, -4);
      return a;
    }
    const share = a.onGround && a.alive ? Math.min(1, Math.hypot(a.vx, a.vz) / MOVE.run) : 0;
    bob += dt * share * 11;
    dip *= Math.exp(-dt * 9);
    const y = lerp(a.py, a.y, alpha) + a.h - MOVE.eyeDrop + Math.abs(Math.sin(bob)) * 0.028 * share - dip;
    camera.position.set(lerp(a.px, a.x, alpha), y, lerp(a.pz, a.z, alpha));
    camera.rotation.set(a.pitch + a.punchP, a.yaw + a.punchY, Math.sin(bob * 0.5) * 0.004 * share);
    if (!a.alive) {
      // Nobody left to watch through: hang over the body.
      camera.position.set(a.x + Math.sin(a.yaw) * 3.2, 3, a.z + Math.cos(a.yaw) * 3.2);
      camera.lookAt(a.x, 0.4, a.z);
    }
    return a;
  }

  /** Draw one frame. */
  function render(dt, alpha) {
    time += dt;
    // Hold 60 fps on modest hardware: if frames stay slow for two seconds, first drop multisampling,
    // then render at three-quarter resolution.
    frameT += (dt - frameT) * 0.05;
    slow = frameT > 1 / 48 && time > 3 ? slow + dt : 0;
    if (slow > 2 && scale === 1) {
      slow = 0;
      if (post.target.samples) post.setSamples(0); else { scale = 0.75; resize(); }
    }
    const a = placeCamera(dt, alpha);
    const playing = state.round.num > 0;
    const gun = a.slot < 2 ? WEAPONS[a.guns[a.slot]] : null;
    fov += ((a.zoomed && gun ? FOV * gun.zoom : FOV) - fov) * Math.min(1, dt * 18);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    actors.update(dt, alpha, playing && a.alive ? state.viewId : -1);
    effects.update(dt);
    if (playing) viewmodel.update(dt, a, state);

    renderer.setRenderTarget(post.target);
    renderer.clear();
    renderer.render(scene, camera);
    if (playing && a.alive) {
      renderer.clearDepth();
      renderer.render(viewmodel.scene, viewmodel.camera);
    }
    const scope = clamp((FOV - fov) / (FOV * 0.5), 0, 1);
    post.finish(time, clamp(a.flashT / 1.2, 0, 1), playing ? clamp(a.hurtT * 1.3, 0, 0.75) : 0, a.zoomed ? scope : 0);
  }

  return { render, onEvent, camera };
}
