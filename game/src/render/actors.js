// The soldiers as seen in the world: a jointed figure per actor, posed each frame from the
// simulation (position, facing, aim pitch, stride, crouch, weapon in hand, death).
// Tide Runners wear rust-orange oilskins; the Harbor Watch wear navy with pale helmets.

import * as THREE from 'three';
import { ATK, MOVE } from '../sim/config.js'; 
import { lerp } from '../sim/math.js';
import { buildGun } from './guns.js';

const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const KIT = [
  { coat: std(0xb5562a), legs: std(0x33302c), vest: std(0x4a3a2a), helm: std(0x5c4a36, 0.6) },
  { coat: std(0x2c4a6e), legs: std(0x1f2a36), vest: std(0x18222c), helm: std(0xcfd3d2, 0.45, 0.2) },
];
const SKIN = std(0xc49a78, 0.7), BOOT = std(0x1a1a1c, 0.6), CHARGE = std(0x2b2f33, 0.5, 0.6);
const LED = new THREE.MeshBasicMaterial({ color: 0xff3b2f });

function part(geo, mat, parent, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// A limb of two segments hanging from a joint: returns the upper and lower pivots.
function limb(parent, x, y, r, len, mat, endMat) {
  const upper = joint(parent, x, y, 0);
  part(new THREE.CapsuleGeometry(r, len, 3, 8), mat, upper, 0, -len / 2, 0);
  const lower = joint(upper, 0, -len, 0);
  part(new THREE.CapsuleGeometry(r * 0.88, len, 3, 8), mat, lower, 0, -len / 2, 0);
  part(new THREE.BoxGeometry(r * 2.1, r * 1.5, r * 3), endMat, lower, 0, -len - r * 0.4, -r * 0.6);
  return { upper, lower };
}

function buildFigure(scene) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = joint(root, 0, 0.92, 0);
  const kit = KIT[0];
  const coat = [], legs = [], vest = [], helm = [];
  const legL = limb(hips, -0.1, 0, 0.085, 0.4, kit.legs, BOOT), legR = limb(hips, 0.1, 0, 0.085, 0.4, kit.legs, BOOT);
  const spine = joint(hips, 0, 0.02, 0);
  coat.push(part(new THREE.BoxGeometry(0.4, 0.56, 0.23), kit.coat, spine, 0, 0.3, 0));
  coat.push(part(new THREE.CapsuleGeometry(0.085, 0.36, 3, 8).rotateZ(Math.PI / 2), kit.coat, spine, 0, 0.56, 0)); // shoulders
  vest.push(part(new THREE.BoxGeometry(0.43, 0.34, 0.28), kit.vest, spine, 0, 0.33, -0.005));
  vest.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.08), kit.vest, spine, 0, 0.26, -0.16)); // magazine pouches
  part(new THREE.SphereGeometry(0.108, 14, 10), SKIN, spine, 0, 0.74, 0);
  part(new THREE.BoxGeometry(0.19, 0.05, 0.08), BOOT, spine, 0, 0.76, -0.075); // goggles
  helm.push(part(new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), kit.helm, spine, 0, 0.755, 0.01));
  const armL = limb(spine, -0.24, 0.55, 0.06, 0.27, kit.coat, BOOT), armR = limb(spine, 0.24, 0.55, 0.06, 0.27, kit.coat, BOOT);
  for (const l of [legL, legR]) legs.push(l.upper.children[0], l.lower.children[0]);
  for (const a of [armL, armR]) coat.push(a.upper.children[0], a.lower.children[0]);
  // Arms reach forward to the weapon, which hangs from the chest and follows the aim.
  armR.upper.rotation.set(0.75, 0, -0.2); armR.lower.rotation.x = 1.1;
  armL.upper.rotation.set(1.15, 0, 0.6); armL.lower.rotation.x = 0.5;
  const hands = joint(spine, 0.1, 0.42, -0.34);
  const pack = part(new THREE.BoxGeometry(0.3, 0.36, 0.14), CHARGE, spine, 0, 0.36, 0.2);
  part(new THREE.SphereGeometry(0.025, 6, 6), LED, pack, 0.08, 0.1, 0.08);
  scene.add(root);
  return { root, hips, spine, legL, legR, hands, pack, coat, legs, vest, helm, team: -1, gunId: '', gun: null, phase: 0, fall: 0 };
}

export function createActors(scene, state) {
  const figures = state.actors.map(() => buildFigure(scene));

  /** Pose every figure for this frame. `alpha` blends the last two simulation steps. */
  function update(dt, alpha, hideId) {
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i], a = state.actors[i];
      // Before the first round nobody stands anywhere; and the body you look out of is not drawn.
      f.root.visible = state.round.num > 0 && i !== hideId;
      if (!f.root.visible) continue;
      if (f.team !== a.team) {
        f.team = a.team;
        const kit = KIT[a.team === ATK ? 0 : 1];
        for (const m of f.coat) m.material = kit.coat;
        for (const m of f.legs) m.material = kit.legs;
        for (const m of f.vest) m.material = kit.vest;
        for (const m of f.helm) m.material = kit.helm;
      }
      const gunId = a.slot < 2 ? a.guns[a.slot] : '';
      if (f.gunId !== gunId) {
        if (f.gun) f.hands.remove(f.gun);
        f.gun = gunId ? buildGun(gunId) : null;
        if (f.gun) f.hands.add(f.gun);
        f.gunId = gunId;
      }
      f.pack.visible = state.bomb.carrier === i;

      const x = lerp(a.px, a.x, alpha), y = lerp(a.py, a.y, alpha), z = lerp(a.pz, a.z, alpha);
      f.root.position.set(x, y, z);
      f.root.rotation.y = a.yaw;
      // Dying: the figure topples backwards and stays down until the next round.
      f.fall = a.alive ? 0 : Math.min(1, f.fall + dt * 2.6);
      const down = f.fall * f.fall;
      f.root.rotation.x = down * 1.5;
      f.root.position.y = y + down * 0.16;

      // Stride: legs swing with distance covered; a crouch folds them and lowers the hips.
      const speed = Math.hypot(a.vx, a.vz), share = Math.min(1, speed / MOVE.run) * (a.alive ? 1 : 0);
      f.phase += speed * dt * 2.1;
      const swing = Math.sin(f.phase) * 0.75 * share, k = a.crouch;
      f.hips.position.y = 0.92 - k * 0.42 + Math.abs(Math.cos(f.phase)) * 0.03 * share;
      f.legL.upper.rotation.x = swing + k * 1.25;
      f.legR.upper.rotation.x = -swing + k * 0.7;
      f.legL.lower.rotation.x = -Math.max(0, -swing) * 1.1 - k * 1.9;
      f.legR.lower.rotation.x = -Math.max(0, swing) * 1.1 - k * 1.75;
      f.spine.rotation.x = a.pitch * 0.55 + k * 0.12;
      f.hands.rotation.x = a.pitch * 0.35;
    }
  }

  /** World position of an actor's muzzle, for tracers and flashes from other soldiers. */
  function muzzleOf(id, out) {
    const f = figures[id];
    return f.hands.localToWorld(out.set(0, 0.04, -0.6));
  }

  return { update, muzzleOf };
}
