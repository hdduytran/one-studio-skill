import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, test } from "node:test";
import { readJson, run, tmp } from "./helpers.mjs";
import { FPS, makeFixtures, SEGMENTS, SILENCE } from "./fixtures/style/make-style-fixtures.mjs";

const S = "plugins/one-studio/skills/one-studio/scripts/lib";
const color = await import(`../${S}/color.mjs`);
const metrics = await import(`../${S}/style-metrics.mjs`);
const palette = await import(`../${S}/style-palette.mjs`);
const subs = await import(`../${S}/style-subs.mjs`);

// ---- colour maths

test("deltaE2000: identical colours are 0, red vs green is large, near greys are small", () => {
  assert.equal(color.deltaE2000("#336699", "#336699"), 0);
  assert.ok(Math.abs(color.deltaE2000("#ff0000", "#00ff00") - 86.6) < 0.5);
  assert.ok(color.deltaE2000("#808080", "#828282") < 2);
});

test("OKLab round trip and WCAG contrast", () => {
  for (const hex of ["#d62828", "#1d3557", "#f4d35e", "#000000", "#ffffff"]) {
    assert.equal(color.rgbToHex(color.oklabToRgb(color.rgbToOklab(color.hexToRgb(hex)))), hex);
    assert.equal(color.oklchToHex(color.hexToOklch(hex)), hex);
  }
  assert.ok(Math.abs(color.contrastRatio("#000000", "#ffffff") - 21) < 1e-9);
  assert.equal(color.contrastRatio("#777777", "#777777"), 1);
  assert.throws(() => color.hexToRgb("nope"), /invalid hex/);
});

// ---- palette

const flat = (rgb, n) => Array.from({ length: n }, () => ({ lab: color.rgbToOklab(rgb), border: true }));

test("palette is deterministic and recovers flat colours with weights", () => {
  const px = [...flat([214, 40, 40], 600), ...flat([29, 53, 87], 300), ...flat([244, 211, 94], 100)];
  const a = palette.extractPalette(px);
  assert.deepEqual(a, palette.extractPalette(px));
  assert.deepEqual(a.palette.map((c) => c.hex), ["#d62828", "#1d3557", "#f4d35e"]);
  assert.deepEqual(a.palette.map((c) => c.weight), [0.6, 0.3, 0.1]);
  assert.equal(a.palette[0].bg, true);
});

test("framePixels drops the caption band and the TikTok corners", () => {
  const [w, h] = [20, 20];
  const buf = Buffer.alloc(w * h * 3, 128);
  assert.equal(palette.framePixels(buf, w, h).length, w * Math.floor(h * 0.82));
  assert.ok(palette.framePixels(buf, w, h, { platform: "tiktok" }).length < palette.framePixels(buf, w, h).length);
});

// ---- timeline, motion, audio parsing

const frame = (t, over = {}) => ({ t, score: 0, mafd: 0, cut: false, yavg: 100, sat: 20, ylow: 50, yhigh: 150, ...over });

test("buildTimeline: cuts become shots; a cut inside a black fade collapses to one boundary", () => {
  const frames = Array.from({ length: 300 }, (_, i) => frame(i / 30));
  for (const t of [2, 5.1, 5.5, 7]) Object.assign(frames[Math.round(t * 30)], { cut: true, score: 40 });
  const tl = metrics.buildTimeline(frames, { duration: 10, threshold: 10, black: [{ start: 5, end: 5.5 }] });
  assert.deepEqual(tl.cuts.map((c) => c.t), [2, 5.25, 7]);
  assert.equal(tl.shots.length, 4);
  assert.equal(tl.fades[0].kind, "through");
  assert.equal(tl.asl, 2.5);
  assert.equal(tl.shot_hist["2-4s"], 3);
});

test("buildTimeline: scores just under the threshold lower the confidence", () => {
  const frames = Array.from({ length: 300 }, (_, i) => frame(i / 30));
  for (const i of [60, 120, 180]) frames[i].score = 8;
  frames[240] = frame(8, { cut: true, score: 30 });
  assert.equal(metrics.buildTimeline(frames, { duration: 10, threshold: 10 }).asl_confidence, "low");
});

test("motionStats classifies by mean energy and reads where the energy sits in a shot", () => {
  const mk = (f) => Array.from({ length: 90 }, (_, i) => frame(i / 30, { mafd: f(i) }));
  const shots = [{ start: 0, end: 3 }];
  assert.equal(metrics.motionStats(mk(() => 0.5), shots).class, "static");
  assert.equal(metrics.motionStats(mk(() => 4), shots).class, "drift");
  assert.equal(metrics.motionStats(mk(() => 9), shots).class, "kinetic");
  assert.equal(metrics.motionStats(mk((i) => (i < 30 ? 12 : 1)), shots).profile, "front-loaded");
  assert.equal(metrics.motionStats(mk((i) => (i < 60 ? 1 : 12)), shots).profile, "back-loaded");
});

test("parseAudio reads loudness and closes a silence that runs to the end", () => {
  const log = "[silencedetect] silence_start: 8\n[silencedetect] silence_end: 10 | silence_duration: 2\n[silencedetect] silence_start: 12\n  Summary:\n    I:         -21.8 LUFS\n    LRA:         4.8 LU\n";
  const a = metrics.parseAudio(log, 13);
  assert.equal(a.lufs, -21.8);
  assert.equal(a.lra, 4.8);
  assert.equal(a.silence_ratio, +(3 / 13).toFixed(3));
  assert.equal(a.pause_mean, 2);
});

