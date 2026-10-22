// Pure measurement logic for style analysis: parsing FFmpeg metadata/log output, cut and shot
// timeline, motion classes, audio figures and the short summary. No process or file access here.

const num = (v) => (v === undefined ? NaN : Number(v));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (v, d = 3) => +v.toFixed(d);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// metadata=print output -> one record per decoded frame.
export function parseFrameMetadata(text) {
  const frames = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const f = /^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(line);
    if (f) {
      cur = { t: Number(f[1]), score: 0, mafd: 0, cut: false, yavg: NaN, sat: NaN, ylow: NaN, yhigh: NaN, cropW: NaN, cropH: NaN, x: 0 };
      frames.push(cur);
      continue;
    }
    const kv = cur && /^lavfi\.([\w.]+)=(.*)$/.exec(line);
    if (!kv) continue;
    const [, k, v] = kv;
    if (k === "scd.score") cur.score = num(v);
    else if (k === "scd.mafd") cur.mafd = num(v);
    else if (k === "scd.time") cur.cut = true;
    else if (k === "signalstats.YAVG") cur.yavg = num(v);
    else if (k === "signalstats.SATAVG") cur.sat = num(v);
    else if (k === "signalstats.YLOW") cur.ylow = num(v);
    else if (k === "signalstats.YHIGH") cur.yhigh = num(v);
    else if (k === "cropdetect.w") cur.cropW = num(v);
    else if (k === "cropdetect.h") cur.cropH = num(v);
  }
  return frames;
}

// blackdetect log lines -> [{start, end}].
export function parseBlack(log) {
  return [...log.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
}

// ebur128 summary + silencedetect log -> loudness and silence figures.
export function parseAudio(log, duration) {
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const lufs = /I:\s+(-?[\d.]+)\s+LUFS/.exec(summary);
  const lra = /LRA:\s+(-?[\d.]+)\s+LU/.exec(summary);
  const spans = [];
  let open = null;
  for (const m of log.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === "start") open = Math.max(0, Number(m[2]));
    else if (open !== null) spans.push([open, Math.min(duration, Number(m[2]))]), (open = null);
  }
  if (open !== null) spans.push([open, duration]);
  const total = spans.reduce((a, [s, e]) => a + Math.max(0, e - s), 0);
  const inner = spans.filter(([s, e]) => s > 0.05 && e < duration - 0.05);
  return {
    lufs: lufs ? Number(lufs[1]) : null,
    lra: lra ? Number(lra[1]) : null,
    silence_ratio: duration > 0 ? round(Math.min(1, total / duration)) : 0,
    pause_mean: inner.length ? round(mean(inner.map(([s, e]) => e - s))) : 0,
  };
}

// Shots from scene-change frames. A cut that falls inside a black interval (a fade through black) collapses
// into one boundary at the middle of the fade; black touching the first or last frame is only a fade in/out.
export function buildTimeline(frames, { duration, threshold, black = [], fps = 30 }) {
  const gap = 4 / fps;
  const raw = frames.filter((f) => f.cut && f.score >= threshold && f.t > gap && f.t < duration - gap).map((f) => ({ t: f.t, score: f.score }));
  const fades = black.map((b) => ({ start: round(b.start), end: round(b.end), kind: b.start < 0.05 ? "in" : b.end >= duration - 0.05 ? "out" : "through" }));
  const inFade = (t) => black.some((b) => t >= b.start - gap && t <= b.end + gap);
  const cuts = raw.filter((c) => !inFade(c.t));
  for (const b of black) if (b.start >= 0.05 && b.end < duration - 0.05) cuts.push({ t: (b.start + b.end) / 2, score: Math.max(0, ...raw.filter((c) => c.t >= b.start - gap && c.t <= b.end + gap).map((c) => c.score)) });
  cuts.sort((a, b) => a.t - b.t);
  const edges = [0, ...cuts.map((c) => c.t), duration];
  const shots = edges.slice(1).map((end, i) => ({ start: round(edges[i]), end: round(end) }));
  const lens = shots.map((s) => s.end - s.start);
  // Scores just under the threshold mean cuts may have been missed: report how shaky the pacing is.
  const near = frames.filter((f) => !f.cut && f.score >= threshold * 0.6 && f.score < threshold).length;
  const confidence = near > 0 && near / (cuts.length + near) > 0.3 ? "low" : "high";
  const hist = { "<1s": 0, "1-2s": 0, "2-4s": 0, "4-8s": 0, ">8s": 0 };
  for (const l of lens) hist[l < 1 ? "<1s" : l < 2 ? "1-2s" : l < 4 ? "2-4s" : l < 8 ? "4-8s" : ">8s"]++;
  return {
    cuts: cuts.map((c) => ({ t: round(c.t), score: round(c.score, 2) })),
    shots,
    fades,
    asl: round(mean(lens)),
    median_shot: round(median(lens)),
    cuts_per_min: duration > 0 ? round((cuts.length / duration) * 60, 1) : 0,
    shot_hist: hist,
    asl_confidence: confidence,
  };
}

