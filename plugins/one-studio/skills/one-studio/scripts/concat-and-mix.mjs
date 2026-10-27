#!/usr/bin/env node
// Assemble the video: concat scene clips (stream copy, storyboard order), mix VO + music (ducked) + SFX cues,
// two-pass loudnorm to the target LUFS, captions (none / sidecar / mux / burn: studio.captions, else brand.captions;
// burn falls back to mux when FFmpeg has no libass). FFmpeg owns the final mix: browser audio is never captured.
//   node concat-and-mix.mjs <project-dir> [--preview [--ratio 9:16]] [--no-captions]
// Output: out/<name>.mp4 (or out/<name>-preview.mp4) + out/<name>.srt; recorded in studio.json → outputs.
// --preview --ratio <export ratio>: a low-res review copy at that ratio (out/<name>-preview-9x16.mp4), so a Shorts /
// TikTok cut can be checked at gate 8; review only, no gate depends on it. The full-size version comes from publish.
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, now, parseArgs } from "./lib/project.mjs";
import { audioHash } from "./lib/hash.mjs";
import { gateInputHash, outputPath, readAudioManifest } from "./lib/gates.mjs";
import { checkClips, concatCopy, encodeSettings, hasLibass, normalize, probe, run } from "./lib/ffmpeg.mjs";
import { captionMode } from "./lib/captions.mjs";
import { placeCues, sfxCues } from "./lib/sfx.mjs";
import { UI_ZONE, captionSafe } from "./lib/platforms.mjs";
import { ratioTag } from "./lib/variants.mjs";
import { renderRatioClips } from "./lib/ratio-render.mjs";
import { effectiveDuration } from "./lib/scenes.mjs";
import { planRender } from "./render-changed-scenes.mjs";

// "#rrggbb" / "rgba(r,g,b,a)" → ASS &HAABBGGRR
export function assColor(css, fallback = "&H00FFFFFF") {
  if (!css) return fallback;
  let r, g, b, a = 1;
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(css.trim());
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css.trim());
  if (hex) [r, g, b, a] = [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16), hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  else if (rgba) [r, g, b, a] = [+rgba[1], +rgba[2], +rgba[3], rgba[4] == null ? 1 : +rgba[4]];
  else return fallback;
  const h = (n) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `&H${h((1 - a) * 255)}${h(b)}${h(g)}${h(r)}`;
}

// libass styles for .srt live in a 384×288 script space scaled to the video height; brand sizes are px
// at 1080 on the short side, so portrait videos keep the same on-screen size relative to the width.
// safe: keep clear of the Shorts / TikTok / Reels UI (bottom 20 %, right rail 12 %).
export function captionStyle(brand, width = 1920, height = 1080, { safe = false } = {}) {
  const c = brand?.captions ?? {};
  // Phones show portrait video full-screen: captions a bit larger there.
  const k = (288 / height) * (Math.min(width, height) / 1080) * (height > width * 1.2 ? 1.35 : 1);
  const size = Math.round((c.size ?? 44) * k * 10) / 10;
  const margin = Math.round(288 * (safe ? UI_ZONE.bottom + 0.03 : 0.06));
  const side = safe ? Math.round(384 * UI_ZONE.right) : null;
  const align = { bottom: 2, middle: 5, top: 8 }[c.position ?? "bottom"];
  return [
    `FontName=${(c.font ?? brand?.typography?.body?.family ?? "Sans").replace(/[,']/g, "")}`,
    `FontSize=${size}`,
    `PrimaryColour=${assColor(c.color, "&H00FFFFFF")}`,
    `OutlineColour=${assColor(c.background, "&H73000000")}`,
    `BackColour=${assColor(c.background, "&H73000000")}`,
    "BorderStyle=3",
    `Outline=${Math.max(1, Math.round(size * 0.35))}`,
    "Shadow=0",
    `Alignment=${align}`,
    `MarginV=${margin}`,
    ...(side ? [`MarginL=${side}`, `MarginR=${side}`] : []),
    `Bold=${(brand?.typography?.body?.weight ?? 400) >= 600 ? 1 : 0}`,
  ].join(",");
}

const filterPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

function measureLoudness(file) {
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
  const json = /\{[\s\S]*?\}/.exec(r.stderr.slice(r.stderr.lastIndexOf("[Parsed_loudnorm")));
  return json ? JSON.parse(json[0]) : null;
}

export function integratedLufs(file) {
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const m = /Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS/.exec(r.stderr);
  return m ? Number(m[1]) : null;
}

// Where each scene (and each VO line, scene-relative) starts: from the audio manifest when there is one,
// else from the storyboard lengths.
export function timelineStarts(project, manifest) {
  const sceneStarts = new Map();
  const lineStarts = new Map();
  if (manifest?.scenes?.length) {
    for (const s of manifest.scenes) {
      sceneStarts.set(s.id, s.start);
      for (const l of s.lines ?? []) lineStarts.set(l.id, l.start);
    }
  } else {
    let t = 0;
    for (const s of project.storyboard?.scenes ?? []) {
      sceneStarts.set(s.id, t);
      t += effectiveDuration(project, s);
    }
  }
  return { sceneStarts, lineStarts };
}

// Mixed, loudness-normalised stereo WAV at 48 kHz, exactly `dur` seconds long.
// VO + music (looped, faded out, ducked under the VO) + SFX cues (placed, never ducked).
function buildMix(project, manifest, dur, tmp, log = () => {}) {
  const a = project.studio.audio ?? {};
  const target = a.loudness ?? -14;
  const music = a.music ? join(project.root, a.music) : null;
  if (music && !existsSync(music)) throw new Error(`music file not found: ${a.music} (make-music.mjs <dir> --use <bed>)`);
  const vo = manifest?.vo ? join(project.root, manifest.vo) : null;
  let cues = [];
  if (sfxCues(project).length) {
    if (a.sfx === false) log(`⚠ ${sfxCues(project).length} SFX cue(s) in the storyboard are muted (studio.json → audio.sfx is false)`);
    else {
      const { sceneStarts, lineStarts } = timelineStarts(project, manifest);
      cues = placeCues(project, sceneStarts, lineStarts, { log }).filter((c) => c.time < dur);
    }
  }
  const raw = join(tmp, "mix-raw.wav");
  if (!vo && !music && !cues.length) {
    run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(dur), raw]);
    return { file: raw, lufs: null, silent: true, sfx: 0 };
  }
  const fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
  const inputs = [];
  const graph = [];
  const bus = [];
  const fadeOut = `afade=t=out:st=${Math.max(0, dur - 2)}:d=2`;
  let n = 0; // FFmpeg input index
  if (vo) {
    n++;
    inputs.push("-i", vo);
    graph.push(`[0:a]${fmt},apad[vo]`);
  }
  if (music) {
    const k = n++;
    inputs.push("-stream_loop", "-1", "-i", music);
    graph.push(`[${k}:a]${fmt},volume=0.5,${fadeOut}[m]`);
    if (vo) {
      graph.push("[vo]asplit=2[vo1][key]", "[m][key]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=350[duck]");
      bus.push("[vo1]", "[duck]");
    } else bus.push("[m]");
  } else if (vo) bus.push("[vo]");
  cues.forEach((c, i) => {
    const k = n++;
    inputs.push("-i", c.file);
    const ms = Math.round(c.time * 1000);
    graph.push(`[${k}:a]${fmt},volume=${c.gain}dB,adelay=${ms}|${ms}[x${i}]`);
    bus.push(`[x${i}]`);
  });
  graph.push(bus.length > 1 ? `${bus.join("")}amix=inputs=${bus.length}:normalize=0:duration=longest:dropout_transition=0,apad[mix]` : `${bus[0]}apad[mix]`);
  const script = join(tmp, "mix-graph.txt");
  writeFileSync(script, graph.join(";\n"));
  run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex_script", script, "-map", "[mix]", "-t", String(dur), "-ar", "48000", raw]);
  const m = measureLoudness(raw);
  const out = join(tmp, "mix.wav");
  if (!m || !Number.isFinite(Number(m.input_i)) || Number(m.input_i) < -70) {
    copyFileSync(raw, out);
    return { file: out, lufs: null, silent: true, sfx: cues.length };
  }
  run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af",
    `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`,
    "-t", String(dur), out]);
  return { file: out, lufs: null, silent: false, sfx: cues.length };
}

