// A scripted play-test in real Chrome: starts a match from the menu, buys, walks, fires, reloads,
// throws a grenade, and reports what the HUD says, the frame rate and any console errors.
//   node serve.ts 8123 &   then   node tools/playtest.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openChrome } from './chrome.mjs';

const out = process.argv[2] || 'out-playtest';
mkdirSync(out, { recursive: true });
const page = await openChrome();
process.on("uncaughtException", async (e) => { console.error(e); await page.close(); process.exit(1); });
const hud = () => page.eval(`(() => { const t = (id) => document.getElementById(id).textContent.trim(); return { hp: t("hp"), armor: t("armor"), mag: t("mag"), res: t("res"), gun: t("gunName"), money: t("money"), place: t("place"), timer: t("timer"), banner: t("banner"), prompt: t("prompt"), feed: t("feed"), radio: t("radio"), locked: !!document.pointerLockElement, pause: document.getElementById("pause").className }; })()`);
const fps = () => page.eval(`new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : done(Math.round(n / 2)); }; requestAnimationFrame(tick); })`);

await page.goto('http://localhost:8123/?seed=21');
await page.shot(join(out, '0-menu.jpg'));
console.log('menu fps', await fps());
const btn = await page.eval(`(() => { const r = document.getElementById("playAtk").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
await page.click(btn[0], btn[1]);
await page.sleep(800);
console.log('after start', await hud());
await page.hold('KeyB', 'b', 60);
await page.sleep(300);
await page.shot(join(out, '1-buy.jpg'));
await page.hold('Digit9', '9', 60); // frag
await page.hold('Digit0', '0', 60); // flash
await page.sleep(200);
console.log('bought frag + flash', await hud());
await page.hold('KeyB', 'b', 60);
await page.sleep(6600);
console.log('live', await hud());
// Fire the pistol, reload, then throw the frag over the gatehouse wall.
for (let i = 0; i < 4; i++) { await page.click(640, 360, 50); await page.sleep(170); }
console.log('fired 4', await hud());
await page.hold('KeyR', 'r', 80);
await page.sleep(2300);
console.log('reloaded', await hud());
await page.hold('Digit3', '3', 60);
await page.sleep(700);
console.log('frag in hand', await hud());
for (let i = 0; i < 12; i++) await page.mouse('mouseMoved', 640, 360 - i * 10, { movementX: 0, movementY: -14 });
await page.click(640, 360, 250);
await page.sleep(900);
await page.shot(join(out, '2-thrown.jpg'));
console.log('frag thrown', await hud());
// Walk, crouch, jump, open the scoreboard, pause and resume.
await page.hold('KeyA', 'a', 900);
await page.hold('ControlLeft', 'Control', 500);
await page.hold('Space', ' ', 60);
await page.key('Tab', 'Tab', true);
await page.sleep(400);
console.log('scoreboard shown', await page.eval("getComputedStyle(document.getElementById('scores')).display + ', rows ' + document.querySelectorAll('#scores .row').length"));
await page.key('Tab', 'Tab', false);
console.log('play fps', await fps());
await page.hold('Escape', 'Escape', 60);
await page.sleep(400);
const paused = await hud();
await page.sleep(1500);
console.log('paused: clock held', paused.timer, '->', (await hud()).timer, paused.pause);
const resume = await page.eval("(() => { const r = document.getElementById('resume').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()");
await page.click(resume[0], resume[1]);
await page.sleep(500);
console.log('resumed', (await hud()).pause);
// Let the bots play the round out and check the next one starts with the score counted.
for (let i = 0; i < 150; i++) {
  await page.sleep(1000);
  const round = await page.eval("document.getElementById('banner').textContent");
  if (/ROUND 2/.test(round)) break;
  if (i % 20 === 0) console.log('  ...', JSON.stringify(await hud()).slice(0, 230));
}
await page.shot(join(out, '3-round2.jpg'));
console.log('round 2', await hud(), 'score', await page.eval("document.getElementById('scoreA').textContent + '-' + document.getElementById('scoreB').textContent"));
console.log('console:', page.logs.length ? page.logs : 'clean');
await page.close();
