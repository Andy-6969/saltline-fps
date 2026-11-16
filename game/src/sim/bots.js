// Bot brains. Each tick a bot fills in the same command record the player's keyboard fills, so
// it moves and shoots under the very rules the player does. A brain perceives ten times a second
// (sight cone, line of sight, smoke, flash blindness, noises), picks a mode for its team's plan,
// then steers and aims every tick.
//   attackers: walk an assigned route, throw utility at the choke, plant, then guard the charge
//   defenders: hold an assigned position, rotate when a teammate calls a site, retake and defuse

import { ATK, DEF, NADE_SLOT, WEAPONS } from './config.js';
import { HOLDS, PLANT_SPOTS, ROUTES, SITES, regionAt, siteAt } from './map.js';
import { angleDiff, clamp, yawTo } from './math.js';
import { sightClear } from './collide.js';
import { findPath } from './nav.js';
import { EV, emit, eyeY } from './state.js';
import { smokeBetween } from './grenades.js';
import { bestGunSlot, gunOf } from './weapons.js';
import { tryBuy } from './round.js';

const THINK = 0.1;
const FOV = 1.05; // half-angle of the sight cone, radians
const ATK_ROUTES = [0, 0, 1, 2, 0]; // which route each attacker takes: three main, two flanks
const DEF_POSTS = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]; // [hold group, spot]: two per site, one mid

function makeBrain(id, rng) {
  return {
    skill: 0.6 + rng() * 0.26, // 0.6..0.86, drawn once per match: each bot has a character
    mode: 'hold', route: null, leg: 0, post: null, home: 0,
    gx: 0, gz: 0, path: new Float32Array(96), pathLen: 0, pathAt: 0, repathT: 0, pgx: 1e9, pgz: 1e9,
    target: -1, seenT: 0, reactT: 0, aimHead: false, lastX: 0, lastZ: 0, lastT: -99,
    thinkT: (id % 6) * 0.016, heard: 0, errY: 0, errP: 0, errT: 0,
    burst: 4, pauseT: 0, strafe: 1, crouchFight: false,
    nadeSlot: -1, nadeT: 0, nadeX: 0, nadeZ: 0, nadeUsed: false,
    stuckT: 0, sx: 0, sz: 0,
  };
}

function radio(state, a, text) {
  const plan = state.plan[a.team];
  if (state.time - plan.radioT < 3) return; // one voice at a time on the team channel
  plan.radioT = state.time;
  emit(state, EV.RADIO, a.id).s = text;
}

// Spend money like a team would: rifle and armour when rich, SMG or pistol armour when not,
// utility with what is left, and a defuse kit for defenders.
function shop(state, a) {
  const rng = state.rng;
  if (!a.guns[0]) {
    if (a.money >= 5750 && rng() < 0.18) tryBuy(state, a, 'longshore');
    else if (a.money >= 3350) tryBuy(state, a, a.team === ATK ? 'halyard' : 'bastion');
    else if (a.money >= 1900) tryBuy(state, a, rng() < 0.25 ? 'breaker' : 'vesper');
    else if (a.money >= 1350 && rng() < 0.5) tryBuy(state, a, 'mako');
  }
  if (a.money >= 1000) tryBuy(state, a, 'helm');
  else if (a.money >= 650) tryBuy(state, a, 'vest');
  if (a.team === DEF && a.money >= 700) tryBuy(state, a, 'kit');
  if (a.money >= 500 && rng() < 0.7) tryBuy(state, a, a.team === ATK ? 'smoke' : 'frag');
  if (a.money >= 400 && rng() < 0.6) tryBuy(state, a, 'flash');
}

