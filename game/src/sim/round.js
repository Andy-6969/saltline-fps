// The match: buy time, the live round, the planted charge, the result, money, and the side swap.
// A round is won by wiping the other team, by the charge going off, by defusing it, or (for the
// defence) by the clock running out.

import { ATK, DEF, ECON, GEAR, NADES, NADE_SLOT, RULES, WEAPONS } from './config.js';
import { SITES, SPAWNS, siteAt } from './map.js';
import { EV, emit, noise, other, teamAlive } from './state.js';
import { bestGunSlot, blast, giveGun } from './weapons.js';

const squadOf = (state, team) => (team === ATK ? state.round.atkSquad : 1 - state.round.atkSquad);
const pay = (a, amount) => { a.money = Math.min(ECON.max, a.money + amount); };

function resetLoadout(a) {
  a.guns[0] = null;
  giveGun(a, 'wren');
  a.nades.fill(0);
  a.armor = 0;
  a.helmet = a.kit = false;
}

export function startRound(state) {
  const r = state.round;
  r.num++;
  r.phase = 'freeze';
  r.t = RULES.freezeT;
  r.winner = -1;
  r.fresh = true; // sim.js sees this and has the bots plan and buy
  const swap = r.num === RULES.halfRounds + 1;
  if (swap) {
    r.atkSquad = 1 - r.atkSquad;
    r.lossRun.fill(0);
  }
  const placed = [0, 0];
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    if (swap) { a.team = other(a.team); a.money = ECON.start; }
    if (!a.alive || swap || r.num === 1) resetLoadout(a);
    for (let s = 0; s < 2; s++) if (a.guns[s]) giveGun(a, a.guns[s]); // survivors keep guns, topped up
    const sp = SPAWNS[a.team];
    a.alive = true;
    a.hp = 100;
    a.x = a.px = sp.xs[placed[a.team]++]; a.z = a.pz = sp.z; a.y = a.py = 0;
    a.vx = a.vy = a.vz = 0;
    a.yaw = a.cmd.yaw = sp.yaw; a.pitch = a.cmd.pitch = 0;
    a.slot = bestGunSlot(a);
    a.crouch = a.cooldown = a.reloadT = a.drawT = a.shots = a.punchP = a.punchY = a.flashT = a.useT = a.hurtT = 0;
    a.zoomed = a.triggerHeld = false;
    a.roundKills = 0;
    a.taken.fill(0);
    if (a.team === ATK) a.kit = false;
  }
  for (let i = 0; i < state.nades.length; i++) state.nades[i].live = false;
  // A random attacker starts with the charge.
  const b = state.bomb;
  let pick = Math.floor(state.rng() * RULES.teamSize);
  for (let i = 0; i < state.actors.length; i++) {
    if (state.actors[i].team === ATK && pick-- === 0) b.carrier = i;
  }
  b.mode = 'carried';
  b.site = b.defuser = -1;
  emit(state, EV.PHASE).s = 'freeze';
}

export function startMatch(state) {
  const r = state.round;
  r.num = 0;
  r.score.fill(0);
  r.lossRun.fill(0);
  r.matchOver = false;
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    a.alive = false;
    a.money = ECON.start;
    a.kills = a.deaths = a.assists = a.heads = a.dmg = a.mvps = 0;
  }
  startRound(state);
}

function endRound(state, winner, reason) {
  const r = state.round;
  const won = squadOf(state, winner), lost = 1 - won;
  r.phase = 'over';
  r.t = RULES.overT;
  r.winner = winner;
  r.reason = reason;
  r.score[won]++;
  const lossPay = Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * r.lossRun[lost]);
  r.lossRun[lost]++;
  r.lossRun[won] = 0;
  // The round's MVP: the winner who planted or defused, else the winner with the most kills.
  let mvp = null;
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    pay(a, a.team === winner ? ECON.win : lossPay);
    a.useT = 0;
    if (a.team === winner && (!mvp || a.roundKills > mvp.roundKills)) mvp = a;
  }
  const b = state.bomb;
  if (reason === 'Charge defused') mvp = state.actors[b.defuser];
  else if (reason === 'The charge went off') mvp = state.actors[b.planter];
  mvp.mvps++;
  r.mvp = mvp.id;
  r.matchOver = r.score[won] >= RULES.winRounds;
  emit(state, EV.PHASE).s = 'over';
}

/** The carrier fell: the charge lies where they stood until a teammate walks over it. */
export function dropBomb(state, a) {
  const b = state.bomb;
  b.mode = 'dropped';
  b.carrier = -1;
  b.x = a.x; b.y = a.y; b.z = a.z;
}

