// SALTLINE's entry program (Node 22, standard library only). The game is the static files under
// game/; this hands them in: it copies game/ and screenshots/ to the output directory and writes
// dossier.json, the summary the judge reads, with make.fun's vendored library.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts     (the grader writes to /output)
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own limits: 160 KiB of source text, at most 4 screenshots of 256 KiB, 993 game files in 48 MiB.
const LIMITS = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 };

mkdirSync(out, { recursive: true });
for (const dir of ['game', 'screenshots']) cpSync(join(here, dir), join(out, dir), { recursive: true });
writeFileSync(join(out, 'dossier.json'), buildDossier(out, LIMITS));
