// The first-person weapon: the gun in your hands, drawn in its own scene over the world so it
// never clips into a wall. It bobs with your stride, lags behind the mouse, kicks with each shot,
// dips to reload, throws brass, and lights up with the muzzle flash.

import * as THREE from 'three';
import { ATK, MOVE, NADE_KINDS, WEAPONS } from '../sim/config.js';
import { buildGun, buildNade, GUN_FIT } from './guns.js';
import { makeSpriteTexture } from './textures.js';

const SHELLS = 10;

export function createViewmodel(environment) {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.3;
  const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 6);
  scene.add(new THREE.HemisphereLight(0xbcd0ea, 0x7a5c40, 1.8));
  const key = new THREE.DirectionalLight(0xffd9a8, 2.6);
  key.position.set(-1.2, 1.4, 1);
  scene.add(key);
  const flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
  scene.add(flashLight);

  const holder = new THREE.Group(); // everything that moves with the weapon
  scene.add(holder);
  const sleeves = [new THREE.MeshStandardMaterial({ color: 0xb5562a, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x2c4a6e, roughness: 0.8 })];
  const glove = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.65 });
  // Each arm: a sleeve running back out of view and a gloved fist on the weapon.
  const arms = [0, 1].map(() => {
    const arm = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 10).rotateX(Math.PI / 2), sleeves[0]);
    sleeve.position.z = 0.21;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.09), glove);
    arm.add(sleeve, fist);
    holder.add(arm);
    return { arm, sleeve };
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: makeSpriteTexture(5), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.visible = false;
  holder.add(flash);

  const brass = new THREE.MeshStandardMaterial({ color: 0xc9973a, roughness: 0.3, metalness: 1 });
  const shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6).rotateX(Math.PI / 2);
  const shells = [];
  for (let i = 0; i < SHELLS; i++) {
    const mesh = new THREE.Mesh(shellGeo, brass);
    mesh.visible = false;
    scene.add(mesh);
    shells.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  const models = {}; // weapon id -> model, built the first time it is drawn
  let shown = null, shownId = '', nextShell = 0;
  let kick = 0, flashT = 0, bob = 0, swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0, land = 0;

  /** A shot left the gun in view: kick it back, flash, and eject a case. */
  function fired(gun) {
    kick = Math.min(1.6, kick + gun.kick * 22);
    flashT = 0.05;
    flash.rotation.z = Math.random() * 6.28;
    flash.scale.setScalar(0.4 + Math.random() * 0.25 + gun.kick * 4);
    const s = shells[nextShell];
    nextShell = (nextShell + 1) % SHELLS;
    holder.localToWorld(s.mesh.position.set(0.03, 0.06, -0.06));
    s.vx = 0.9 + Math.random() * 0.5; s.vy = 1.1 + Math.random() * 0.5; s.vz = 0.2 - Math.random() * 0.4;
    s.life = 0.55;
    s.mesh.visible = true;
  }

  function update(dt, a, state) {
    const inHand = a.slot < 2 ? a.guns[a.slot] : NADE_KINDS[a.slot - 2];
    if (inHand !== shownId) {
      if (shown) holder.remove(shown);
      shown = models[inHand] ||= a.slot < 2 ? buildGun(inHand) : buildNade(inHand);
      holder.add(shown);
      shownId = inHand;
    }
    const gun = WEAPONS[shownId], fit = GUN_FIT[shownId];
    for (const { sleeve } of arms) sleeve.material = sleeves[a.team === ATK ? 0 : 1];
    holder.visible = a.alive && !a.zoomed;

    // Stride bob, mouse-lag sway, landing dip.
    const share = a.onGround ? Math.min(1, Math.hypot(a.vx, a.vz) / MOVE.run) : 0;
    bob += dt * (5 + share * 7);
    const dyaw = a.yaw - lastYaw, dpitch = a.pitch - lastPitch;
    lastYaw = a.yaw; lastPitch = a.pitch;
    const ease = Math.min(1, dt * 9);
    swayX += (THREE.MathUtils.clamp(dyaw * 1.2, -0.05, 0.05) - swayX) * ease;
    swayY += (THREE.MathUtils.clamp(dpitch * 1.2, -0.05, 0.05) - swayY) * ease;
    land += ((a.onGround ? 0 : 0.03) - land) * ease;
    kick *= Math.exp(-dt * 14);
    flashT -= dt;

    // Reload dips and rolls the weapon; drawing raises it from below; using the charge lowers it.
    const reload = gun && a.reloadT > 0 ? Math.sin((1 - a.reloadT / gun.reload) * Math.PI) : 0;
    const away = Math.max(a.drawT / 0.45, a.useT > 0 ? 1 : 0, state.round.phase === 'freeze' ? 0.25 : 0);
    const base = fit ? fit.hold : [0.17, -0.19, -0.4];
    const cock = !gun && a.triggerHeld ? 0.12 : 0; // a grenade is drawn back while the trigger is held
    holder.position.set(
      base[0] + swayX + Math.sin(bob) * 0.006 * share,
      base[1] + swayY - Math.abs(Math.cos(bob)) * 0.008 * share - reload * 0.13 - away * 0.3 - land + cock,
      base[2] + kick * 0.035 + a.crouch * 0.02 + cock,
    );
    holder.rotation.set(kick * 0.07 - away * 0.9 + a.punchP * 0.6 + reload * 0.25, swayX * 2.5 + a.punchY * 0.6 + reload * 0.5, reload * -0.55 - swayX * 2);

    // Hands: right on the grip, left under the fore-end (or cupping a pistol).
    arms[0].arm.position.set(0.005, -0.05, 0.05);
    arms[0].arm.rotation.set(0.62, 0.3, 0);
    arms[1].arm.position.set(-0.02, fit && fit.off < -0.1 ? -0.02 : -0.07, fit ? fit.off : 0);
    arms[1].arm.rotation.set(0.95, -0.55, 0);
    arms[1].arm.visible = !!gun && reload < 0.3;

    flash.visible = flashT > 0 && !!gun;
    flashLight.intensity = flash.visible ? 6 : 0;
    if (fit) {
      flash.position.set(0, fit.bore, fit.muzzle - 0.06);
      holder.localToWorld(flashLight.position.set(0, fit.bore, fit.muzzle));
    }
    for (const s of shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= 9.8 * dt;
      s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += dt * 20; s.mesh.rotation.z += dt * 13;
      s.mesh.visible = s.life > 0;
    }
  }

  /** The muzzle of the weapon in view, in world space: where the player's tracers start. */
  function muzzleWorld(worldCamera, out) {
    const fit = GUN_FIT[shownId];
    holder.localToWorld(out.set(0, fit ? fit.bore : 0, fit ? fit.muzzle : -0.5));
    return out.applyMatrix4(worldCamera.matrixWorld);
  }

  return { scene, camera, update, fired, muzzleWorld };
}