/** Holding the use key: an attacker with the charge plants it on a site, a defender defuses it. */
export function stepUse(state, a, dt) {
  const b = state.bomb, r = state.round;
  const planting = a.team === ATK && b.carrier === a.id && r.phase === 'live' && a.onGround && siteAt(a.x, a.z) >= 0;
  const defusing = a.team === DEF && r.phase === 'planted' && Math.hypot(a.x - b.x, a.z - b.z) < 1.6 && (b.defuser < 0 || b.defuser === a.id);
  if (!a.alive || !a.cmd.use || !(planting || defusing)) {
    a.useT = 0;
    if (b.defuser === a.id) b.defuser = -1;
    return;
  }
  if (a.useT === 0) {
    emit(state, planting ? EV.PLANTING : EV.DEFUSING, a.id, a.x, a.y, a.z);
    noise(state, a.x, a.z, 16, a.team);
  }
  a.useT += dt;
  if (planting && a.useT >= RULES.plantT) {
    b.mode = 'planted';
    b.carrier = -1;
    b.x = a.x; b.y = a.y; b.z = a.z;
    b.site = siteAt(a.x, a.z);
    b.timer = RULES.bombT;
    b.beepT = 0;
    b.planter = a.id;
    r.phase = 'planted';
    a.useT = 0;
    for (let i = 0; i < state.actors.length; i++) if (state.actors[i].team === ATK) pay(state.actors[i], ECON.plant);
    emit(state, EV.PLANTED, a.id, b.x, b.y, b.z).s = SITES[b.site].name;
    noise(state, b.x, b.z, 60, ATK);
  } else if (defusing) {
    b.defuser = a.id;
    if (a.useT >= (a.kit ? RULES.defuseKitT : RULES.defuseT)) {
      b.mode = 'defused';
      pay(a, ECON.defuse);
      emit(state, EV.DEFUSED, a.id, b.x, b.y, b.z);
      endRound(state, DEF, 'Charge defused');
    }
  }
}

export function stepRound(state, dt) {
  const r = state.round, b = state.bomb;
  if (r.phase === 'menu' || r.phase === 'match') return;
  if (b.mode === 'carried') {
    const c = state.actors[b.carrier];
    b.x = c.x; b.y = c.y; b.z = c.z;
  } else if (b.mode === 'dropped') {
    for (let i = 0; i < state.actors.length; i++) {
      const a = state.actors[i];
      if (a.alive && a.team === ATK && Math.hypot(a.x - b.x, a.z - b.z) < 1 && r.phase === 'live') {
        b.mode = 'carried';
        b.carrier = i;
        emit(state, EV.PICKUP, i, b.x, b.y, b.z);
        break;
      }
    }
  }
  r.t -= dt;
  if (r.phase === 'freeze') {
    if (r.t <= 0) { r.phase = 'live'; r.t = RULES.roundT; emit(state, EV.PHASE).s = 'live'; }
  } else if (r.phase === 'live') {
    if (teamAlive(state, DEF) === 0) endRound(state, ATK, 'Harbor Watch eliminated');
    else if (teamAlive(state, ATK) === 0) endRound(state, DEF, 'Tide Runners eliminated');
    else if (r.t <= 0) endRound(state, DEF, 'Time ran out');
  } else if (r.phase === 'planted') {
    b.timer -= dt;
    b.beepT -= dt;
    if (b.beepT <= 0) {
      // The beep quickens as the fuse runs down: the defender's clock, audible across the site.
      b.beepT = Math.max(0.12, b.timer / RULES.bombT);
      emit(state, EV.BEEP, -1, b.x, b.y, b.z);
    }
    if (b.timer <= 0) {
      b.mode = 'exploded';
      emit(state, EV.EXPLODE, -1, b.x, b.y, b.z);
      blast(state, b.x, b.y + 0.5, b.z, RULES.blastRadius, RULES.blastDamage, state.actors[b.planter], 'charge');
      endRound(state, ATK, 'The charge went off');
    } else if (teamAlive(state, DEF) === 0) {
      endRound(state, ATK, 'Harbor Watch eliminated');
    }
  } else if (r.t <= 0) {
    if (r.matchOver) { r.phase = 'match'; emit(state, EV.PHASE).s = 'match'; } else startRound(state);
  }
}

/** Can this actor buy now? Buy time, and the first seconds of a live round. */
export const canBuy = (state, a) => a.alive && (state.round.phase === 'freeze' || (state.round.phase === 'live' && RULES.roundT - state.round.t < RULES.buyT));

/** Buy one item from the menu. Returns true when the money was spent. */
export function tryBuy(state, a, item) {
  const gun = WEAPONS[item], nade = NADES[item], gear = GEAR[item];
  let price = (gun || nade || gear).price;
  let ok = canBuy(state, a);
  if (gun) ok = ok && a.guns[gun.slot] !== item;
  else if (nade) ok = ok && a.nades[NADE_SLOT[item] - 2] < nade.max;
  else if (item === 'kit') ok = ok && a.team === DEF && !a.kit;
  else {
    const helm = item === 'helm';
    if (helm && a.armor >= 100 && !a.helmet) price = GEAR.helm.price - GEAR.vest.price;
    ok = ok && (a.armor < 100 || (helm && !a.helmet));
  }
  if (!ok || a.money < price) {
    emit(state, EV.DENIED, a.id);
    return false;
  }
  a.money -= price;
  if (gun) { giveGun(a, item); a.slot = bestGunSlot(a); a.drawT = 0.45; }
  else if (nade) a.nades[NADE_SLOT[item] - 2]++;
  else if (item === 'kit') a.kit = true;
  else { a.armor = 100; a.helmet = a.helmet || item === 'helm'; }
  emit(state, EV.BOUGHT, a.id).s = (gun || nade || gear).name;
  return true;
}