/** Called once as each round opens: pick the team plans, hand out routes and posts, and shop. */
export function planRound(state) {
  const site = state.rng() < 0.5 ? 0 : 1;
  state.plan[ATK].site = site;
  state.plan[ATK].go = false;
  state.plan[DEF].called = -1;
  const n = [0, 0];
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    const k = n[a.team]++;
    if (!a.isBot) continue;
    const br = (a.brain ||= makeBrain(a.id, state.rng));
    br.target = br.nadeSlot = -1;
    br.lastT = -99;
    br.nadeUsed = false;
    br.staged = false;
    br.leg = 0;
    br.repathT = 0;
    if (a.team === ATK) {
      br.mode = 'route';
      br.route = ROUTES[site][ATK_ROUTES[k]];
    } else {
      br.mode = 'hold';
      br.home = DEF_POSTS[k][0];
      br.post = HOLDS[br.home][DEF_POSTS[k][1] + (state.rng() < 0.5 ? 0 : br.home === 2 ? 1 : 2)];
    }
    shop(state, a);
  }
  radio(state, state.actors.find((a) => a.isBot && a.team === ATK), `Plan: hit ${SITES[site].label} (${SITES[site].name})`);
}

// Sight: the nearest living enemy inside the cone (or very close), with a clear line to chest or
// head and no smoke between. A flashed bot sees nothing.
function perceive(state, a, br) {
  let best = -1, bestD = 70, head = false;
  const ex = a.x, ey = eyeY(a), ez = a.z;
  if (a.flashT < 0.7) {
    for (let i = 0; i < state.actors.length; i++) {
      const v = state.actors[i];
      if (!v.alive || v.team === a.team) continue;
      const d = Math.hypot(v.x - ex, v.z - ez);
      if (d >= bestD || (d > 2.5 && Math.abs(angleDiff(yawTo(ex, ez, v.x, v.z), a.yaw)) > FOV)) continue;
      const chest = sightClear(ex, ey, ez, v.x, v.y + v.h * 0.62, v.z);
      if (!chest && !sightClear(ex, ey, ez, v.x, v.y + v.h - 0.14, v.z)) continue;
      if (smokeBetween(state, ex, ey, ez, v.x, v.y + v.h * 0.7, v.z)) continue;
      best = i; bestD = d; head = !chest;
    }
  }
  if (best >= 0) {
    const v = state.actors[best];
    if (br.target !== best) {
      // Reaction time: slower for the less skilled and for a target at the edge of vision.
      const edge = Math.abs(angleDiff(yawTo(ex, ez, v.x, v.z), a.yaw)) / FOV;
      br.reactT = 0.16 + (1 - br.skill) * 0.34 + edge * 0.14 + state.rng() * 0.1;
      if (br.mode === 'hold') br.reactT *= 0.8; // a held angle is pre-aimed: the defender's edge
      br.seenT = 0;
      br.burst = bestD < 9 ? 9 : bestD < 20 ? 4 : 2;
      br.crouchFight = bestD > 13 && state.rng() < 0.45;
      br.strafe = state.rng() < 0.5 ? -1 : 1;
      const where = v.z < -7 ? siteAt(clamp(v.x, -25, 25), -15) : -1;
      if (a.team === DEF && where >= 0) {
        state.plan[DEF].called = where;
        state.plan[DEF].calledT = state.time;
      }
      radio(state, a, `Contact, ${regionAt(v.x, v.z)}`);
    }
    br.aimHead = head || br.skill > 0.8 || (br.mode === 'hold' && br.skill > 0.68); // a held angle sits at head height
    br.lastX = v.x; br.lastZ = v.z; br.lastT = state.time;
  }
  br.target = best;
  // Hearing: enemy gunfire, running steps and plant/defuse sounds inside their radius.
  if (best < 0) {
    for (let i = 0; i < state.noises.length; i++) {
      const n = state.noises[i];
      if (n.tick <= br.heard || n.team === a.team || Math.hypot(n.x - a.x, n.z - a.z) > n.r) continue;
      br.lastX = n.x; br.lastZ = n.z; br.lastT = state.time;
    }
  }
  br.heard = state.tick;
}

