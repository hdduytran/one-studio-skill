#!/usr/bin/env node
// Measure a reference video with FFmpeg: pacing, colour, motion, audio, speech, plus two contact sheets.
//   node style-analyze.mjs <project-dir> <slug> [--threshold 10] [--frames 12] [--cuts 6]
// Reads style-refs/<slug>/source.<ext> (+ info.json, subs.vtt). Writes metrics.json, frames/*.jpg and
// review/style-<slug>-frames.jpg, review/style-<slug>-cuts.jpg. Offline; the same input gives the same
// numbers (only generated_at changes). Sheets are unlabelled when FFmpeg has no drawtext: cell order is in metrics.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { hasFilter, probe } from "./lib/ffmpeg.mjs";
import { isMain, now, parseArgs, readJson, writeJson } from "./lib/project.mjs";
import { existingSlug, styleDir } from "./lib/style-refs.mjs";
import { contactSheet, findFont } from "./lib/contact-sheet.mjs";
import { audioPass, ffmpegVersion, grabJpg, grabRaw, PALETTE_WIDTH, scaledSize, videoPass } from "./lib/style-measure.mjs";
import { buildTimeline, letterbox, motionStats, parseAudio, parseBlack, parseFrameMetadata, summarize, toneStats } from "./lib/style-metrics.mjs";
import { extractPalette, framePixels, SEED } from "./lib/style-palette.mjs";
import { parseVtt, speechStats } from "./lib/style-subs.mjs";

const MAX_COLOR_SHOTS = 40;
const fmtT = (t) => `${t.toFixed(1)}s`;
const evenly = (n, k) => Array.from({ length: Math.min(n, k) }, (_, i) => Math.floor(((i + 0.5) * n) / Math.min(n, k)));
const aspectName = (w, h) => {
  const r = w / h;
  const named = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1], ["4:5", 0.8], ["4:3", 4 / 3], ["21:9", 21 / 9]].find(([, v]) => Math.abs(v - r) < 0.02);
  return named ? named[0] : r.toFixed(2);
};

