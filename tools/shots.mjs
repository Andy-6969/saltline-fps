// Takes the entry's screenshots: opens each staged still listed in shots.json in real Chrome and
// saves the frame, untouched, under screenshots/.   node serve.ts 8123 &   node tools/shots.mjs [outDir] [only]
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openChrome } from './chrome.mjs';

const out = process.argv[2] || 'screenshots';
const only = process.argv[3];
const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
const page = await openChrome({ port: 9335 });
for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  await page.goto(`http://localhost:8123/${shot.query}`);
  await page.waitFor(`document.title === 'shot-ready'`);
  await page.sleep(400);
  const file = join(out, shot.name);
  await page.shot(file, 86);
  console.log(shot.name, statSync(file).size, 'bytes');
}
if (page.logs.length) console.log(page.logs);
await page.close();