// Choose what to be doing and where to be going.
function decide(state, a, br) {
  const b = state.bomb, r = state.round, plan = state.plan[a.team];
  if (a.team === ATK) {
    const site = b.site >= 0 ? b.site : plan.site;
    if (r.phase === 'planted') {
      // Guard the charge from a site position; rush it when someone starts defusing.
      br.mode = 'guard';
      const spot = HOLDS[site][a.id % 4];
      if (b.defuser >= 0) setGoal(br, b.x, b.z); else setGoal(br, spot.x, spot.z);
    } else if (b.mode === 'dropped' && nearestBot(state, a, b.x, b.z)) {
      br.mode = 'fetch';
      setGoal(br, b.x, b.z);
    } else {
      const pts = br.route.pts;
      if (r.t < 38) br.leg = Math.max(br.leg, pts.length - 1); // out of time: go straight in
      // The execute: each attacker waits at the last corner before the site until three are
      // staged (or the clock says go), then all of them enter together behind their utility.
      const staging = br.leg === pts.length - 1 && !plan.go;
      if (staging && Math.hypot(pts[br.leg - 1][0] - a.x, pts[br.leg - 1][1] - a.z) < 2) br.staged = true;
      if (staging && (countStaged(state) >= 3 || r.t < 65)) { plan.go = true; radio(state, a, `Go go, execute ${SITES[site].name}`); }
      if (staging) setGoal(br, pts[br.leg - 1][0], pts[br.leg - 1][1]);
      else if (br.leg < pts.length && Math.hypot(pts[br.leg][0] - a.x, pts[br.leg][1] - a.z) < 1.4) {
        if (br.leg === br.route.nade && !br.nadeUsed && br.target < 0) startNade(a, br, (SITES[site].x0 + SITES[site].x1) / 2, (SITES[site].z0 + SITES[site].z1) / 2);
        br.leg++;
      }
      if (br.leg < pts.length) {
        br.mode = 'route';
        if (!staging) setGoal(br, pts[br.leg][0], pts[br.leg][1]);
      } else if (b.carrier === a.id) {
        br.mode = 'plant';
        const p = PLANT_SPOTS[site][a.id % 3];
        setGoal(br, p[0], p[1]);
      } else {
        br.mode = 'guard';
        const spot = HOLDS[site][a.id % 4];
        setGoal(br, spot.x, spot.z);
      }
    }
    return;
  }
  if (r.phase === 'planted') {
    br.mode = 'retake';
    setGoal(br, b.x, b.z);
    return;
  }
  // A teammate called a site: everyone elsewhere rotates to it, bar one who stays to watch the flank.
  if (plan.called >= 0 && plan.called !== br.home && state.time - plan.calledT > 1 && a.id % 3 !== 0) {
    br.home = plan.called;
    br.post = HOLDS[br.home][2 + (a.id % 2)];
    radio(state, a, `Rotating ${SITES[br.home].name}`);
  }
  br.mode = 'hold';
  setGoal(br, br.post.x, br.post.z);
  // Lost sight of someone near: toss the frag where they were last seen.
  const gap = state.time - br.lastT;
  const d = Math.hypot(br.lastX - a.x, br.lastZ - a.z);
  if (br.target < 0 && gap > 0.6 && gap < 2 && d > 8 && d < 22 && a.nades[0] > 0 && !br.nadeUsed) startNade(a, br, br.lastX, br.lastZ);
}

function setGoal(br, x, z) { br.gx = x; br.gz = z; }

function countStaged(state) {
  let n = 0;
  for (let i = 0; i < state.actors.length; i++) {
    const o = state.actors[i];
    if (o.alive && o.team === ATK && o.brain && o.brain.staged) n++;
  }
  return n;
}

function nearestBot(state, a, x, z) {
  const mine = Math.hypot(a.x - x, a.z - z);
  for (let i = 0; i < state.actors.length; i++) {
    const o = state.actors[i];
    if (o !== a && o.alive && o.isBot && o.team === a.team && Math.hypot(o.x - x, o.z - z) < mine) return false;
  }
  return true;
}

// Begin a throw: smoke first, then flash, then frag, whichever the bot carries.
function startNade(a, br, x, z) {
  const slot = a.nades[2] > 0 ? NADE_SLOT.smoke : a.nades[1] > 0 ? NADE_SLOT.flash : a.nades[0] > 0 ? NADE_SLOT.frag : -1;
  br.nadeUsed = true;
  if (slot < 0) return;
  br.nadeSlot = slot; br.nadeT = 0; br.nadeX = x; br.nadeZ = z;
}

