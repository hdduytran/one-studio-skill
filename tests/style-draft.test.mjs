import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, test } from "node:test";
import { readJson, run, tmp, writeJson } from "./helpers.mjs";
import { makeFixtures } from "./fixtures/style/make-style-fixtures.mjs";

const S = "plugins/one-studio/skills/one-studio";
const REFS = "plugins/one-studio/skills/style-extract";
const roles = await import(`../${S}/scripts/lib/style-color-roles.mjs`);
const map = await import(`../${S}/scripts/lib/style-map.mjs`);
const refs = await import(`../${S}/scripts/lib/style-refs.mjs`);
const music = await import(`../${S}/scripts/lib/music.mjs`);
const color = await import(`../${S}/scripts/lib/color.mjs`);

// ---- colour roles

const cluster = (hex, weight, bg = false) => {
  const { L, C, h } = color.hexToOklch(hex);
  return { hex, weight, L: +L.toFixed(3), C: +C.toFixed(3), h: +h.toFixed(1), bg };
};

test("roles: light page, black ink and one red accent", () => {
  const r = roles.assignColorRoles([cluster("#f5f4ef", 0.8, true), cluster("#1c1e22", 0.15), cluster("#d7262e", 0.05)]);
  assert.deepEqual([r.colors.bg, r.colors.fg, r.colors.primary], ["#f5f4ef", "#1c1e22", "#d7262e"]);
  assert.equal(r.colors.secondary, undefined);
  assert.match(r.notes.join(" "), /secondary, accent/);
  assert.ok(Object.values(r.sources).every((s) => s.source === "measured"));
});

test("roles: dark neon palette", () => {
  const r = roles.assignColorRoles([cluster("#070b08", 0.7, true), cluster("#d9ffe0", 0.1), cluster("#39ff7a", 0.1), cluster("#ff3fd8", 0.06), cluster("#00e5ff", 0.04)]);
  assert.equal(r.colors.bg, "#070b08");
  assert.equal(r.colors.fg, "#d9ffe0");
  assert.deepEqual([r.colors.primary, r.colors.secondary, r.colors.accent], ["#39ff7a", "#ff3fd8", "#00e5ff"]);
});

test("roles: look-alike accents collapse, a mid grey becomes muted, dust is ignored", () => {
  const r = roles.assignColorRoles([cluster("#ffffff", 0.6, true), cluster("#111111", 0.2), cluster("#e30613", 0.1), cluster("#e50a16", 0.05), cluster("#808080", 0.04), cluster("#00ff00", 0.002)]);
  assert.equal(r.colors.primary, "#e30613");
  assert.equal(r.colors.secondary, undefined);
  assert.equal(r.colors.muted, "#808080");
});

test("roles: near-monochrome palette falls back to a guessed black or white foreground", () => {
  const r = roles.assignColorRoles([cluster("#336699", 1, true)]);
  assert.deepEqual(r.colors, { bg: "#336699", fg: "#f5f5f5" });
  assert.equal(r.sources.fg.source, "guessed");
  assert.deepEqual(roles.assignColorRoles([]).colors, {});
});

// ---- tables

const metricsOf = (over = {}) => ({
  generated_at: "2026-01-01T00:00:00.000Z",
  source: { file: "source.mp4" },
  format: { width: 1920, height: 1080, aspect: "16:9", fps: 30, duration: 60 },
  pacing: { cuts: [{ t: 3, score: 30 }], shots: [{ start: 0, end: 3 }, { start: 3, end: 6 }], fades: [], asl: 3, median_shot: 3, cuts_per_min: 10, asl_confidence: "high" },
  color: { palette: [cluster("#fbfbfd", 0.9, true), cluster("#1d1d1f", 0.1)], bg_luma: 0.99, saturation: 0 },
  tone: { luma_mean: 0.5, sat_mean: 0.1, contrast: 0.4 },
  motion: { mean: 3, class: "drift", profile: "even" },
  audio: { has_audio: true, lufs: -16, lra: 5, silence_ratio: 0.1, pause_mean: 0.4 },
  speech: { has_voice: true, has_voice_source: "subs", words_per_minute: 150, sentence_words_mean: 8, hook_text: "x" },
  ...over,
});
const withAsl = (asl) => {
  const m = metricsOf();
  m.pacing = { ...m.pacing, asl, shots: [{ start: 0, end: asl }, { start: asl, end: asl * 2 }] };
  return map.buildDraft(m, {}, { slug: "t" }).style;
};

test("ASL -> motion durations at each threshold", () => {
  assert.equal(withAsl(1.19).brand.motion.duration.base, 0.3);
  assert.equal(withAsl(1.2).brand.motion.duration.base, 0.5);
  assert.equal(withAsl(3).brand.motion.duration.base, 0.5);
  assert.equal(withAsl(3.1).brand.motion.duration.base, 0.8);
});

