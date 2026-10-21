#!/usr/bin/env node
// Gate 7 music: offline built-in beds, listening samples, and recording the user's pick.
//   node make-music.mjs <project-dir> --samples [--files a.mp3,b.wav]
//        every built-in bed (+ the user's files) → review/music/<name>.m4a (30 s, fade out), then
//        audio-picker.mjs writes review/audio-picker.html to compare them
//   node make-music.mjs <project-dir> --use <bed|path|none>
//        studio.json → audio.music (built-in beds are rendered into assets/music/<name>.wav;
//        a file outside the project is copied into assets/music/; none = the user wants no music)
//   node make-music.mjs <project-dir> [--preset ambient|lofi] [--mood calm|bright|warm|dark] [--bpm 100]
//        [--key C|D#|Bb…] [--length 20] [--name my-bed]       → assets/music/<name>.wav (custom bed)
//   node make-music.mjs --out bed.wav [same options]           (no project)
// Everything is synthesised locally (no network, no samples); same options → identical file.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { BUILTIN_BEDS, MOODS, PRESETS, writeBed } from "./lib/music.mjs";
import { run } from "./lib/ffmpeg.mjs";

const USAGE = `usage: make-music.mjs <project-dir> --samples [--files a.mp3,b.wav]
       make-music.mjs <project-dir> --use <${Object.keys(BUILTIN_BEDS).join("|")}|path|none>
       make-music.mjs <project-dir> [--preset ${Object.keys(PRESETS).join("|")}] [--mood ${Object.keys(MOODS).join("|")}] [--bpm n] [--key C] [--length s] [--name x]
       make-music.mjs --out bed.wav [--preset …]`;

export const musicDir = (project) => join(project.root, "assets", "music");

// Built-in bed file in the project (rendered on first use).
export function ensureBed(project, name) {
  const spec = BUILTIN_BEDS[name];
  if (!spec) return null;
  const file = join(musicDir(project), `${name}.wav`);
  if (!existsSync(file)) writeBed(file, spec);
  return file;
}

// 30 s listening sample with a fade out, small enough to send over chat.
export function sampleOf(src, out, { seconds = 30 } = {}) {
  mkdirSync(join(out, ".."), { recursive: true });
  run("ffmpeg", ["-y", "-v", "error", "-stream_loop", "-1", "-i", src, "-t", String(seconds), "-af", `afade=t=in:d=0.3,afade=t=out:st=${seconds - 3}:d=3`, "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
  return out;
}

export function musicSamples(dir, { files = [], log = () => {} } = {}) {
  const project = loadProject(dir);
  const out = [];
  for (const name of Object.keys(BUILTIN_BEDS)) {
    const bed = ensureBed(project, name);
    out.push({ name, kind: "built-in", bed: relative(project.root, bed), sample: relative(project.root, sampleOf(bed, join(project.root, "review", "music", `${name}.m4a`))) });
    log(`✓ ${name}`);
  }
  for (const f of files) {
    const src = resolve(f);
    if (!existsSync(src)) throw new Error(`music file not found: ${f}`);
    const name = `user-${basename(src, extname(src)).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    out.push({ name, kind: "user", bed: src, sample: relative(project.root, sampleOf(src, join(project.root, "review", "music", `${name}.m4a`))) });
    log(`✓ ${name} (${f})`);
  }
  return { project, samples: out };
}

export function useMusic(dir, choice) {
  const project = loadProject(dir);
  let value;
  if (choice === "none") value = false;
  else if (BUILTIN_BEDS[choice]) value = relative(project.root, ensureBed(project, choice));
  else {
    const src = resolve(choice);
    const user = /^user-(.+)$/.exec(choice);
    if (!existsSync(src) && user) throw new Error(`pass the original file path for ${choice}`);
    if (!existsSync(src)) throw new Error(`no built-in bed or file "${choice}"; built-in: ${Object.keys(BUILTIN_BEDS).join(", ")}`);
    if (src.startsWith(project.root + "/")) value = relative(project.root, src);
    else {
      mkdirSync(musicDir(project), { recursive: true });
      const dest = join(musicDir(project), basename(src));
      copyFileSync(src, dest);
      value = relative(project.root, dest);
    }
  }
  project.studio.audio ??= {};
  project.studio.audio.music = value;
  project.save();
  return { project, music: value };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["samples", "help"], options: ["use", "files", "preset", "mood", "bpm", "key", "length", "name", "out", "seed"] });
    const dir = args._[0];
    if (args.help || (!dir && !args.out)) {
      console.log(USAGE);
      process.exit(args.help ? 0 : 1);
    }
    const opts = { preset: args.preset, mood: args.mood, bpm: args.bpm, key: args.key, length: args.length, seed: args.seed ? Number(args.seed) : undefined };
    if (args.samples) {
      const r = musicSamples(dir, { files: args.files ? args.files.split(",").map((s) => s.trim()) : [], log: console.log });
      for (const s of r.samples) console.log(`  ${s.name.padEnd(16)} ${s.sample}`);
      console.log(`Next: node audio-picker.mjs "${dir}" → review/audio-picker.html; ask the user which bed, then --use <name|none>.`);
    } else if (args.use) {
      const r = useMusic(dir, args.use);
      console.log(r.music === false ? "✓ no music (audio.music = false)" : `✓ audio.music = ${r.music}`);
    } else {
      const out = args.out ? resolve(args.out) : join(musicDir(loadProject(dir)), `${args.name ?? `${opts.preset ?? "ambient"}-${opts.mood ?? "calm"}`}.wav`);
      const r = writeBed(out, opts);
      console.log(`✓ ${out}  ${r.preset}/${r.mood} ${r.bpm} BPM in ${r.key}, ${r.seconds.toFixed(2)} s loop (${r.cycles}× 4 bars), peak −3 dBFS`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
