// World effects from fixed pools: tracers, flashes, dust, sparks, bullet holes, grenades, smoke,
// blasts and the charge. Sim events start them, update() ages them; nothing allocates in play.

import * as THREE from 'three';
import { NADES, NADE_KINDS } from '../sim/config.js';
import { EV } from '../sim/state.js';
import { makeSpriteTexture } from './textures.js';
import { buildNade } from './guns.js';

const TRACERS = 40, PUFFS = 96, HOLES = 90, LIGHTS = 3, CLOUD = 12, TRACER_SPEED = 260;
const HARD = { metal: 1, sheet: 1, container: 1, rust: 1, roof: 1 };
const DUST = { wood: 0x8a6238, brick: 0xa06a50, salt: 0xf2f0e8, ground: 0xb8a482 };

export function createEffects(scene, state) {
  const soft = makeSpriteTexture(), star = makeSpriteTexture(4);
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);

  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.022, 0.022, 1).translate(0, 0, 0.5);
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, dist: 0, t: 0, live: false });
  }

  // Puffs: camera-facing sprites that drift, grow and fade (dust, sparks, smoke, flashes, blood).
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    puffs.push({ sprite, vx: 0, vy: 0, vz: 0, life: 0, span: 1, size: 1, grow: 0, alpha: 1 });
  }
  let nextPuff = 0, nextTracer = 0, nextHole = 0, nextLight = 0;
  function puff(x, y, z, color, size, span, grow, alpha, glow, rise) {
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % PUFFS;
    const m = p.sprite.material;
    m.map = glow === 2 ? star : soft;
    m.color.setHex(color);
    m.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.rotation = Math.random() * 6.28;
    p.sprite.position.set(x, y, z);
    p.vx = (Math.random() - 0.5) * rise; p.vy = rise * (0.4 + Math.random() * 0.6); p.vz = (Math.random() - 0.5) * rise;
    p.life = p.span = span; p.size = size; p.grow = grow; p.alpha = alpha;
    p.sprite.visible = true;
  }

  const holeMat = new THREE.MeshBasicMaterial({ map: soft, color: 0x0c0a08, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const holeGeo = new THREE.PlaneGeometry(0.1, 0.1);
  const holes = [];
  for (let i = 0; i < HOLES; i++) {
    const mesh = new THREE.Mesh(holeGeo, holeMat);
    mesh.visible = false;
    scene.add(mesh);
    holes.push(mesh);
  }

  const lights = [];
  for (let i = 0; i < LIGHTS; i++) {
    const light = new THREE.PointLight(0xffb060, 0, 14, 1.8);
    scene.add(light);
    lights.push({ light, life: 0, span: 1, power: 0 });
  }
  function glow(x, y, z, color, power, span, reach) {
    const l = lights[nextLight];
    nextLight = (nextLight + 1) % LIGHTS;
    l.light.color.setHex(color);
    l.light.position.set(x, y, z);
    l.light.distance = reach;
    l.life = l.span = span; l.power = power;
  }

  // Grenades in flight, and the cloud each smoke becomes.
  const cloudMat = new THREE.SpriteMaterial({ map: soft, color: 0xcfc9bd, transparent: true, depthWrite: false, opacity: 0.9 });
  const nades = state.nades.map(() => {
    const mesh = new THREE.Group(); // one model per kind; the kind in flight is shown
    for (const kind of NADE_KINDS) mesh.add(buildNade(kind));
    const cloud = new THREE.Group();
    for (let i = 0; i < CLOUD; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = (i / CLOUD) * 6.28, r = i % 3 === 0 ? 0.4 : 1.9;
      s.position.set(Math.cos(a) * r, 1 + (i % 4) * 0.55, Math.sin(a) * r);
      s.scale.setScalar(3.6 + (i % 3) * 0.8);
      cloud.add(s);
    }
    mesh.visible = cloud.visible = false;
    scene.add(mesh, cloud);
    return { mesh, cloud };
  });

  // The charge: a case with a light that blinks on every beep.
  const charge = new THREE.Group();
  const chargeCase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 }));
  chargeCase.position.y = 0.07;
  chargeCase.castShadow = true;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  led.position.set(0.1, 0.15, 0.06);
  charge.add(chargeCase, led);
  scene.add(charge);
  let blink = 0;

  function burst(x, y, z, scale) {
    puff(x, y, z, 0xffd28a, 3 * scale, 0.22, 14 * scale, 1, 1, 0);
    for (let i = 0; i < 9; i++) puff(x + (Math.random() - 0.5) * scale, y + Math.random() * scale, z + (Math.random() - 0.5) * scale, 0x4a443c, 1.6 * scale, 1.6 + Math.random(), 1.6 * scale, 0.75, 0, 1.6 * scale);
    for (let i = 0; i < 6; i++) puff(x, y, z, 0xffa040, 0.25, 0.45, 0, 1, 1, 9 * scale);
    glow(x, y + 0.5, z, 0xffa850, 220 * scale, 0.35, 30 * scale);
  }

  /** Start the effect for one simulation event. `from` is where a shot visibly leaves its gun. */
  function onEvent(e, from, mine) {
    if (e.type === EV.SHOT) {
      const t = tracers[nextTracer];
      nextTracer = (nextTracer + 1) % TRACERS;
      t.dx = e.x2 - from.x; t.dy = e.y2 - from.y; t.dz = e.z2 - from.z;
      t.dist = Math.hypot(t.dx, t.dy, t.dz) || 1;
      t.dx /= t.dist; t.dy /= t.dist; t.dz /= t.dist;
      t.x = from.x; t.y = from.y; t.z = from.z;
      t.t = 0; t.live = true;
      t.mesh.quaternion.setFromUnitVectors(up, tmp.set(t.dx, t.dy, t.dz));
      if (!mine && e.n === 0) {
        puff(from.x, from.y, from.z, 0xffc070, 0.55, 0.05, 0, 1, 2, 0);
        glow(from.x, from.y, from.z, 0xffb060, 26, 0.06, 12);
      } else if (e.n === 0) glow(from.x, from.y, from.z, 0xffb060, 20, 0.06, 10);
    } else if (e.type === EV.IMPACT) {
      const h = holes[nextHole];
      nextHole = (nextHole + 1) % HOLES;
      h.position.set(e.x + e.x2 * 0.006, e.y + e.y2 * 0.006, e.z + e.z2 * 0.006);
      h.quaternion.setFromUnitVectors(up, tmp.set(e.x2, e.y2, e.z2));
      h.visible = true;
      if (HARD[e.s]) for (let i = 0; i < 3; i++) puff(e.x, e.y, e.z, 0xffd070, 0.09, 0.16, 0, 1, 1, 5);
      puff(e.x + e.x2 * 0.1, e.y + e.y2 * 0.1, e.z + e.z2 * 0.1, DUST[e.s] || 0xb0a898, 0.22, 0.5, 1.5, 0.6, 0, 0.7);
    } else if (e.type === EV.HURT || e.type === EV.KILL) {
      for (let i = 0; i < 3; i++) puff(e.x, e.y, e.z, 0x7a1410, 0.2, 0.35, 0.9, 0.8, 0, 1.4);
    } else if (e.type === EV.BOOM) burst(e.x, e.y + 0.3, e.z, 1);
    else if (e.type === EV.EXPLODE) burst(e.x, e.y + 1, e.z, 3.2);
    else if (e.type === EV.FLASHBANG) {
      puff(e.x, e.y, e.z, 0xffffff, 5, 0.25, 6, 1, 2, 0);
      glow(e.x, e.y, e.z, 0xffffff, 400, 0.2, 40);
    } else if (e.type === EV.BEEP) {
      blink = 0.09;
      glow(e.x, e.y + 0.3, e.z, 0xff3020, 6, 0.1, 6);
    }
  }

  function update(dt) {
    for (const t of tracers) {
      if (!t.live) continue;
      t.t += dt * TRACER_SPEED;
      const len = Math.min(7, t.dist * 0.6, t.dist - t.t + 7);
      t.live = t.t < t.dist && len > 0.05;
      t.mesh.visible = t.live;
      const head = Math.min(t.t, t.dist), tail = Math.max(0, head - len);
      t.mesh.position.set(t.x + t.dx * tail, t.y + t.dy * tail, t.z + t.dz * tail);
      t.mesh.scale.z = Math.max(0.01, head - tail);
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / p.span), s = p.sprite;
      s.position.x += p.vx * dt; s.position.y += p.vy * dt; s.position.z += p.vz * dt;
      p.vy -= (s.material.blending === THREE.AdditiveBlending ? 9 : 0.6) * dt;
      s.scale.setScalar(p.size + p.grow * (1 - k));
      s.material.opacity = p.alpha * k;
      s.visible = p.life > 0;
    }
    for (const l of lights) {
      l.life = Math.max(0, l.life - dt);
      l.light.intensity = l.power * (l.life / l.span);
    }
    for (let i = 0; i < nades.length; i++) {
      const g = state.nades[i], v = nades[i];
      v.mesh.visible = g.live && g.cloud <= 0;
      v.cloud.visible = g.live && g.cloud > 0;
      if (v.mesh.visible) {
        for (let k = 0; k < 3; k++) v.mesh.children[k].visible = NADE_KINDS[k] === g.kind;
        v.mesh.position.set(g.x, g.y, g.z);
        v.mesh.rotation.x += dt * 9; v.mesh.rotation.z += dt * 6;
      } else if (v.cloud.visible) {
        // The cloud swells in over a second and thins out over its last three.
        const age = NADES.smoke.life - g.cloud;
        v.cloud.position.set(g.x, g.y, g.z);
        v.cloud.scale.setScalar(Math.min(1, age * 0.8 + 0.2));
        v.cloud.rotation.y += dt * 0.08;
        cloudMat.opacity = 0.9 * Math.min(1, g.cloud / 3);
      }
    }
    const b = state.bomb;
    charge.visible = b.mode === 'dropped' || b.mode === 'planted';
    charge.position.set(b.x, b.y, b.z);
    blink -= dt;
    led.visible = blink > 0 || b.mode === 'dropped';
  }

  return { onEvent, update };
}