test("ease follows the profile, stagger the motion class", () => {
  const d = (profile, cls) => map.buildDraft(metricsOf({ motion: { mean: 1, class: cls, profile } }), {}, { slug: "t" }).style.brand.motion;
  assert.equal(d("front-loaded", "kinetic").ease.out, "expo.out");
  assert.equal(d("even", "static").ease.out, "sine.out");
  assert.equal(d("back-loaded", "drift").ease.in, "power3.in");
  assert.deepEqual(["static", "drift", "kinetic"].map((c) => d("even", c).stagger), [0.12, 0.08, 0.04]);
});

test("sfx density by cuts per minute; none without audio", () => {
  const dens = (cpm, has_audio = true) => {
    const m = metricsOf({ audio: { ...metricsOf().audio, has_audio } });
    m.pacing.cuts_per_min = cpm;
    return map.buildDraft(m, {}, { slug: "t" }).style.storyboard.sfx_density;
  };
  assert.deepEqual([2.9, 3, 11.9, 12, 29.9, 30].map((c) => dens(c)), ["none", "low", "low", "medium", "medium", "high"]);
  assert.equal(dens(40, false), "none");
});

test("bed: every pick is a real built-in bed and follows energy and brightness", () => {
  const bed = (motionClass, cutsPerMin, lumaMean) => map.pickBed({ motionClass, cutsPerMin, lumaMean });
  assert.equal(bed("static", 2, 0.5).name, "ambient");
  assert.equal(bed("static", 2, 0.7).name, "ambient-bright");
  assert.equal(bed("drift", 5, 0.2).name, "ambient");
  assert.equal(bed("drift", 6, 0.5).name, "lofi");
  assert.equal(bed("drift", 6, 0.2).name, "lofi-dark");
  assert.equal(bed("kinetic", 40, 0.9).name, "lofi");
  for (const name of ["ambient", "ambient-bright", "lofi", "lofi-dark"]) {
    const b = bed(name.startsWith("lofi") ? "kinetic" : "static", 0, name.includes("bright") ? 0.9 : name === "lofi-dark" ? 0.1 : 0.5);
    assert.deepEqual({ preset: b.music.preset, mood: b.music.mood }, music.BUILTIN_BEDS[b.name]);
    assert.equal(b.music.bpm, music.PRESETS[b.music.preset].bpm);
  }
});

test("format: short-vertical only for 9:16 under 90 s", () => {
  const f = (aspect, duration) => map.buildDraft(metricsOf({ format: { ...metricsOf().format, aspect, duration } }), {}, { slug: "t" }).style.writing?.format;
  assert.equal(f("9:16", 45), "short-vertical");
  assert.equal(f("9:16", 90), undefined);
  assert.equal(f("16:9", 45), undefined);
});

test("a draft is valid, accounts for every field, and a video without cuts degrades to guesses", () => {
  const ok = map.buildDraft(metricsOf(), { url: "https://youtu.be/x", title: "T", channel: "C", file: "source.mp4", accessed: "2026-02-02", range: { from: 0, to: 60 }, platform: "youtube", subs: true }, { slug: "t" }).style;
  assert.deepEqual(refs.styleErrors(ok, { slug: "t" }), []);
  assert.deepEqual(Object.keys(ok.reference).sort(), ["accessed", "channel", "file", "range", "title", "url"]);

  const one = metricsOf({
    pacing: { cuts: [], shots: [{ start: 0, end: 12 }], fades: [], asl: 12, median_shot: 12, cuts_per_min: 0, asl_confidence: "low" },
    color: { palette: [cluster("#336699", 1, true)], bg_luma: 0.4, saturation: 0.1 },
    audio: { has_audio: false, lufs: null, lra: null, silence_ratio: 0, pause_mean: 0 },
    speech: { has_voice: false, has_voice_source: "heuristic", words_per_minute: null, sentence_words_mean: null, hook_text: "" },
  });
  const { style } = map.buildDraft(one, {}, { slug: "t" });
  assert.deepEqual(refs.styleErrors(style, { slug: "t" }), []);
  assert.equal(style.storyboard.target_shot_seconds, 4);
  assert.equal(style.audio.lufs, undefined);
  assert.equal(style.writing, undefined);
  for (const p of ["storyboard.target_shot_seconds", "brand.transitions.default", "brand.motion.duration", "brand.colors.fg"]) assert.equal(style.provenance[p].source, "guessed", p);
  const open = map.remainingFields(style).map((o) => o.path);
  assert.ok(open.includes("brand.surface") && open.includes("brand.colors.primary") && open.includes("brand.transitions.default"));
});

