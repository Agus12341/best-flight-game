// Skyward Post, handed in (Node 22, standard library only). The game itself is this
// directory's game/ folder: plain static files a desktop browser plays offline, no build
// step and no network. This program copies game/ and screenshots/ to the output directory
// and writes dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Run it the way the grader does, from this directory:
//   node main.ts            (writes to /output)
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Check the entry is whole before handing it in: a game with no index.html, or screenshots
// missing or over the scorer's 256 KiB cap, would be refused at grading with nothing said.
// Refuse it here instead, where the reason can still be read and fixed.
const SCREENSHOT_MAX_BYTES = 262144;
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('Skyward Post: game/index.html is missing, so there is no game to hand in.');
}
const shotDir = join(here, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((name) => /\.(png|jpe?g)$/i.test(name)) : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`Skyward Post: screenshots/ holds ${shots.length} images; the entry needs 3 or 4.`);
}
for (const name of shots) {
  const size = statSync(join(shotDir, name)).size;
  if (size > SCREENSHOT_MAX_BYTES) {
    throw new Error(`Skyward Post: screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_MAX_BYTES} cap.`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (the kit's reference gate): at most 4 screenshots of at most
// 256 KiB each, at most 993 files and 48 MiB under game/, no game path over 1000 bytes, and
// the dossier's text held to 160 KiB. Passing them here means the entry refuses, loudly and
// locally, anything the scorer would refuse silently later.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Skyward Post handed in to ${out}: game/, screenshots/, dossier.json`);