// Concat clips (already canonical), mix audio, captions → outPath. Shared by concat-and-mix and publish.
export function assemble(project, clips, settings, outPath, { captions = true, log = () => {} } = {}) {
  const problems = checkClips(clips, settings);
  if (problems.length) {
    log(`QA: re-normalising mismatched clips:\n  ${problems.join("\n  ")}`);
    for (const c of new Set(problems.map((p) => p.split(":")[0]))) {
      const tmp = `${c}.renorm.mp4`;
      normalize(c, tmp, settings);
      copyFileSync(tmp, c);
      rmSync(tmp);
    }
    const again = checkClips(clips, settings);
    if (again.length) throw new Error(`Clips still differ after normalising:\n  ${again.join("\n  ")}`);
  }

  const tmp = join(project.root, ".one-studio", `tmp-mix-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const video = concatCopy(clips, join(tmp, "video.mp4"));
    const dur = probe(video).duration;

    const manifest = readAudioManifest(project);
    const hasLines = (project.storyboard?.scenes ?? []).some((s) => s.lines?.length);
    if (manifest && manifest.hash !== audioHash(project)) log("⚠ audio/manifest.json is out of date (run build-audio.mjs); using it anyway");
    if (!manifest && hasLines) log("⚠ no voice-over yet (build-audio.mjs not run): output has music/silence only");
    if (manifest?.duration && Math.abs(manifest.duration - dur) > 0.15) log(`⚠ audio timeline ${manifest.duration}s vs video ${dur.toFixed(2)}s: re-run build-audio.mjs after changing scenes`);
    const mix = buildMix(project, manifest, dur, tmp, log);

    mkdirSync(join(outPath, ".."), { recursive: true });
    const srt = manifest?.captions ? join(project.root, manifest.captions) : null;
    const wanted = captions ? captionMode(project, { libass: hasLibass(), warn: log }) : "none";
    if (wanted !== "none" && !(srt && existsSync(srt))) log(`⚠ captions: ${wanted} requested but there is no captions.srt yet (run build-audio.mjs)`);
    const capMode = srt && existsSync(srt) ? wanted : "none";
    const args = ["-y", "-v", "error", "-i", video, "-i", mix.file];
    if (capMode === "burn") {
      const fonts = join(project.root, "assets", "fonts");
      const style = captionStyle(project.brand, settings.width, settings.height, { safe: captionSafe(project, settings.width, settings.height) });
      const vf = `subtitles='${filterPath(srt)}'${existsSync(fonts) ? `:fontsdir='${filterPath(fonts)}'` : ""}:force_style='${style}'`;
      args.push("-map", "0:v", "-map", "1:a", "-vf", vf, "-c:v", "libx264", "-profile:v", "high", "-preset", settings.preset, "-crf", String(settings.crf), "-pix_fmt", "yuv420p", "-g", String(settings.fps * 2));
    } else if (capMode === "mux") {
      args.push("-i", srt, "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:v", "copy", "-c:s", "mov_text", "-metadata:s:s:0", `language=${project.studio.meta.language}`);
    } else {
      args.push("-map", "0:v", "-map", "1:a", "-c:v", "copy");
    }
    // Not -shortest: with a muxed subtitle track it cuts the video at the last caption.
    args.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", String(dur), "-movflags", "+faststart", `${outPath}.part.mp4`);
    run("ffmpeg", args);
    copyFileSync(`${outPath}.part.mp4`, outPath);
    rmSync(`${outPath}.part.mp4`);
    // The .srt travels with the video unless the user chose no captions (a stale one is removed).
    const sideSrt = outPath.replace(/\.mp4$/, ".srt");
    if (capMode !== "none") copyFileSync(srt, sideSrt);
    else rmSync(sideSrt, { force: true });
    const final = probe(outPath);
    return { out: outPath, duration: final.duration, video: final.video, audio: final.audio, lufs: mix.silent ? null : integratedLufs(outPath), captions: capMode, sfx: mix.sfx, audioHash: manifest?.hash ?? null };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Low-res review copy at an export ratio: variant clips (cached in out/<ratio>/preview/), same audio and captions.
export function ratioPreview(dir, aspect, { captions = true, log = () => {} } = {}) {
  const project = loadProject(dir);
  if (!ASPECTS[aspect]) throw new Error(`--ratio: unknown aspect ${aspect}; use ${Object.keys(ASPECTS).join(", ")}`);
  if (aspect === project.studio.format.aspect) throw new Error(`--ratio ${aspect} is the main ratio: run concat-and-mix.mjs --preview without --ratio`);
  const { clips, settings } = renderRatioClips(project, aspect, { mode: "preview", log });
  const out = outputPath(project, "preview").replace(/\.mp4$/, `-${ratioTag(aspect)}.mp4`);
  return { ...assemble(project, clips, settings, out, { captions, log }), scenes: clips.length };
}

export function concatAndMix(dir, { mode = "final", captions = true, log = () => {} } = {}) {
  const project = loadProject(dir);
  const plan = planRender(project, { mode });
  const missing = plan.filter((p) => p.action !== "cached");
  if (missing.length) {
    throw new Error(`Scenes without a ${mode} clip for their current version: ${missing.map((p) => p.scene.id).join(", ")}.\nRun render-changed-scenes.mjs${mode === "preview" ? " --preview" : ""} first.`);
  }
  const settings = encodeSettings(project.studio, mode);
  const clips = plan.map((p) => join(project.root, p.clip));
  const r = assemble(project, clips, settings, outputPath(project, mode), { captions, log });
  project.studio.outputs ??= {};
  project.studio.outputs[mode] = { path: relative(project.root, r.out), hash: gateInputHash(project, { id: mode === "preview" ? "preview" : "render" }), at: now(), duration: Math.round(r.duration * 1000) / 1000 };
  if (mode === "final" && project.brand) project.studio.brand.version = project.brand.version;
  project.save();
  writeFileSync(r.out.replace(/\.mp4$/, ".json"), JSON.stringify({ scenes: plan.map((p) => ({ id: p.scene.id, hash: p.hash, clip: p.clip })), audio: r.audioHash, captions: r.captions, lufs: r.lufs }, null, 2) + "\n");
  return { ...r, scenes: plan.length };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["preview", "no-captions", "help"], options: ["ratio"] });
    const dir = args._[0];
    if (args.help || !dir) {
      console.log("usage: concat-and-mix.mjs <project-dir> [--preview [--ratio 9:16]] [--no-captions]");
      process.exit(dir ? 0 : 1);
    }
    if (args.ratio && !args.preview) throw new Error("--ratio needs --preview (full-size export ratios come from publish.mjs)");
    const r = args.ratio
      ? ratioPreview(dir, args.ratio, { captions: !args["no-captions"], log: console.log })
      : concatAndMix(dir, { mode: args.preview ? "preview" : "final", captions: !args["no-captions"], log: console.log });
    console.log(`✓ ${r.out}`);
    console.log(`  ${r.scenes} scenes, ${r.duration.toFixed(2)}s, ${r.video.width}x${r.video.height}@${r.video.fps}, captions: ${r.captions}${r.sfx ? `, ${r.sfx} sfx` : ""}${r.lufs != null ? `, loudness ${r.lufs} LUFS` : ""}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