export function analyze(dir, slug, { threshold = 10, frames: nFrames = 12, cuts: nCuts = 6 } = {}) {
  existingSlug(dir, slug);
  const sd = styleDir(dir, slug);
  const sourceName = existsSync(sd) ? readdirSync(sd).find((f) => /^source\./.test(f)) : null;
  if (!sourceName) throw new Error(`No source video in ${sd} (run style-fetch.mjs first)`);
  const src = join(sd, sourceName);
  const info = existsSync(join(sd, "info.json")) ? readJson(join(sd, "info.json")) : {};
  const platform = info.platform ?? "other";
  const p = probe(src);
  if (!p.video) throw new Error(`${sourceName} has no video stream`);
  const { width, height, fps } = p.video;
  const duration = +p.duration.toFixed(3);
  if (!(duration > 0)) throw new Error(`${sourceName} has no duration`);
  const skipped = [];
  const has = (name) => {
    const ok = hasFilter(name);
    if (!ok) skipped.push(name);
    return ok;
  };

  const v = videoPass(src, { duration, width, height, threshold, has });
  const frames = parseFrameMetadata(v.metadata);
  if (!frames.length) throw new Error("FFmpeg produced no frame data; is the video readable?");
  const timeline = buildTimeline(frames, { duration, threshold, black: parseBlack(v.log), fps });
  const tone = toneStats(frames);
  const motion = motionStats(frames, timeline.shots);

  // Colour: the middle frame of up to 40 shots, small, overlays masked.
  const pw = PALETTE_WIDTH;
  const ph = scaledSize(width, height, pw).h;
  const box = letterbox(frames, v.scaled);
  const rect = box?.detected && box.rect && box.rect.w * box.rect.h >= 0.1 ? box.rect : null;
  const pixels = evenly(timeline.shots.length, MAX_COLOR_SHOTS).flatMap((i) => {
    const s = timeline.shots[i];
    return framePixels(grabRaw(src, (s.start + s.end) / 2, duration, pw, ph), pw, ph, { platform, rect });
  });
  const color = extractPalette(pixels);

  const hasAudio = Boolean(p.audio);
  const audio = hasAudio ? { has_audio: true, ...parseAudio(audioPass(src, { duration, has }), duration) } : { has_audio: false, lufs: null, lra: null, silence_ratio: 0, pause_mean: 0 };
  const vttFile = join(sd, "subs.vtt");
  const cues = existsSync(vttFile) ? parseVtt(readFileSync(vttFile, "utf8")) : [];
  const stats = speechStats(cues);
  const voiceByAudio = hasAudio && audio.lufs !== null && audio.silence_ratio < 0.25 && (audio.lra ?? 99) <= 10;
  const speech = { has_voice: cues.length > 0 || voiceByAudio, has_voice_source: cues.length ? "subs" : "heuristic", words_per_minute: stats.words_per_minute, sentence_words_mean: stats.sentence_words_mean, hook_text: stats.hook_text };

  // Sheets: frames spread over the shots, and the strongest cuts with the frames around them.
  const framesDir = join(sd, "frames");
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(join(dir, "review"), { recursive: true });
  const shotAt = (t) => Math.max(0, timeline.shots.findIndex((s) => t >= s.start && t < s.end));
  const times = timeline.shots.length >= nFrames
    ? evenly(timeline.shots.length, nFrames).map((i) => (timeline.shots[i].start + timeline.shots[i].end) / 2)
    : Array.from({ length: nFrames }, (_, i) => ((i + 0.5) * duration) / nFrames);
  const cells = times.map((t, i) => ({ file: grabJpg(src, t, duration, join(framesDir, `frame-${String(i + 1).padStart(2, "0")}.jpg`)), t, label: `#${shotAt(t) + 1} ${fmtT(t)}` }));
  const cols = Math.min(4, cells.length);
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) {
    const row = cells.slice(i, i + cols);
    rows.push({ id: "", times: row.map((c) => c.t), stills: row.map((c) => c.file), labels: row.map((c) => c.label) });
  }
  const framesSheet = join(dir, "review", `style-${slug}-frames.jpg`);
  contactSheet(rows, framesSheet, { tileWidth: 360 });

  const step = 2 / fps;
  const strongest = [...timeline.cuts].sort((a, b) => b.score - a.score || a.t - b.t).slice(0, nCuts).sort((a, b) => a.t - b.t);
  const cutRows = strongest.map((c, i) => {
    const ts = [c.t - step, c.t, c.t + step];
    return { id: "", times: ts, stills: ts.map((t, j) => grabJpg(src, t, duration, join(framesDir, `cut-${String(i + 1).padStart(2, "0")}-${"abc"[j]}.jpg`), 360)), labels: [`cut ${i + 1} ${fmtT(c.t)} before`, "at cut", "after"] };
  });
  const cutsSheet = cutRows.length ? contactSheet(cutRows, join(dir, "review", `style-${slug}-cuts.jpg`), { tileWidth: 360 }) : null;

  const metrics = {
    schema_version: 1,
    generated_at: now(),
    tool_versions: { ffmpeg: ffmpegVersion() },
    params: { threshold, frames: nFrames, cuts: nCuts, platform, analysis_width: v.scaled.w, palette_seed: SEED },
    unavailable_filters: [...new Set(skipped)].sort(),
    source: { file: sourceName },
    format: { width, height, aspect: aspectName(width, height), fps: +fps.toFixed(3), duration, letterbox: box },
    pacing: timeline,
    color,
    tone,
    motion,
    audio,
    speech,
    sheets: {
      frames: { file: relative(dir, framesSheet), cols, labelled: Boolean(findFont()), cells: cells.map((c) => c.label) },
      cuts: cutsSheet ? { file: relative(dir, cutsSheet), cols: 3, labelled: Boolean(findFont()), cells: strongest.map((c, i) => `cut ${i + 1} @${fmtT(c.t)} score ${c.score}`) } : null,
    },
  };
  metrics.summary = summarize(metrics);
  writeJson(join(sd, "metrics.json"), metrics);
  return metrics;
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["threshold", "frames", "cuts"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-analyze.mjs <project-dir> <slug> [--threshold 10] [--frames 12] [--cuts 6]");
      process.exit(dir && slug ? 0 : 1);
    }
    const opt = (k, d, lo, hi) => {
      const n = Number(args[k] ?? d);
      if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`--${k} must be a number between ${lo} and ${hi}`);
      return n;
    };
    const m = analyze(dir, slug, { threshold: opt("threshold", 10, 1, 100), frames: Math.round(opt("frames", 12, 1, 24)), cuts: Math.round(opt("cuts", 6, 0, 12)) });
    console.log(m.summary.join("\n"));
    if (m.unavailable_filters.length) console.log(`· FFmpeg lacks: ${m.unavailable_filters.join(", ")} (those measures are empty)`);
    console.log(`Metrics: ${relative(process.cwd(), join(styleDir(dir, slug), "metrics.json"))}`);
    for (const s of [m.sheets.frames, m.sheets.cuts].filter(Boolean)) console.log(`Sheet: ${s.file}${s.labelled ? "" : ` (unlabelled, ${s.cols} per row in order: ${s.cells.join(" | ")})`}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
