// Night Mail — the program that hands the game in (best-game-01, Node 22, standard library only).
//
// The game itself is the static site in game/ beside this file: it runs in a desktop browser
// straight from those files, offline, with no build step. This program's whole job is the
// handover: copy game/ and screenshots/ into the output directory and write the dossier the
// judge reads, built by the vendored make.fun library in vendor/makefun-game.ts.
//
// In the grader the output directory is /output; anywhere else, MAKEFUN_OUTPUT_DIR names it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, passed to the dossier builder so an entry the scorer would refuse is
// refused here instead: at most 4 screenshots of at most 256 KiB each, at most 993 files
// and 48 MiB under game/, no game path longer than 1000 bytes, dossier text capped at 160 KiB.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  const shotsDir = join(repoDir, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  }
  writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, GATE_CAPS));
}

handIn();
