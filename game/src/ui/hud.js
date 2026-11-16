// The HUD: vitals, ammo, clock, score, radar, kill feed, radio, buy menu and scoreboard. It reads
// the state each frame and writes the DOM only when a value changed.

import { ATK, BUY_ORDER, DEF, GEAR, NADES, NADE_KINDS, NADE_SLOT, RULES, TEAM_NAMES, WEAPONS } from '../sim/config.js';
import { BOUNDS, BOXES, SITES, regionAt, siteAt } from '../sim/map.js';
import { EV, teamAlive } from '../sim/state.js';
import { canBuy } from '../sim/round.js';

const $ = (id) => document.getElementById(id);
const SCALE = 3; // radar pixels per metre
const BUY_LABELS = '1234567890-=';
const BUY_COLUMNS = [['Sidearms & SMG', ['mako', 'vesper']], ['Shotgun & rifles', ['breaker', 'halyard', 'bastion', 'longshore']], ['Gear', ['vest', 'helm', 'kit']], ['Grenades', ['frag', 'flash', 'smoke']]];
const statLine = (g) => `${g.dmg}${g.pellets > 1 ? '×' + g.pellets : ''} dmg · ${Math.round(g.rate * 60)} rpm · ${g.mag}/${g.reserve}`;
const BLURB = { vest: 'Armour 100: body hits soak', helm: 'Armour + helmet: no one-tap', kit: 'Defuse in 4 s, not 8',
  frag: 'Blast up to 7.5 m', flash: 'Blinds whoever faces it', smoke: '15 s wall that blocks sight' };
for (const id of Object.keys(WEAPONS)) BLURB[id] = statLine(WEAPONS[id]);

