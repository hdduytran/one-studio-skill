// Offline sound-effect kit (FFmpeg lavfi only: no samples, no network) and storyboard SFX cues.
// Cues live on scenes: storyboard.json → scenes[].sfx[] = { name | src, at, line?, gain? }
//   name  built-in effect (SFX_NAMES), rendered on demand into assets/sfx/<name>.wav
//   src   any audio file in the project instead
//   at    seconds from the scene start (or from the start of `line` when given)
//   gain  dB, default 0 (negative = quieter)
// The final mix (concat-and-mix) places them; nothing in the picture changes.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { run } from "./ffmpeg.mjs";

// Bump when a recipe changes: part of the audio hash.
export const SFX_VERSION = 1;

const R = 48000;
// Each recipe: FFmpeg inputs + filter graph ending in [out]. Noise sources are seeded → identical files.
export const SFX_RECIPES = {
  whoosh: { about: "pink-noise sweep, 0.6 s (element flies in)", inputs: ["anoisesrc=d=0.6:c=pink:a=0.9:seed=7"], graph: "[0]bandpass=f=900:w=1.2,afade=t=in:d=0.25:curve=exp,afade=t=out:st=0.3:d=0.3,volume=2[out]" },
  swoosh: { about: "low, longer whoosh, 0.9 s (scene transition)", inputs: ["anoisesrc=d=0.9:c=brown:a=0.9:seed=11"], graph: "[0]lowpass=f=1500,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.5,volume=3[out]" },
  pop: { about: "short pitched blip (element appears)", inputs: ["sine=f=1320:d=0.09:sample_rate=48000"], graph: "[0]afade=t=out:st=0.02:d=0.07,volume=0.8[out]" },
  click: { about: "UI tap", inputs: ["anoisesrc=d=0.03:c=white:a=1:seed=3"], graph: "[0]highpass=f=2500,afade=t=out:d=0.03[out]" },
  ding: { about: "bell, 1.2 s (CTA / success)", inputs: ["sine=f=1318:d=1.2:sample_rate=48000", "sine=f=2637:d=1.2:sample_rate=48000"], graph: "[0][1]amix=inputs=2:weights=1 0.35,afade=t=out:st=0.05:d=1.15:curve=exp,volume=1.5[out]" },
  riser: { about: "rising tone, 1.5 s (before a reveal)", inputs: ["aevalsrc=0.4*sin(2*PI*(200*t+300*t*t)):d=1.5:s=48000"], graph: "[0]afade=t=in:d=1.2,afade=t=out:st=1.45:d=0.05[out]" },
  impact: { about: "low boom, 1.2 s (logo hit)", inputs: ["aevalsrc=0.9*sin(2*PI*55*t)*exp(-4*t):d=1.2:s=48000", "anoisesrc=d=0.15:c=brown:a=0.6:seed=5"], graph: "[1]afade=t=out:d=0.15[n];[0][n]amix=inputs=2,volume=2[out]" },
};
export const SFX_NAMES = Object.keys(SFX_RECIPES);

// Render one built-in effect to a 48 kHz stereo WAV. Returns the path.
export function makeSfx(name, outDir, { force = false } = {}) {
  const r = SFX_RECIPES[name];
  if (!r) throw new Error(`unknown SFX "${name}"; built-in: ${SFX_NAMES.join(", ")}`);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${name}.wav`);
  if (existsSync(out) && !force) return out;
  const tmp = `${out}.part.wav`;
  run("ffmpeg", ["-y", "-v", "error", ...r.inputs.flatMap((i) => ["-f", "lavfi", "-i", i]), "-filter_complex", r.graph, "-map", "[out]",
    "-ar", String(R), "-ac", "2", "-c:a", "pcm_s16le", "-fflags", "+bitexact", "-flags:a", "+bitexact", tmp]);
  renameSync(tmp, out);
  return out;
}

export const sfxDir = (project) => join(project.root, "assets", "sfx");

// Every cue in storyboard order, flattened: { scene, at, line, gain, name, src }.
export function sfxCues(project) {
  return (project.storyboard?.scenes ?? []).flatMap((s) =>
    (s.sfx ?? []).map((c) => ({ scene: s.id, at: c.at ?? 0, line: c.line ?? null, gain: c.gain ?? 0, name: c.name ?? null, src: c.src ?? null })),
  );
}

// Absolute file of a cue (built-ins rendered on first use; local synthesis only).
export function cueFile(project, cue) {
  if (cue.src) {
    const f = resolve(project.root, cue.src);
    if (!existsSync(f)) throw new Error(`SFX file not found: ${cue.src} (scene ${cue.scene})`);
    return f;
  }
  return makeSfx(cue.name, sfxDir(project));
}

// Place cues on the video timeline. sceneStarts: Map id → absolute start; lineStarts: Map lineId → scene-relative start.
export function placeCues(project, sceneStarts, lineStarts = new Map(), { log = () => {} } = {}) {
  const out = [];
  for (const c of sfxCues(project)) {
    const base = sceneStarts.get(c.scene);
    if (base == null) continue;
    let at = base + c.at;
    if (c.line) {
      const ls = lineStarts.get(c.line);
      if (ls == null) log(`⚠ sfx in ${c.scene}: line ${c.line} has no timing yet (run build-audio.mjs); placed from the scene start`);
      else at += ls;
    }
    out.push({ ...c, file: cueFile(project, c), time: Math.max(0, Math.round(at * 1000) / 1000) });
  }
  return out;
}

// assets/audio-cues.js: window.OS_CUES = { <scene>: [{ at, src, gain }] } with src relative to assets/,
// for the howler.js studio preview in os.js. Not part of any scene hash (sound only).
export function writeAudioCues(project) {
  const manifestPath = join(project.root, "audio", "manifest.json");
  const lineStarts = new Map();
  if (existsSync(manifestPath)) for (const s of JSON.parse(readFileSync(manifestPath, "utf8")).scenes ?? []) for (const l of s.lines ?? []) lineStarts.set(l.id, l.start);
  const assets = join(project.root, "assets");
  const byScene = {};
  if (project.studio.audio?.sfx !== false) {
    for (const c of sfxCues(project)) {
      let file;
      try {
        file = cueFile(project, c);
      } catch {
        continue;
      }
      const at = Math.round((c.at + (c.line ? lineStarts.get(c.line) ?? 0 : 0)) * 1000) / 1000;
      (byScene[c.scene] ??= []).push({ at, src: relative(assets, file).split("\\").join("/"), gain: c.gain });
    }
  }
  mkdirSync(assets, { recursive: true });
  const out = join(assets, "audio-cues.js");
  writeFileSync(out, `/* Generated by one-studio from storyboard sfx[] — studio preview only. Do not edit. */\nwindow.OS_CUES = ${JSON.stringify(byScene)};\n`);
  return { file: out, scenes: Object.keys(byScene).length };
}