test("parseFrameMetadata reads scene, tone and crop keys per frame", () => {
  const f = metrics.parseFrameMetadata("frame:0    pts:0       pts_time:0\nlavfi.scd.mafd=1.5\nlavfi.scd.score=14.0\nlavfi.scd.time=2\nlavfi.signalstats.YAVG=95\nlavfi.cropdetect.w=320\nlavfi.cropdetect.h=176\n");
  assert.deepEqual([f[0].mafd, f[0].score, f[0].cut, f[0].yavg, f[0].cropW, f[0].cropH], [1.5, 14, true, 95, 320, 176]);
});

// ---- subtitles

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
<c>Xin chào</c> các bạn.

00:00:02.000 --> 00:00:02.010
Xin chào các bạn.

00:00:02.010 --> 00:00:04.000
Xin chào các bạn.
hôm nay mình nói về tiền.

00:00:04.000 --> 00:00:04.010
hôm nay mình nói về tiền.

00:00:04.010 --> 00:00:06.000
hôm nay mình nói về tiền.
Rất đơn giản thôi.
`;

test("speechStats ignores rolling auto-caption duplicates", () => {
  const s = subs.speechStats(subs.parseVtt(VTT));
  assert.equal(s.words, 14);
  assert.equal(s.words_per_minute, 140);
  assert.equal(s.sentence_words_mean, 4.7);
  assert.equal(s.hook_text, "Xin chào các bạn. hôm nay mình nói về tiền.");
  assert.equal(subs.speechStats([]).words_per_minute, null);
});

// ---- end to end on generated clips

let dir;
let fx;
const analyzeOf = (slug, ...args) => {
  const r = run("style-analyze.mjs", dir, slug, ...args);
  assert.equal(r.code, 0, r.err);
  return readJson(join(dir, "style-refs", slug, "metrics.json"));
};
const seed = (slug, file, extra = {}) => {
  mkdirSync(join(dir, "style-refs", slug), { recursive: true });
  copyFileSync(file, join(dir, "style-refs", slug, "source.mp4"));
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, "style-refs", slug, name), text);
};

before(() => {
  dir = tmp();
  fx = makeFixtures(join(dir, "fx"));
  seed("cuts", fx.cuts, { "subs.vtt": VTT, "info.json": JSON.stringify({ platform: "youtube" }) });
  seed("motion", fx.motion);
  seed("still", fx.still);
});

test("analyze: cuts, ASL, palette, fade, silence and sheets on a clip with known content", () => {
  const m = analyzeOf("cuts");
  const frameT = 1 / FPS;
  const want = [2, 5.25, 7.5, 10];
  assert.equal(m.pacing.cuts.length, want.length);
  m.pacing.cuts.forEach((c, i) => assert.ok(Math.abs(c.t - want[i]) <= frameT + 1e-6, `cut ${i}: ${c.t} vs ${want[i]}`));
  assert.equal(m.pacing.shots.length, 5);
  assert.ok(Math.abs(m.pacing.asl - 13 / 5) < 0.05);
  assert.equal(m.pacing.fades.length, 1);
  assert.equal(m.pacing.fades[0].kind, "through");
  const expected = SEGMENTS.filter((s) => s.color !== "0x000000").map((s) => "#" + s.color.slice(2));
  for (const hex of expected) {
    const best = Math.min(...m.color.palette.map((c) => color.deltaE2000(hex, c.hex)));
    assert.ok(best <= 3, `${hex} missing from palette (closest ΔE ${best.toFixed(1)})`);
  }
  assert.ok(Math.abs(m.audio.silence_ratio - (SILENCE.to - SILENCE.from) / 13) <= 0.05);
  assert.equal(m.audio.has_audio, true);
  assert.equal(m.speech.words_per_minute, 140);
  assert.equal(m.speech.has_voice_source, "subs");
  assert.equal(m.params.platform, "youtube");
  assert.equal(m.format.aspect, "16:9");
  assert.ok(m.summary.length <= 40 && m.summary.every((l) => typeof l === "string"));
  for (const f of [m.sheets.frames.file, m.sheets.cuts.file]) assert.ok(existsSync(join(dir, f)), f);
  assert.ok(existsSync(join(dir, "style-refs", "cuts", "frames", "frame-01.jpg")));
});

test("analyze: motion clip is kinetic, flat clip is static with a single colour", () => {
  assert.equal(analyzeOf("motion").motion.class, "kinetic");
  const still = analyzeOf("still");
  assert.equal(still.motion.class, "static");
  assert.equal(still.audio.has_audio, false);
  assert.equal(still.color.palette.length, 1);
  assert.equal(still.pacing.shots.length, 1);
});

test("analyze: same input gives identical metrics apart from the timestamp", () => {
  const strip = (m) => ({ ...m, generated_at: null });
  const first = strip(analyzeOf("cuts"));
  assert.deepEqual(strip(analyzeOf("cuts")), first);
});

test("analyze: input errors and bad flags exit non-zero with a message", () => {
  const missing = run("style-analyze.mjs", dir, "no-such-style");
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No source video/);
  assert.equal(run("style-analyze.mjs", dir, "still", "--threshold", "0").code, 1);
});
