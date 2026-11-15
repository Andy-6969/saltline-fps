// Drives a real desktop Chrome over the DevTools protocol (Node 22+, standard library only).
// Used to play-test the game with real key and mouse events and to take the entry's screenshots.
//   import { openChrome } from './chrome.mjs'
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openChrome({ width = 1280, height = 720, port = 9333, headless = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'saltline-chrome-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const waiting = new Map(), logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    logs, send, sleep,
    async goto(url) { await send('Page.navigate', { url }); await sleep(1500); },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, ms = 15000) {
      for (let t = 0; t < ms; t += 100) { if (await page.eval(expression)) return; await sleep(100); }
      throw new Error(`timed out waiting for ${expression}`);
    },
    async key(code, key, down) {
      const vk = code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : { Space: 32, ControlLeft: 17, ShiftLeft: 16, Tab: 9, Escape: 27 }[code] || 0;
      await send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', code, key, windowsVirtualKeyCode: vk });
    },
    async hold(code, key, ms) { await page.key(code, key, true); await sleep(ms); await page.key(code, key, false); },
    async mouse(type, x, y, extra = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra }); },
    async click(x, y, ms = 40, button = 'left') {
      await page.mouse('mousePressed', x, y, { button, clickCount: 1 });
      await sleep(ms);
      await page.mouse('mouseReleased', x, y, { button, clickCount: 1 });
    },
    async shot(file, quality = 88) {
      const r = await send('Page.captureScreenshot', { format: file.endsWith('.png') ? 'png' : 'jpeg', quality });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() { ws.close(); proc.kill(); await sleep(300); },
  };
  return page;
}