function turn(a, yaw, pitch, rate, dt) {
  const c = a.cmd;
  c.yaw += clamp(angleDiff(yaw, c.yaw) * Math.min(1, 14 * dt), -rate * dt, rate * dt);
  c.pitch += clamp((pitch - c.pitch) * Math.min(1, 14 * dt), -rate * dt, rate * dt);
}

// Head for the goal along a path, re-planned when the goal moves or every couple of seconds.
function walk(state, a, br, dt) {
  const c = a.cmd;
  br.repathT -= dt;
  if (br.repathT <= 0 || Math.hypot(br.gx - br.pgx, br.gz - br.pgz) > 1) {
    br.pathLen = findPath(a.x, a.z, br.gx, br.gz, br.path);
    br.pathAt = 0;
    br.repathT = 2 + state.rng();
    br.pgx = br.gx; br.pgz = br.gz;
  }
  while (br.pathAt < br.pathLen && Math.hypot(br.path[br.pathAt * 2] - a.x, br.path[br.pathAt * 2 + 1] - a.z) < 0.5) br.pathAt++;
  const left = Math.hypot(br.gx - a.x, br.gz - a.z);
  if (br.pathAt >= br.pathLen || left < 0.35) return 0;
  const wx = br.path[br.pathAt * 2] - a.x, wz = br.path[br.pathAt * 2 + 1] - a.z;
  const len = Math.hypot(wx, wz) || 1;
  const sin = Math.sin(c.yaw), cos = Math.cos(c.yaw);
  c.mx = (cos * wx - sin * wz) / len;
  c.mz = (-sin * wx - cos * wz) / len;
  // Wedged against something for a second: hop and re-plan.
  br.stuckT += dt;
  if (br.stuckT > 1) {
    if (Math.hypot(a.x - br.sx, a.z - br.sz) < 0.35) { c.jump = true; br.repathT = 0; }
    br.stuckT = 0; br.sx = a.x; br.sz = a.z;
  }
  return yawTo(a.x, a.z, br.path[br.pathAt * 2], br.path[br.pathAt * 2 + 1]);
}

// Aim at the target with a wandering error that shrinks the longer it is in view, fire in bursts
// sized to the range, and stop moving to shoot unless the gun is one that forgives it.
function fight(state, a, br, dt) {
  const c = a.cmd, v = state.actors[br.target], gun = gunOf(a);
  const d = Math.hypot(v.x - a.x, v.z - a.z);
  br.seenT += dt;
  br.errT -= dt;
  if (br.errT <= 0) {
    const wobble = (1.15 - br.skill) * (br.mode === 'hold' ? 0.025 : 0.05) / (1 + br.seenT * 1.5);
    br.errY = (state.rng() - 0.5) * wobble;
    br.errP = (state.rng() - 0.5) * wobble;
    br.errT = 0.22;
  }
  const ty = v.y + (br.aimHead ? v.h - 0.15 : v.h * 0.68);
  const yaw = yawTo(a.x, a.z, v.x, v.z) + br.errY - a.punchY * br.skill;
  const pitch = Math.atan2(ty - eyeY(a), d) + br.errP - a.punchP * br.skill * 0.8;
  turn(a, yaw, pitch, 5 + 8 * br.skill, dt);
  if (!gun) { c.slot = bestGunSlot(a); return; }
  const tol = Math.atan2(0.3, d) + 0.012;
  const onAim = Math.abs(angleDiff(yaw, c.yaw)) < tol && Math.abs(pitch - c.pitch) < tol;
  const steady = gun.moveSpread > 0.04; // rifles, the sniper and the heavy pistol want a still body
  c.zoom = gun.zoom > 0 && d > 9;
  c.crouch = br.crouchFight && steady;
  if (br.pauseT > 0) {
    // Between bursts: sidestep, so the next burst comes from somewhere new.
    br.pauseT -= dt;
    c.mx = br.strafe;
    if (br.pauseT <= 0) br.strafe = -br.strafe;
  } else {
    if ((gun.kind === 'smg' || gun.kind === 'shotgun') && d > 10 && br.mode !== 'hold') c.mz = 1; // close-range guns close the distance
    if (onAim && br.seenT > br.reactT && (!steady || Math.hypot(a.vx, a.vz) < 1.2)) {
      c.fire = gun.auto || !a.triggerHeld;
      if (a.shots >= br.burst) br.pauseT = 0.22 + state.rng() * 0.3;
    }
  }
  if (a.mag[a.slot] === 0 && a.slot === 0 && a.mag[1] > 0 && d < 16) c.slot = 1; // empty: draw the sidearm
}