export function createHud(state, input) {
  const el = {};
  for (const node of $('hud').querySelectorAll('[id]')) el[node.id] = node; // every HUD element, by its id
  const cache = new Map();
  // Write text only when it differs from what the element already shows.
  const set = (node, text) => { if (cache.get(node) !== text) { cache.set(node, text); node.textContent = text; } };
  const show = (node, on, mode = 'block') => { const v = on ? mode : 'none'; if (cache.get(node.style) !== v) { cache.set(node.style, v); node.style.display = v; } };
  const hairs = el.cross.children, bannerB = el.banner.firstElementChild, bannerS = el.banner.lastElementChild;
  const promptText = el.prompt.firstElementChild, barFill = el.bar.firstElementChild;
  let bannerT = 0, hitT = 0, slowT = 0;

  // The radar's map layer is drawn once; blips go over a copy of it.
  const radar = $('radar').getContext('2d');
  const base = document.createElement('canvas');
  base.width = 180; base.height = 144;
  const bg = base.getContext('2d');
  const rx = (x) => (x - BOUNDS.x0) * SCALE, rz = (z) => (z - BOUNDS.z0) * SCALE;
  for (const s of SITES) {
    bg.fillStyle = s.name === 'A' ? 'rgba(232,161,58,.28)' : 'rgba(79,179,168,.28)';
    bg.fillRect(rx(s.x0), rz(s.z0), (s.x1 - s.x0) * SCALE, (s.z1 - s.z0) * SCALE);
    bg.fillStyle = '#f1ead9';
    bg.font = 'bold 13px monospace';
    bg.fillText(s.name, rx((s.x0 + s.x1) / 2) - 4, rz((s.z0 + s.z1) / 2) + 5);
  }
  for (const b of BOXES) {
    if (b.y0 > 2) continue;
    bg.fillStyle = b.y1 > 2.5 ? 'rgba(241,234,217,.5)' : 'rgba(241,234,217,.22)';
    bg.fillRect(rx(b.x0), rz(b.z0), (b.x1 - b.x0) * SCALE, (b.z1 - b.z0) * SCALE);
  }

  function drawRadar(me) {
    radar.clearRect(0, 0, 180, 144);
    radar.drawImage(base, 0, 0);
    for (const a of state.actors) {
      // Teammates always; enemies only while their gunfire gives them away.
      if (!a.alive || (a.team !== me.team && a.sinceShot > 1.5)) continue;
      radar.fillStyle = a.team !== me.team ? '#e2533f' : a === me ? '#ffffff' : a.team === ATK ? '#e8a13a' : '#4fb3a8';
      radar.beginPath();
      radar.arc(rx(a.x), rz(a.z), a === me ? 3.2 : 2.6, 0, 6.3);
      radar.fill();
      if (a === me) {
        radar.strokeStyle = '#ffffff';
        radar.beginPath();
        radar.moveTo(rx(a.x), rz(a.z));
        radar.lineTo(rx(a.x) - Math.sin(a.yaw) * 9, rz(a.z) - Math.cos(a.yaw) * 9);
        radar.stroke();
      }
    }
    const b = state.bomb;
    if (b.mode === 'planted' || (me.team === ATK && b.mode !== 'none')) {
      radar.fillStyle = state.time % 0.6 < 0.3 ? '#ff3020' : '#ffd0a0';
      radar.fillRect(rx(b.x) - 2.5, rz(b.z) - 2.5, 5, 5);
    }
  }

  // The quartermaster: a card per item in four columns, each with its key, price, what it does
  // and whether you own it or can afford it.
  function buyCards(me) {
    let html = '';
    for (const [title, ids] of BUY_COLUMNS) {
      html += `<div><small>${title}</small>`;
      for (const id of ids) {
        const gun = WEAPONS[id], item = gun || NADES[id] || GEAR[id], key = BUY_LABELS[BUY_ORDER.indexOf(id)];
        const owned = gun ? me.guns[gun.slot] === id : NADE_SLOT[id] ? me.nades[NADE_SLOT[id] - 2] >= item.max
          : id === 'kit' ? me.kit : me.armor >= 100 && (id === 'vest' || me.helmet);
        const state = owned ? 'Owned' : id === 'kit' && me.team !== DEF ? 'Defence only' : item.price > me.money ? 'Too expensive' : '';
        html += `<div class="item${owned ? ' own' : state ? ' no' : ''}"><b>${key}</b> ${item.name}<i>$${item.price}</i><em>${state || BLURB[id]}</em></div>`;
      }
      html += '</div>';
    }
    return html;
  }

  // The scoreboard: kills, assists, deaths, headshot share, damage dealt and MVP stars; money
  // shows for your own side only, as it would over a team channel.
  function scoreRows() {
    const me = state.actors[state.playerId];
    let html = '';
    for (const team of [me.team, 1 - me.team]) {
      const r = state.round, won = r.score[team === me.team ? me.squad : 1 - me.squad];
      html += `<h2 class="${team === ATK ? 'atk' : 'def'}">${TEAM_NAMES[team]} ${won} <span class="dim">${team === ATK ? 'attack' : 'defence'}</span></h2>`;
      html += '<div class="row dim"><span>Name</span><span>K</span><span>A</span><span>D</span><span>HS</span><span>DMG</span><span>MVP</span><span>Money</span></div>';
      const side = state.actors.filter((a) => a.team === team).sort((x, y) => y.kills - x.kills || y.dmg - x.dmg);
      for (const a of side) {
        const hs = a.kills ? Math.round((a.heads / a.kills) * 100) + '%' : '-';
        html += `<div class="row${a.alive ? '' : ' no'}${a === me ? ' me' : ''}"><span>${a.name}</span><span>${a.kills}</span><span>${a.assists}</span><span>${a.deaths}</span><span>${hs}</span><span>${a.dmg}</span><span>${'★'.repeat(a.mvps) || '-'}</span><span>${team === me.team ? '$' + a.money : ''}</span></div>`;
      }
    }
    return html;
  }

  function banner(title, sub, seconds) {
    set(bannerB, title);
    set(bannerS, sub);
    bannerT = seconds;
  }
  function line(parent, text, cls, max) {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = cls;
    div.dataset.until = String(state.time + 6);
    parent.appendChild(div);
    while (parent.children.length > max) parent.firstElementChild.remove();
  }

  /** Show what a simulation event means to the player. */
  function onEvent(e) {
    const me = state.actors[state.playerId];
    if (e.type === EV.KILL) {
      const k = state.actors[e.a], v = state.actors[e.b];
      line(el.feed, `${k.name}  [${e.s}${e.n === 2 ? ' / head' : e.n === 1 ? ' / wall' : ''}]  ${v.name}`, k === me || v === me ? 'me' : '', 5);
    }
    if ((e.type === EV.KILL || e.type === EV.HURT) && e.a === state.viewId && e.b !== e.a) {
      hitT = 0.18;
      el.hit.className = e.n === 2 ? 'head' : '';
    } else if (e.type === EV.RADIO && state.actors[e.a].team === me.team) line(el.radio, `${state.actors[e.a].name}: ${e.s}`, me.team === ATK ? 'atk' : 'def', 4);
    else if (e.type === EV.PLANTED) banner('CHARGE PLANTED', `Site ${e.s}: ${RULES.bombT} seconds`, 3);
    else if (e.type === EV.DEFUSED) banner('CHARGE DEFUSED', '', 3);
    else if (e.type === EV.PICKUP && e.a === me.id) banner('', 'You picked up the charge', 2);
    else if (e.type === EV.PHASE) {
      const r = state.round;
      if (e.s === 'freeze') banner(`ROUND ${r.num}`, state.bomb.carrier === me.id ? 'You carry the charge. Press B to buy.' : 'Press B to buy', RULES.freezeT);
      else if (e.s === 'live') banner('', me.team === ATK ? 'Plant the charge on A or B' : 'Hold the sites', 2.5);
      else if (e.s === 'over') banner(`${TEAM_NAMES[r.winner]} win the round`.toUpperCase(), `${r.reason} · MVP ${state.actors[r.mvp].name}`, RULES.overT);
      if (e.s !== 'live') { el.feed.replaceChildren(); input.buyOpen = false; }
    }
  }

  function update(dt, fovDeg) {
    const r = state.round, me = state.actors[state.playerId], a = state.actors[state.viewId];
    const playing = r.num > 0;
    show($('hud'), playing);
    if (!playing) return;

    // Score, clock and who is left.
    const mySquad = me.squad, clock = Math.max(0, r.phase === 'planted' ? state.bomb.timer : r.t);
    set(el.nameA, TEAM_NAMES[me.team] + ' (you)');
    set(el.nameB, TEAM_NAMES[1 - me.team]);
    el.nameA.className = me.team === ATK ? 'atk' : 'def';
    el.nameB.className = me.team === ATK ? 'def' : 'atk';
    set(el.scoreA, String(r.score[mySquad]));
    set(el.scoreB, String(r.score[1 - mySquad]));
    set(el.pipsA, '●'.repeat(teamAlive(state, me.team)).padEnd(RULES.teamSize, '○'));
    set(el.pipsB, '●'.repeat(teamAlive(state, 1 - me.team)).padEnd(RULES.teamSize, '○'));
    set(el.timer, r.phase === 'planted' ? 'CHARGE' : `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}`);
    el.timer.className = r.phase === 'planted' || (r.phase === 'live' && clock < 15) ? 'hot' : '';
    set(el.roundNo, r.phase === 'freeze' ? 'buy time' : `round ${r.num} · first to ${RULES.winRounds}`);

    // Vitals and the weapon in hand, for whoever is being watched.
    set(el.hp, String(Math.ceil(a.hp)));
    el.hp.style.color = a.hp <= 30 ? 'var(--bad)' : '';
    set(el.armor, String(Math.ceil(a.armor)));
    set(el.armorLabel, a.helmet ? 'Armor + helm' : 'Armor');
    set(el.money, `$${a.money}${a.kit ? '  KIT' : ''}`);
    const gun = a.slot < 2 ? WEAPONS[a.guns[a.slot]] : null;
    set(el.gunName, gun ? gun.name : NADES[NADE_KINDS[a.slot - 2]].name + ' grenade');
    set(el.mag, gun ? String(a.mag[a.slot]) : String(a.nades[a.slot - 2]));
    set(el.res, gun ? `/ ${a.res[a.slot]}` : '');
    el.mag.style.color = gun && a.mag[a.slot] <= gun.mag * 0.25 ? 'var(--bad)' : '';
    set(el.slots, `1 ${a.guns[0] ? WEAPONS[a.guns[0]].name : '-'}   2 ${WEAPONS[a.guns[1]].name}\n3 frag ${a.nades[0]}   4 flash ${a.nades[1]}   5 smoke ${a.nades[2]}${state.bomb.carrier === a.id ? '\nCHARGE' : ''}`);
    set(el.place, regionAt(a.x, a.z));
    set(el.spec, a === me ? '' : `Watching ${a.name}`);

    // Crosshair: the gap is the weapon's accuracy cone projected on the screen, so it visibly
    // opens when you run, jump or spray and closes when you stop.
    const gap = 3 + (Math.tan(a.spread) / Math.tan((fovDeg * Math.PI) / 360)) * (window.innerHeight / 2);
    show(el.cross, a.alive && !a.zoomed && !(gun && gun.zoom));
    for (let i = 0; i < 4; i++) {
      const h = i < 2, sign = i % 2 ? 1 : -1, len = 7;
      hairs[i].style.cssText = h
        ? `left:${sign < 0 ? -gap - len : gap}px;top:-1px;width:${len}px;height:2px`
        : `top:${sign < 0 ? -gap - len : gap}px;left:-1px;height:${len}px;width:2px`;
    }
    hitT -= dt;
    el.hit.style.opacity = hitT > 0 ? '1' : '0';
    // Where the last hit on you came from, as an arc turned towards it.
    el.dmg.style.opacity = String(Math.min(1, a.hurtT * 2));
    el.dmg.style.transform = `rotate(${a.yaw - a.hurtYaw}rad)`;

    bannerT -= dt;

    // What the use key would do here, and progress bars for planting, defusing and reloading.
    const b = state.bomb;
    let hint = '', progress = 0;
    if (me.alive && me.useT > 0) {
      hint = me.team === ATK ? 'Planting' : 'Defusing';
      progress = me.useT / (me.team === ATK ? RULES.plantT : me.kit ? RULES.defuseKitT : RULES.defuseT);
    } else if (me.alive && me.reloadT > 0 && gun) {
      hint = 'Reloading';
      progress = 1 - me.reloadT / gun.reload;
    } else if (me.alive && b.carrier === me.id && r.phase === 'live') hint = siteAt(me.x, me.z) >= 0 ? 'Hold E to plant the charge' : 'You carry the charge';
    else if (me.alive && me.team === DEF && r.phase === 'planted' && Math.hypot(me.x - b.x, me.z - b.z) < 1.6) hint = 'Hold E to defuse';
    set(promptText, hint);
    show(el.bar, progress > 0);
    barFill.style.width = `${Math.min(100, progress * 100)}%`;

    // The slower panels refresh four times a second.
    slowT -= dt;
    const buying = input.buyOpen && canBuy(state, me);
    if (input.buyOpen && !buying) input.buyOpen = false;
    show(el.buy, buying);
    show(el.scores, input.scores || r.phase === 'match');
    el.banner.style.opacity = bannerT > 0 && !buying && !input.scores ? '1' : '0';
    if (slowT <= 0) {
      slowT = 0.25;
      drawRadar(a);
      if (buying) { set(el.buyMoney, `$${me.money}`); el.buyRows.innerHTML = buyCards(me); }
      if (input.scores || r.phase === 'match') el.scores.innerHTML = scoreRows();
      for (const list of [el.feed, el.radio]) {
        while (list.firstElementChild && Number(list.firstElementChild.dataset.until) < state.time) list.firstElementChild.remove();
      }
    }
  }

  return { update, onEvent };
}
