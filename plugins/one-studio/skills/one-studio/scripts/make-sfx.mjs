#!/usr/bin/env node
// Offline SFX kit (FFmpeg lavfi only: no samples, no network): whoosh, swoosh, pop, click, ding, riser, impact.
//   node make-sfx.mjs <project-dir> [--names whoosh,pop] [--force]   → <project>/assets/sfx/<name>.wav
//   node make-sfx.mjs --out <dir> [--names …]                          (no project)
//   node make-sfx.mjs --list
// Use them as storyboard cues, mixed by concat-and-mix (scene-relative):
//   "sfx": [{ "name": "whoosh", "at": 0.2 }, { "name": "pop", "line": "s02-2", "at": 0, "gain": -6 }]
// Built-ins referenced by cues are also rendered on demand, so this is only needed to audition them.
import { resolve } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { SFX_NAMES, SFX_RECIPES, makeSfx, sfxDir } from "./lib/sfx.mjs";

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["force", "list", "help"], options: ["names", "out"] });
    const dir = args._[0];
    if (args.list) {
      for (const n of SFX_NAMES) console.log(`${n.padEnd(8)} ${SFX_RECIPES[n].about}`);
      process.exit(0);
    }
    if (args.help || (!dir && !args.out)) {
      console.log("usage: make-sfx.mjs <project-dir> [--names whoosh,pop] [--force] | --out <dir> | --list");
      process.exit(args.help ? 0 : 1);
    }
    const out = args.out ? resolve(args.out) : sfxDir(loadProject(dir));
    const names = args.names ? args.names.split(",").map((s) => s.trim()) : SFX_NAMES;
    for (const n of names) console.log(`✓ ${makeSfx(n, out, { force: args.force })}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
