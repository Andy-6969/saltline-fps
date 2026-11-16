// The HUD's stylesheet lives readable in tools/hud.css; this writes the minified copy the game
// loads, game/hud.min.css (comments and whitespace removed).   node tools/mincss.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const css = readFileSync(new URL('./hud.css', import.meta.url), 'utf8');
const min = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
writeFileSync(new URL('../game/hud.min.css', import.meta.url), min + '\n');
console.log(`hud.css ${css.length} bytes -> game/hud.min.css ${min.length} bytes`);