// The grenade routine: draw, face the mark with an arc, hold, release.
function lobNade(a, br, dt) {
  const c = a.cmd;
  br.nadeT += dt;
  c.slot = br.nadeSlot;
  const d = Math.hypot(br.nadeX - a.x, br.nadeZ - a.z);
  turn(a, yawTo(a.x, a.z, br.nadeX, br.nadeZ), clamp(d / 55, 0.12, 0.5), 9, dt);
  c.fire = br.nadeT > 0.6 && br.nadeT < 0.8;
  if (br.nadeT > 1 || a.nades[br.nadeSlot - 2] <= 0) { br.nadeSlot = -1; c.slot = bestGunSlot(a); }
}

function act(state, a, br, dt) {
  const c = a.cmd, b = state.bomb;
  c.mx = c.mz = 0;
  c.jump = c.fire = c.reload = c.use = c.zoom = c.crouch = c.walk = false;
  c.slot = -1;
  if (state.round.phase === 'freeze') return;
  if (br.target >= 0 && state.actors[br.target].alive) {
    br.nadeSlot = -1;
    fight(state, a, br, dt);
    return;
  }
  br.target = -1;
  if (br.nadeSlot >= 0) { lobNade(a, br, dt); return; }
  if (a.slot !== bestGunSlot(a) && a.mag[bestGunSlot(a)] + a.res[bestGunSlot(a)] > 0) c.slot = bestGunSlot(a);
  const gun = gunOf(a);
  c.reload = !!gun && a.mag[a.slot] < gun.mag * 0.45;

  const atBomb = Math.hypot(b.x - a.x, b.z - a.z);
  const planting = br.mode === 'plant' && siteAt(a.x, a.z) >= 0 && Math.hypot(br.gx - a.x, br.gz - a.z) < 0.8;
  const defusing = br.mode === 'retake' && atBomb < 1.3 && (b.defuser < 0 || b.defuser === a.id);
  if (planting || defusing) { c.use = true; c.crouch = true; return; }

  // A retaker who is not the one defusing stops short and covers the defuser.
  const cover = br.mode === 'retake' && b.defuser >= 0 && atBomb < 5;
  const heading = cover ? 0 : walk(state, a, br, dt);
  const moving = c.mx !== 0 || c.mz !== 0;
  const recent = state.time - br.lastT < 3.5;
  // The stick is local to the view, so a bot can walk its path while facing somewhere else.
  let yaw = heading;
  if (recent) yaw = yawTo(a.x, a.z, br.lastX, br.lastZ); // face where the enemy was seen or heard
  else if (!moving && br.mode === 'hold') yaw = yawTo(a.x, a.z, br.post.lx, br.post.lz) + Math.sin(state.time * 0.7 + a.id) * 0.25;
  else if (!moving) yaw = yawTo(a.x, a.z, b.x, b.z) + Math.sin(state.time * 0.5 + a.id) * 0.8;
  c.crouch = !moving && br.mode === 'hold' && br.post.crouch;
  c.walk = br.mode === 'guard' && moving; // creep into post-plant positions quietly
  turn(a, yaw, 0, 6, dt);
}

export function stepBots(state, dt) {
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i], br = a.brain;
    if (!br || !a.alive) continue;
    br.thinkT -= dt;
    if (br.thinkT <= 0) {
      br.thinkT += THINK;
      perceive(state, a, br);
      if (state.round.phase !== 'freeze') decide(state, a, br);
    }
    act(state, a, br, dt);
  }
}