// Motion energy from per-frame mean absolute difference (cut frames excluded), grouped by shot.
export function motionStats(frames, shots) {
  const energy = (f) => (f.cut ? null : f.mafd);
  const all = frames.map(energy).filter((v) => v !== null);
  const m = mean(all);
  let early = 0;
  let late = 0;
  for (const s of shots) {
    const v = frames.filter((f) => f.t >= s.start && f.t < s.end).map(energy).filter((x) => x !== null);
    if (v.length < 6) continue;
    const third = Math.floor(v.length / 3);
    early += mean(v.slice(0, third));
    late += mean(v.slice(-third));
  }
  const profile = early + late < 0.5 ? "even" : early > late * 1.25 ? "front-loaded" : late > early * 1.25 ? "back-loaded" : "even";
  return { mean: round(m), class: m < 2 ? "static" : m < 6 ? "drift" : "kinetic", profile };
}

export function toneStats(frames) {
  const ok = frames.filter((f) => Number.isFinite(f.yavg));
  const spread = ok.filter((f) => Number.isFinite(f.ylow) && Number.isFinite(f.yhigh)).map((f) => (f.yhigh - f.ylow) / 255);
  return { luma_mean: round(mean(ok.map((f) => f.yavg)) / 255), sat_mean: round(mean(ok.map((f) => f.sat)) / 255), contrast: round(mean(spread)) };
}

// Letterbox when the detected picture area is clearly smaller than the frame (tolerance for rounding).
export function letterbox(frames, scaled) {
  const last = [...frames].reverse().find((f) => Number.isFinite(f.cropW));
  if (!last) return null;
  const bars = last.cropH < scaled.h * 0.94 || last.cropW < scaled.w * 0.94;
  return { detected: bars, picture_aspect: round(last.cropW / last.cropH, 2) };
}

// <= 40 short lines for the reader step to load instead of the whole file.
export function summarize(m) {
  const p = (m.color.palette ?? []).slice(0, 6).map((c) => `${c.hex}${c.bg ? "(bg)" : ""} ${Math.round(c.weight * 100)}%`).join(", ");
  return [
    `format: ${m.format.width}x${m.format.height} (${m.format.aspect}) ${m.format.fps}fps ${m.format.duration}s${m.format.letterbox?.detected ? " letterboxed" : ""}`,
    `pacing: ${m.pacing.shots.length} shots, ASL ${m.pacing.asl}s (median ${m.pacing.median_shot}s), ${m.pacing.cuts_per_min} cuts/min, confidence ${m.pacing.asl_confidence}`,
    `shot histogram: ${Object.entries(m.pacing.shot_hist).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    `fades: ${m.pacing.fades.length ? m.pacing.fades.map((f) => `${f.kind}@${f.start}s`).join(", ") : "none"}`,
    `palette: ${p || "n/a"}`,
    `bg luma ${m.color.bg_luma}, saturation ${m.color.saturation}; frame luma ${m.tone.luma_mean}, sat ${m.tone.sat_mean}, contrast ${m.tone.contrast}`,
    `motion: ${m.motion.class} (mean ${m.motion.mean}), ${m.motion.profile}`,
    m.audio.has_audio ? `audio: ${m.audio.lufs} LUFS, LRA ${m.audio.lra}, silence ${Math.round(m.audio.silence_ratio * 100)}%, pause ${m.audio.pause_mean}s` : "audio: none",
    `speech: voice ${m.speech.has_voice ? "yes" : "no"} (${m.speech.has_voice_source}), ${m.speech.words_per_minute ?? "n/a"} wpm, ${m.speech.sentence_words_mean ?? "n/a"} words/sentence`,
    ...(m.speech.hook_text ? [`hook: ${m.speech.hook_text.slice(0, 160)}`] : []),
  ];
}
