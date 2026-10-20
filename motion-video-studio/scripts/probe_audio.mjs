#!/usr/bin/env node
// Measure every voice-over file referenced in storyboard.json with Mediabunny and write
// the real durations back (scene.vo.duration), so scene lengths follow the VO exactly.
// Falls back to ffprobe if Mediabunny can't read a file.
//
// Usage: node probe_audio.mjs <project-dir> [--dry-run]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const dry = process.argv.includes("--dry-run");
const sbPath = join(dir, "storyboard.json");
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
const require = createRequire(join(dir, "package.json"));

let mb = null;
try {
  const m = await import(require.resolve("mediabunny"));
  mb = m.FilePathSource ? m : m.default; // CJS bundle → namespace on default
} catch {
  console.warn("mediabunny not installed in the project — using ffprobe");
}

async function duration(file) {
  if (mb) {
    try {
      const input = new mb.Input({ source: new mb.FilePathSource(file), formats: mb.ALL_FORMATS });
      const d = await input.computeDuration();
      input.dispose?.();
      return d;
    } catch (e) {
      console.warn(`mediabunny failed on ${file}: ${e.message} — trying ffprobe`);
    }
  }
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
  return Number(out);
}

let changed = 0;
for (const s of sb.scenes) {
  if (!s.vo?.src) continue;
  const file = join(dir, "public", s.vo.src);
  if (!existsSync(file)) {
    console.error(`✗ ${s.id}: ${s.vo.src} not found`);
    continue;
  }
  const d = Math.round((await duration(file)) * 1000) / 1000;
  const old = s.vo.duration;
  s.vo.duration = d;
  if (old !== d) changed++;
  const fit = s.duration && d + 0.55 > s.duration ? `  → scene grows from ${s.duration}s to fit` : "";
  console.log(`✓ ${s.id.padEnd(18)} ${d.toFixed(2)}s${fit}`);
}
if (sb.audio?.music?.src && !/^https?:/.test(sb.audio.music.src)) {
  const f = join(dir, "public", sb.audio.music.src);
  if (existsSync(f)) console.log(`♪ music ${(await duration(f)).toFixed(2)}s (loops if shorter than the video)`);
}
if (!dry && changed) {
  writeFileSync(sbPath, JSON.stringify(sb, null, 2) + "\n");
  console.log(`Updated ${changed} duration(s) in storyboard.json`);
} else if (!changed) console.log("No changes");