test("remainingFields: filled fields drop out of the list, guessed ones stay", () => {
  const { style } = map.buildDraft(metricsOf(), {}, { slug: "t" });
  assert.ok(map.remainingFields(style).some((o) => o.path === "brand.surface" && o.state === "missing"));
  style.brand.surface = "flat";
  style.provenance["brand.surface"] = { source: "seen" };
  assert.ok(!map.remainingFields(style).some((o) => o.path === "brand.surface"));
});

// ---- reference docs

test("font map: valid Fontsource specs, pins agree with the brand presets and the plugin cache rule", () => {
  const rows = readFileSync(`${REFS}/references/font-map.md`, "utf8").split("\n").filter((l) => /^\| .*`[a-z0-9-]+@[^`]+`/.test(l));
  assert.ok(rows.length >= 8);
  const presets = JSON.stringify(readJson(`${S}/templates/brand-presets.json`)) + JSON.stringify(readJson(`${S}/templates/brand.json`));
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim());
    const spec = /`([^`]+)`/.exec(cells[3])[1];
    const [name, pin] = spec.split("@");
    assert.ok(["verified", "unverified"].includes(cells[4]), row);
    if (pin === "-") {
      assert.equal(cells[4], "unverified", `${spec} cannot be verified without a pin`);
      continue;
    }
    assert.match(spec, /^[a-z0-9-]+@\d+\.\d+\.\d+$/);
    const used = [...presets.matchAll(new RegExp(`"fontsource":\\s*"${name}@([^"]+)"`, "g"))].map((m) => m[1]);
    for (const v of used) assert.equal(v, pin, `${name} pin differs from brand presets`);
  }
});

test("context budgets: reading guide <= 80 lines, STYLE.md template <= 60 lines", () => {
  const lines = (p) => readFileSync(`${REFS}/${p}`, "utf8").trimEnd().split("\n").length;
  assert.ok(lines("references/reading-guide.md") <= 80);
  assert.ok(lines("templates/STYLE.md") <= 60);
  assert.match(readFileSync(`${REFS}/references/reading-guide.md`, "utf8"), /cells/);
});

// ---- CLI on analysed fixtures

let dir;
before(() => {
  dir = tmp();
  const fx = makeFixtures(join(dir, "fx"));
  for (const [slug, file] of [["cuts", fx.cuts], ["still", fx.still]]) {
    mkdirSync(join(dir, "style-refs", slug), { recursive: true });
    copyFileSync(file, join(dir, "style-refs", slug, "source.mp4"));
    assert.equal(run("style-analyze.mjs", dir, slug).code, 0);
  }
  writeJson(join(dir, "style-refs", "cuts", "info.json"), { file: "source.mp4", title: "Fixture", accessed: "2026-03-03", range: { from: 0, to: 13 }, platform: "other", duration: 13, subs: false, keep: false });
});

test("style-draft on analysed fixtures writes a valid card; --check lists what is left", () => {
  const r = run("style-draft.mjs", dir, "cuts");
  assert.equal(r.code, 0, r.err);
  const style = readJson(join(dir, "style-refs", "cuts", "style.json"));
  assert.deepEqual(refs.styleErrors(style, { slug: "cuts" }), []);
  assert.equal(style.reference.title, "Fixture");
  assert.equal(style.brand.transitions.default, "fade");
  assert.match(r.out, /MISSING brand\.surface/);

  const c = run("style-draft.mjs", dir, "cuts", "--check");
  assert.equal(c.code, 0, c.err);
  assert.match(c.out, /MISSING brand\.typography\.heading/);
  assert.match(c.out, /still to fill/);
});

test("style-draft: a one-shot video still gets a valid card; existing cards are protected", () => {
  const r = run("style-draft.mjs", dir, "still");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(refs.styleErrors(readJson(join(dir, "style-refs", "still", "style.json")), { slug: "still" }), []);
  assert.match(r.out, /GUESSED brand\.transitions\.default/);
  const again = run("style-draft.mjs", dir, "still");
  assert.equal(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.equal(run("style-draft.mjs", dir, "still", "--force").code, 0);
});

test("style-draft --check reports schema and provenance errors; missing inputs exit 1", () => {
  const file = join(dir, "style-refs", "cuts", "style.json");
  const style = readJson(file);
  style.brand.surface = "flat";
  writeFileSync(file, JSON.stringify(style));
  const c = run("style-draft.mjs", dir, "cuts", "--check");
  assert.equal(c.code, 1);
  assert.match(c.out, /ERROR .*brand\.surface/);
  assert.equal(run("style-draft.mjs", dir, "nope").code, 1);
  assert.match(run("style-draft.mjs", dir, "nope", "--check").err, /No style/);
});
