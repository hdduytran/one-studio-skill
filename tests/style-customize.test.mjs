// Layers, enhance rules, style-set, style-diff, the blend maths and the offline editor page.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { before, test } from "node:test";
import { SCRIPTS, readJson, run, scene, tmp, writeJson } from "./helpers.mjs";
import { makeFixtures } from "./fixtures/style/make-style-fixtures.mjs";

const S = "plugins/one-studio/skills/one-studio";
const lib = (n) => import(`../${S}/scripts/lib/${n}.mjs`);
const layers = await lib("style-layers");
const refs = await lib("style-refs");
const enh = await lib("style-enhance");
const contrastLib = await lib("style-contrast");
const blend = await lib("style-blend");
const values = await lib("style-values");
const fonts = await lib("style-fonts");
const color = await lib("color");
const { loadProject } = await lib("project");
const enhance = await import(`../${S}/scripts/style-enhance.mjs`);
const set = await import(`../${S}/scripts/style-set.mjs`);
const editor = await import(`../${S}/scripts/style-editor.mjs`);
const cdp = await lib("cdp");

// Presets and fonts never touch the real cache: nothing here may need the network.
process.env.ONE_STUDIO_CACHE = tmp();

// A style card with provenance for every field; `over` replaces whole sections.
function card(slug, over = {}) {
  const style = {
    version: 1,
    slug,
    reference: { file: "source.mp4", accessed: "2026-10-22", range: { from: 0, to: 30 } },
    brand: {
      colors: { bg: "#101820", fg: "#f2f2f2", primary: "#e30613", secondary: "#2a9d8f", accent: "#f2c200", muted: "#9aa5b1" },
      surface: "flat",
      typography: { heading: { family: "Inter", weight: 800, fontsource: "inter@5.2.8", fallback: "Helvetica, Arial, sans-serif" } },
      motion: { duration: { fast: 0.2, base: 0.4, slow: 0.8 }, stagger: 0.05 },
      captions: { position: "middle", size: 52 },
    },
    storyboard: { target_shot_seconds: 5 },
    do_not_copy: [],
    ...over,
  };
  style.provenance = Object.fromEntries(["brand", "storyboard", "writing", "audio"].flatMap((k) => refs.leafPaths(style[k] ?? {}, k, []).filter((p) => p !== k)).map((p) => [p, { source: "measured" }]));
  return style;
}

function project(style = card("a"), initArgs = []) {
  // Cards are edited after card(): provenance is recomputed for whatever fields they ended up with.
  style.provenance = Object.fromEntries(["brand", "storyboard", "writing", "audio"].flatMap((k) => refs.leafPaths(style[k] ?? {}, k, []).filter((p) => p !== k)).map((p) => [p, { source: "measured" }]));
  const dir = join(tmp(), "p");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi", ...initArgs).code, 0);
  const sd = join(dir, "style-refs", style.slug);
  mkdirSync(sd, { recursive: true });
  writeJson(join(sd, "style.json"), style);
  // Staged scenes link the project's vendor folder, so nothing is fetched from npm.
  mkdirSync(join(dir, "assets", "vendor"), { recursive: true });
  for (const f of ["gsap.min.js", "howler.core.min.js"]) writeFileSync(join(dir, "assets", "vendor", f), "");
  return dir;
}
// The GSAP the machine already has (scenes only animate with it); null when the cache is empty.
function realGsap(dir) {
  const src = join(homedir(), ".cache", "one-studio", "npm", "gsap@3.14.2", "node_modules", "gsap", "dist", "gsap.min.js");
  if (!existsSync(src)) return false;
  copyFileSync(src, join(dir, "assets", "vendor", "gsap.min.js"));
  return true;
}
const proposals = (dir, slug = "a") => enh.proposeEnhancements(enh.enhanceContext(loadProject(dir), slug));
const ids = (dir, slug) => proposals(dir, slug).map((p) => p.id);
function accept(dir, id, slug = "a") {
  const project = loadProject(dir);
  const ctx = enh.enhanceContext(project, slug);
  const picked = enh.proposeEnhancements(ctx).filter((p) => p.id === id);
  assert.equal(picked.length, 1, `${id} is proposed`);
  return enhance.acceptProposals(project, ctx, picked);
}
const effective = (dir, slug = "a", variant) => layers.effectiveStyle(loadProject(dir), slug, variant);
const mergedColors = (dir, variant) => ({ ...loadProject(dir).brand.colors, ...effective(dir, "a", variant).brand.colors });
const custom = (dir, slug = "a") => join(dir, "style-refs", slug, "style.custom.json");

// ---- layers

test("layers: custom wins over enhance wins over the extracted card; a variant sits on top", () => {
  const dir = project();
  const sd = join(dir, "style-refs", "a");
  writeJson(join(sd, "style.enhance.json"), { brand: { colors: { accent: "#111111", muted: "#222222" } }, provenance: { "brand.colors.accent": { source: "guessed", note: "enhance:x" }, "brand.colors.muted": { source: "guessed", note: "enhance:x" } } });
  writeJson(custom(dir), { brand: { colors: { accent: "#333333" } }, provenance: { "brand.colors.accent": { source: "seen" } } });
  mkdirSync(join(sd, "variants"), { recursive: true });
  writeJson(join(sd, "variants", "light.json"), { brand: { colors: { bg: "#ffffff" } }, provenance: { "brand.colors.bg": { source: "seen" } } });
  const e = effective(dir);
  assert.equal(e.brand.colors.accent, "#333333");
  assert.equal(e.brand.colors.muted, "#222222");
  assert.equal(e.brand.colors.primary, "#e30613", "absent in every layer: extracted value");
  assert.deepEqual(e.provenance["brand.colors.accent"], { source: "seen" });
  assert.equal(effective(dir, "a", "light").brand.colors.bg, "#ffffff");
  assert.equal(e.brand.colors.bg, "#101820", "variant does not leak into the base style");
  assert.throws(() => effective(dir, "a", "nope"), /No variant "nope"/);
  assert.deepEqual(refs.styleErrors(e, { slug: "a" }), []);
});

test("layers: atomic values (a font) replace as a whole; a stale bundle does not survive", () => {
  const dir = project();
  writeJson(custom(dir), { brand: { typography: { heading: { family: "Fraunces", weight: 700 } } }, provenance: { "brand.typography.heading": { source: "seen" } } });
  assert.deepEqual(effective(dir).brand.typography.heading, { family: "Fraunces", weight: 700 });
});

test("layers: a layer with an unknown key or a bad shape is refused with its file name", () => {
  const dir = project();
  writeJson(custom(dir), { colours: {} });
  assert.throws(() => effective(dir), /style\.custom\.json: unknown key "colours"/);
  writeJson(custom(dir), { locked: "brand.colors.bg" });
  assert.throws(() => effective(dir), /locked must be a list/);
});

test("layers: a merged style that breaks the schema is rejected as a whole", () => {
  const dir = project();
  writeJson(custom(dir), { brand: { colors: { accent: "red" } }, provenance: { "brand.colors.accent": { source: "seen" } } });
  assert.throws(() => effective(dir), /once its layers are merged/);
});

// ---- style-set

const setRun = (dir, ...args) => run("style-set.mjs", dir, "a", ...args);

test("style-set writes typed values to style.custom.json and prints a short diff", () => {
  const dir = project();
  const r = setRun(dir, "colors.accent=#00FF88", "motion.duration.base=0.8", "typography.heading.weight=700", "captions.position=top", "storyboard.target_shot_seconds=3");
  assert.equal(r.code, 0, r.err);
  const file = readJson(custom(dir));
  assert.equal(file.brand.colors.accent, "#00ff88");
  assert.strictEqual(file.brand.motion.duration.base, 0.8);
  assert.strictEqual(file.brand.typography.heading.weight, 700);
  assert.equal(file.brand.typography.heading.family, "Inter", "an atomic value is written whole");
  assert.equal(file.storyboard.target_shot_seconds, 3);
  assert.equal(file.provenance["brand.motion.duration"].source, "seen");
  assert.match(r.out, /colors\.accent\s+\| #f2c200\s+\| #00ff88\s+\| custom/);
  assert.equal(readJson(join(dir, "style-refs", "a", "style.json")).brand.colors.accent, "#f2c200", "the extracted card is untouched");
});

test("style-set refuses wrong types and invalid values and leaves the files as they were", () => {
  const dir = project();
  assert.equal(setRun(dir, "colors.accent=#00ff88").code, 0);
  const before = readFileSync(custom(dir), "utf8");
  for (const [arg, re] of [["motion.duration.base=abc", /expected a number/], ["colors.accent=red", /does not match/], ["captions.position=left", /not one of/], ["storyboard.target_shot_seconds=-1", /must be > 0/], ["typography.nope=1", /unknown field/], ["captions.max_chars=12.5", /whole number/], ["audio.has_voice=maybe", /true or false/], ["slug=x", /unknown field/], ["motion.stagger=", /expected a number/]]) {
    const r = setRun(dir, arg);
    assert.equal(r.code, 1, `${arg} is refused`);
    assert.match(r.err, re, arg);
    assert.equal(readFileSync(custom(dir), "utf8"), before, `${arg}: file unchanged`);
  }
  assert.equal(setRun(dir, "colors.accent=#00ff88", "motion.stagger=x").code, 1);
  assert.equal(readFileSync(custom(dir), "utf8"), before, "one bad pair refuses the whole call");
  const fresh = project();
  assert.equal(setRun(fresh, "motion.stagger=x").code, 1);
  assert.ok(!existsSync(custom(fresh)), "no file is created by a refused call");
});

test("style-set --unset gives the lower layer back; --lock pins the value, --unlock frees it", () => {
  const dir = project();
  writeJson(join(dir, "style-refs", "a", "style.enhance.json"), { brand: { colors: { accent: "#444444" } }, provenance: { "brand.colors.accent": { source: "guessed", note: "enhance:x" } } });
  assert.equal(setRun(dir, "colors.accent=#00ff88", "--lock", "colors.accent").code, 0);
  assert.deepEqual(readJson(custom(dir)).locked, ["brand.colors.accent"]);
  assert.equal(effective(dir).brand.colors.accent, "#00ff88");
  assert.equal(setRun(dir, "--unset", "colors.accent").code, 0);
  assert.equal(effective(dir).brand.colors.accent, "#444444", "enhance value shows again");
  assert.equal(setRun(dir, "--lock", "motion.duration.base,colors.primary").code, 0);
  const c = readJson(custom(dir));
  assert.equal(c.brand.motion.duration.base, 0.4, "a lock stores the current value");
  assert.deepEqual(c.locked, ["brand.colors.accent", "brand.colors.primary", "brand.motion.duration.base"]);
  assert.equal(setRun(dir, "--unlock", "colors.accent").code, 0);
  assert.ok(!readJson(custom(dir)).locked.includes("brand.colors.accent"));
  assert.equal(setRun(dir, "--lock", "writing.tone").code, 1, "nothing to lock where the style has no value");
});

test("style-set: a bare family from the font map brings its weight, fallback and bundle; a stale bundle is dropped", () => {
  const dir = project();
  assert.equal(setRun(dir, "typography.heading.family=Be Vietnam Pro").code, 0);
  assert.deepEqual(readJson(custom(dir)).brand.typography.heading, { family: "Be Vietnam Pro", weight: 800, fontsource: "be-vietnam-pro@5.3.0", fallback: "system-ui, sans-serif" });
  assert.equal(setRun(dir, "typography.heading.family=Some Font").code, 0);
  assert.deepEqual(readJson(custom(dir)).brand.typography.heading, { family: "Some Font", weight: 800, fallback: "system-ui, sans-serif" }, "fontsource of the old family is gone");
  assert.equal(setRun(dir, "--unset", "typography.heading.fallback").code, 0);
  assert.equal(readJson(custom(dir)).brand.typography.heading.fallback, undefined, "unset inside an atomic value removes just that field");
});

test("style-set --variant writes variants/<v>.json and leaves custom alone; compare-ready via effectiveStyle", () => {
  const dir = project();
  assert.equal(setRun(dir, "--variant", "warm", "colors.bg=#221100").code, 0);
  assert.equal(effective(dir, "a", "warm").brand.colors.bg, "#221100");
  assert.equal(effective(dir).brand.colors.bg, "#101820");
  assert.ok(!existsSync(custom(dir)));
  assert.equal(setRun(dir, "--variant", "Bad Name", "colors.bg=#221100").code, 1);
  assert.match(run("style-diff.mjs", dir, "a", "--variant", "warm").out, /colors\.bg\s+\| #101820\s+\| #221100\s+\| warm/);
});

test("takeMulti collects repeated and comma-separated --lock/--unlock/--unset", () => {
  const m = set.takeMulti(["d", "a", "x=1", "--lock", "a,b", "--lock=c", "--unset", "d", "--variant", "v"]);
  assert.deepEqual(m.rest, ["d", "a", "x=1", "--variant", "v"]);
  assert.deepEqual([m.lock, m.unlock, m.unset], [["a", "b", "c"], [], ["d"]]);
  assert.throws(() => set.takeMulti(["--lock"]), /needs a field/);
});

test("style-diff lists only fields that differ, at most 40 rows", () => {
  const dir = project();
  assert.match(run("style-diff.mjs", dir, "a").out, /Không có thay đổi/);
  const caps = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 1.5 + i]));
  const prov = { "brand.typography.scale": { source: "seen" } };
  writeJson(custom(dir), { brand: { typography: { scale: caps } }, provenance: prov });
  const out = run("style-diff.mjs", dir, "a").out.trim().split("\n");
  assert.equal(out.length, 1 + 40 + 1, "header, 40 rows, the 'more' line");
  assert.match(out.at(-1), /và 10 dòng nữa/);
});

// ---- enhance rules

test("rule contrast: weak text pairs are fixed to WCAG AA keeping the hue; strong ones raise nothing", () => {
  assert.ok(!ids(project()).includes("contrast"), "healthy palette: not proposed");
  const weak = card("a");
  weak.brand.colors = { bg: "#101820", fg: "#555555", primary: "#1a3a5c", secondary: "#2a9d8f", accent: "#243447", muted: "#303a45" };
  const dir = project(weak);
  const before = contrastLib.contrastIssues({ ...loadProject(dir).brand.colors, ...weak.brand.colors });
  assert.ok(before.length >= 3);
  accept(dir, "contrast");
  const c = mergedColors(dir);
  const ratio = (a, b) => color.contrastRatio(a, b);
  assert.ok(ratio(c.fg, c.bg) >= 4.5 && ratio(c.muted, c.bg) >= 4.5, "text pairs");
  assert.ok(ratio(c.primary, c.bg) >= 3 && ratio(c.accent, c.bg) >= 3 && ratio(c.secondary, c.bg) >= 3, "large text and bars");
  assert.deepEqual(contrastLib.contrastIssues(c, effective(dir).brand.captions), []);
  const hue = (hex) => color.hexToOklch(hex).h;
  assert.ok(Math.abs(hue(c.primary) - hue("#1a3a5c")) < 8, "hue kept");
  assert.equal(c.bg, "#101820", "the background is never the one that moves");
  const e = effective(dir);
  assert.deepEqual(e.provenance["brand.colors.fg"], { source: "guessed", note: "enhance:contrast" });
  assert.deepEqual(refs.styleErrors(e, { slug: "a", brand: loadProject(dir).brand }), []);
});

test("rule contrast also fixes caption text on its box and handles light backgrounds", () => {
  const weak = card("a");
  weak.brand.colors = { bg: "#ffffff", fg: "#aaaaaa", primary: "#e30613", secondary: "#2a9d8f", accent: "#f2c200", muted: "#9aa5b1" };
  weak.brand.captions = { position: "middle", size: 52, color: "#999999", background: "rgba(255,255,255,0.8)" };
  const dir = project(weak);
  accept(dir, "contrast");
  const c = mergedColors(dir);
  assert.ok(color.contrastRatio(c.fg, "#ffffff") >= 4.5);
  assert.ok(color.hexToOklch(c.fg).L < color.hexToOklch("#aaaaaa").L, "darkened on a light page");
  assert.deepEqual(contrastLib.contrastIssues(c, effective(dir).brand.captions), []);
  assert.equal(contrastLib.solidHex("rgba(0,0,0,0.5)", "#ffffff"), "#808080");
});

test("fixContrast: minimal change, never past the target, and a mid-grey background still ends up readable", () => {
  assert.equal(contrastLib.fixContrast("#ffffff", "#000000", 4.5), "#ffffff");
  for (const bg of ["#777777", "#808080", "#101820", "#f5f4ef"]) {
    const fixed = contrastLib.fixContrast("#8899aa", bg, 4.5);
    assert.ok(color.contrastRatio(fixed, bg) >= 4.5, `${bg} -> ${fixed}`);
  }
});

test("rule diacritics: only for Vietnamese and only for fonts not known to carry the subset", () => {
  const weak = card("a");
  weak.brand.typography = { heading: { family: "Montserrat", weight: 800 }, body: { family: "Inter", weight: 400, fontsource: "inter@5.2.8" } };
  const dir = project(weak);
  const [p] = proposals(dir).filter((x) => x.id === "diacritics");
  assert.ok(p);
  assert.equal(p.patch.brand.typography.heading.family, "Be Vietnam Pro");
  assert.equal(p.patch.brand.typography.body, undefined, "Inter is verified");
  accept(dir, "diacritics");
  assert.equal(effective(dir).brand.typography.heading.fontsource, "be-vietnam-pro@5.3.0");
  assert.ok(!ids(dir).includes("diacritics"));
  assert.ok(!ids(project(card("a"))).includes("diacritics"), "Inter: nothing to do");
  const en = join(tmp(), "e");
  assert.equal(run("init-project.mjs", en, "--lang", "en").code, 0);
  mkdirSync(join(en, "style-refs", "a"), { recursive: true });
  writeJson(join(en, "style-refs", "a", "style.json"), weak);
  assert.ok(!ids(en).includes("diacritics"), "English project");
  assert.ok(fonts.supportsVietnamese({ family: "Whatever", src: "fonts/x.woff2" }), "the user's own font file is trusted");
  assert.deepEqual(fonts.vietnameseSibling({ family: "Montserrat", weight: 800 }).family, "Be Vietnam Pro");
  assert.deepEqual(fonts.vietnameseSibling({ family: "Fraunces", weight: 400 }).fontsource, "be-vietnam-pro@5.3.0", "no verified serif: the map's default");
});

test("rule token-gaps: missing roles are derived from the primary colour and pass contrast; complete palettes are left alone", () => {
  assert.ok(!ids(project()).includes("token-gaps"));
  const thin = card("a");
  thin.brand.colors = { bg: "#101820", fg: "#f2f2f2", primary: "#e30613" };
  const dir = project(thin);
  accept(dir, "token-gaps");
  const c = effective(dir).brand.colors;
  assert.ok(c.secondary && c.accent && c.muted);
  assert.ok(color.contrastRatio(c.secondary, c.bg) >= 3 && color.contrastRatio(c.accent, c.bg) >= 3 && color.contrastRatio(c.muted, c.bg) >= 4.5);
  assert.ok(color.deltaE2000(c.secondary, c.primary) > 8, "distinct series colours");
  assert.deepEqual(effective(dir).provenance["brand.colors.accent"], { source: "guessed", note: "enhance:token-gaps" });
  const twins = card("a");
  twins.brand.colors = { bg: "#101820", fg: "#f2f2f2", primary: "#e30613", secondary: "#e50a16", accent: "#f2c200", muted: "#9aa5b1" };
  const [p] = proposals(project(twins)).filter((x) => x.id === "token-gaps");
  assert.ok(p && p.patch.brand.colors.secondary && color.deltaE2000(p.patch.brand.colors.secondary, "#e30613") > 8, "look-alike series colour replaced");
});

test("rule pace-vs-voice: shots shorter than a spoken sentence are lengthened", () => {
  const voiced = card("a", { audio: { has_voice: true }, writing: { words_per_minute: 150 } });
  voiced.brand.motion.duration = { fast: 0.2, base: 0.4, slow: 0.8 };
  voiced.storyboard.target_shot_seconds = 2.4;
  const dir = project(voiced);
  const [p] = proposals(dir).filter((x) => x.id === "pace-vs-voice");
  assert.equal(p.patch.storyboard.target_shot_seconds, 4.8, "12 words at 150 wpm");
  accept(dir, "pace-vs-voice");
  assert.equal(effective(dir).storyboard.target_shot_seconds, 4.8);
  assert.ok(!ids(dir).includes("pace-vs-voice"));
  const slow = card("a", { audio: { has_voice: true }, writing: { words_per_minute: 150 } });
  slow.storyboard.target_shot_seconds = 5;
  assert.ok(!ids(project(slow)).includes("pace-vs-voice"));
  const mute = card("a", { audio: { has_voice: false }, writing: { words_per_minute: 150 } });
  mute.storyboard.target_shot_seconds = 2;
  assert.ok(!ids(project(mute)).includes("pace-vs-voice"), "no voice");
});

test("rule caption-safe-zone: 9:16 captions leave the bottom UI band; other formats are untouched", () => {
  const low = card("a");
  low.brand.captions = { position: "bottom", size: 52, max_chars: 60 };
  const dir = project(low, ["--aspect", "9:16"]);
  const [p] = proposals(dir).filter((x) => x.id === "caption-safe-zone");
  assert.equal(p.patch.brand.captions.position, "middle");
  assert.ok(p.patch.brand.captions.max_chars < 60 && p.patch.brand.captions.max_chars >= 20);
  accept(dir, "caption-safe-zone");
  assert.equal(effective(dir).brand.captions.position, "middle");
  assert.ok(!ids(dir).includes("caption-safe-zone"));
  assert.ok(!ids(project(low)).includes("caption-safe-zone"), "16:9 project");
  const vertical = card("a", { writing: { format: "short-vertical" } });
  vertical.brand.captions = { position: "bottom", size: 52 };
  assert.ok(ids(project(vertical)).includes("caption-safe-zone"), "a short-vertical style proposes it for any project");
});

test("rule missing-parts: writes scene templates from the brand variables, once", () => {
  const dir = project();
  assert.ok(ids(dir).includes("missing-parts"));
  const files = accept(dir, "missing-parts");
  const parts = ["lower-third", "intro", "outro", "thumbnail"].map((k) => join(dir, "style-refs", "a", "parts", `${k}.html`));
  for (const f of parts) assert.ok(files.includes(f) && existsSync(f), f);
  const html = readFileSync(parts[0], "utf8");
  assert.match(html, /os-lower-third/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(html.replace(/<!--.*?-->/gs, "")), "brand variables only, no literal colours");
  assert.ok(!/\{\{\w+\}\}/.test(html), "every placeholder filled");
  assert.match(effective(dir).storyboard.intro, /heading/);
  assert.ok(!ids(dir).includes("missing-parts"));
  const hints = run("style-apply.mjs", dir, "a");
  assert.equal(hints.code, 0, hints.err);
  assert.deepEqual(readJson(join(dir, "style-refs", "a", "hints.json")).parts, ["intro.html", "lower-third.html", "outro.html", "thumbnail.html"]);
  assert.ok(!existsSync(join(dir, "assets", "parts")), "nothing is copied into assets");
});

test("rule series-lock: only inside a series; accepting locks the series-owned parts", () => {
  assert.ok(!ids(project()).includes("series-lock"));
  const root = tmp();
  const dir = join(root, "ep1");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi", "--series", "demo", "--series-root", join(root, "series")).code, 0);
  mkdirSync(join(dir, "style-refs", "a"), { recursive: true });
  writeJson(join(dir, "style-refs", "a", "style.json"), card("a"));
  assert.ok(ids(dir).includes("series-lock"));
  accept(dir, "series-lock");
  assert.deepEqual(readJson(custom(dir)).locked, ["brand.intro", "brand.logo", "brand.lower_third", "brand.outro", "brand.voice"]);
  assert.ok(!ids(dir).includes("series-lock"));
  assert.equal(setRun(dir, "--lock", "brand.logo").code, 0, "locking a series-owned part needs no value");
});

test("variants: a dark style gets a light variant whose pairs pass contrast, and the reverse", () => {
  const dir = project();
  const p = proposals(dir).find((x) => x.id === "variants");
  assert.deepEqual(Object.keys(p.variants), ["light"]);
  accept(dir, "variants");
  const light = mergedColors(dir, "light");
  assert.ok(color.hexToOklch(light.bg).L > 0.9 && color.hexToOklch(light.fg).L < 0.35);
  assert.deepEqual(contrastLib.contrastIssues(light, effective(dir, "a", "light").brand.captions), [], "accent colours kept or fixed");
  assert.equal(effective(dir, "a", "light").provenance["brand.colors.bg"].note, "enhance:variants");
  assert.equal(effective(dir).brand.colors.bg, "#101820", "the base style is unchanged");
  assert.ok(!ids(dir).includes("variants"), "once it exists");
  const bright = card("a");
  bright.brand.colors = { bg: "#f5f4ef", fg: "#1c1e22", primary: "#d7262e", accent: "#b45309", secondary: "#0f766e", muted: "#6b7280" };
  const dir2 = project(bright);
  assert.deepEqual(Object.keys(proposals(dir2).find((x) => x.id === "variants").variants), ["dark"]);
  accept(dir2, "variants");
  const dark = mergedColors(dir2, "dark");
  assert.ok(color.hexToOklch(dark.bg).L < 0.25 && color.hexToOklch(dark.fg).L > 0.85);
  assert.deepEqual(contrastLib.contrastIssues(dark, effective(dir2, "a", "dark").brand.captions), []);
});

test("enhance --reject is remembered; --accept refuses numbers outside the list; a locked or custom field is not proposed again", () => {
  const dir = project();
  const n = ids(dir);
  assert.ok(n.includes("missing-parts") && n.includes("variants"));
  const r = run("style-enhance.mjs", dir, "a", "--reject", String(n.indexOf("variants") + 1));
  assert.equal(r.code, 0, r.err);
  assert.ok(!ids(dir).includes("variants"));
  assert.deepEqual(readJson(join(dir, "style-refs", "a", "style.enhance.json")).rejected, ["variants"]);
  assert.equal(run("style-enhance.mjs", dir, "a", "--accept", "99").code, 1);
  assert.equal(run("style-enhance.mjs", dir, "a", "--accept", "0").code, 1);
  const weak = card("a");
  weak.brand.colors.fg = "#555555";
  const d2 = project(weak);
  assert.ok(ids(d2).includes("contrast"));
  assert.equal(setRun(d2, "colors.fg=#555555", "--lock", "colors.fg").code, 0);
  assert.ok(!ids(d2).includes("contrast"), "the user pinned that colour");
});

test("enhance --accept all writes enhance layer, variants and parts; the result stays valid; compare/apply read it", () => {
  const dir = project(Object.assign(card("a"), { brand: { ...card("a").brand, colors: { bg: "#101820", fg: "#555555", primary: "#e30613" } } }));
  const r = run("style-enhance.mjs", dir, "a", "--no-sheet");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /1\. \[contrast\]/);
  const acc = run("style-enhance.mjs", dir, "a", "--accept", "all");
  assert.equal(acc.code, 0, acc.err);
  const enhanced = readJson(join(dir, "style-refs", "a", "style.enhance.json"));
  assert.ok(enhanced.applied.length >= 3 && enhanced.applied.every((a) => a.id && a.at));
  assert.deepEqual(refs.styleErrors(effective(dir), { slug: "a", brand: loadProject(dir).brand }), []);
  const apply = run("style-apply.mjs", dir, "a");
  assert.equal(apply.code, 0, apply.err);
  assert.ok(color.contrastRatio(readJson(join(dir, "brand", "brand.json")).colors.fg, "#101820") >= 4.5, "applied brand passes AA");
  assert.ok(!/below WCAG AA/.test(apply.out));
});

test("style-apply refuses pairs under WCAG AA and writes nothing; --allow-low-contrast lets the user override", () => {
  const weak = card("a");
  weak.brand.colors.fg = "#555555";
  const dir = project(weak);
  const brandFile = join(dir, "brand", "brand.json");
  const before = [readFileSync(brandFile, "utf8"), readFileSync(join(dir, "studio.json"), "utf8")];
  for (const extra of [[], ["--dry-run"]]) {
    const r = run("style-apply.mjs", dir, "a", ...extra);
    assert.equal(r.code, 1);
    assert.match(r.err, /Refused: .*below WCAG AA \(colors\.fg .*lists it.*--accept.*style-set\.mjs/s);
  }
  assert.deepEqual([readFileSync(brandFile, "utf8"), readFileSync(join(dir, "studio.json"), "utf8")], before, "no writes");
  assert.ok(!existsSync(join(dir, "style-refs", "a", "hints.json")));
  const ok = run("style-apply.mjs", dir, "a", "--allow-low-contrast");
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /below WCAG AA, applied because of --allow-low-contrast: colors\.fg/);
});

// ---- re-extraction keeps the user's choices

let pipe;
before(() => {
  pipe = join(tmp(), "p");
  assert.equal(run("init-project.mjs", pipe, "--lang", "vi").code, 0);
  const fx = makeFixtures(join(tmp(), "fx"));
  mkdirSync(join(pipe, "style-refs", "cuts"), { recursive: true });
  copyFileSync(fx.cuts, join(pipe, "style-refs", "cuts", "source.mp4"));
  assert.equal(run("style-analyze.mjs", pipe, "cuts").code, 0);
  assert.equal(run("style-draft.mjs", pipe, "cuts").code, 0);
});

test("style-draft --force after style-set keeps custom and locked values and says so", () => {
  const sd = join(pipe, "style-refs", "cuts");
  const run2 = (...a) => run("style-set.mjs", pipe, "cuts", ...a);
  assert.equal(run2("colors.accent=#00ff88", "motion.stagger=0.2", "motion.duration.base=0.77", "--lock", "motion.duration.base").code, 0);
  const lockedValue = 0.77;
  const tampered = readJson(join(sd, "style.json"));
  tampered.brand.motion.duration.base = 9.9;
  writeJson(join(sd, "style.json"), tampered);
  assert.equal(effective(pipe, "cuts").brand.motion.duration.base, lockedValue, "the lock beats a changed extraction");
  const r = run("style-draft.mjs", pipe, "cuts", "--force");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /kept by your choice[^:]*: .*brand\.colors\.accent/);
  assert.match(r.out, /brand\.motion\.duration\.base/);
  const e = effective(pipe, "cuts");
  assert.equal(e.brand.colors.accent, "#00ff88");
  assert.equal(e.brand.motion.stagger, 0.2);
  assert.equal(e.brand.motion.duration.base, lockedValue);
  assert.notEqual(readJson(join(sd, "style.json")).brand.motion.duration.base, 9.9, "style.json was re-extracted");
  assert.equal(readJson(join(sd, "style.custom.json")).brand.colors.accent, "#00ff88", "custom file untouched by re-extraction");
  assert.equal(run2("--unset", "colors.accent").code, 0);
  assert.equal(effective(pipe, "cuts").brand.colors.accent, readJson(join(sd, "style.json")).brand.colors.accent);
});

test("style-merge reads its sources through their layers and reports what it carried over", () => {
  const sd = join(pipe, "style-refs");
  mkdirSync(join(sd, "cuts2"), { recursive: true });
  copyFileSync(join(sd, "cuts", "metrics.json"), join(sd, "cuts2", "metrics.json"));
  copyFileSync(join(sd, "cuts", "style.json"), join(sd, "cuts2", "style.json"));
  const s2 = readJson(join(sd, "cuts2", "style.json"));
  s2.slug = "cuts2";
  writeJson(join(sd, "cuts2", "style.json"), s2);
  assert.equal(run("style-set.mjs", pipe, "cuts", "motion.stagger=0.2").code, 0);
  assert.equal(run("style-set.mjs", pipe, "cuts2", "motion.stagger=0.2").code, 0);
  const r = run("style-merge.mjs", pipe, "cuts", "cuts2", "--as", "blend");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /kept by your choice[^:]*, blended in: .*brand\.motion\.stagger \(cuts\)/);
  assert.equal(readJson(join(sd, "blend", "style.json")).brand.motion.stagger, 0.2);
});

// ---- blend maths

test("blend: endpoints are exact, colours go through OKLCH, numbers are linear, enums switch at 50%", () => {
  assert.equal(blend.lerpHex("#101820", "#ffffff", 0), "#101820");
  assert.equal(blend.lerpHex("#101820", "#ffffff", 1), "#ffffff");
  const mid = blend.lerpHex("#000000", "#ffffff", 0.5);
  assert.ok(Math.abs(color.hexToOklch(mid).L - 0.5) < 0.01, "OKLCH midpoint lightness");
  const red2blue = color.hexToOklch(blend.lerpHex("#ff0000", "#0000ff", 0.5));
  assert.ok(red2blue.C > 0.15, "chroma kept: no grey in the middle");
  assert.equal(blend.lerpHex("#808080", "#ff0000", 0.5).length, 7);
  assert.equal(blend.blendValue(0.4, 0.8, 0.5), 0.6);
  assert.strictEqual(blend.blendValue(40, 52, 0.5), 46);
  assert.equal(blend.blendValue("flat", "glass", 0.5), "flat", "50% is not above 50%");
  assert.equal(blend.blendValue("flat", "glass", 0.51), "glass");
  const style = { "brand.colors.bg": "#000000", "brand.surface": "glass", "brand.motion.stagger": 0.1, "brand.typography.heading.family": "A", "brand.typography.heading.fontsource": "a@1.0.0", "brand.captions.size": 50, "brand.colors.accent": "#ff0000" };
  const base = { "brand.colors.bg": "#ffffff", "brand.surface": "flat", "brand.motion.stagger": 0.3, "brand.typography.heading.family": "B", "brand.typography.heading.weight": 700, "brand.captions.size": 40 };
  assert.deepEqual(blend.blendFlat(style, base, 100), style);
  const zero = blend.blendFlat(style, base, 0);
  assert.equal(zero["brand.colors.bg"], "#ffffff");
  assert.equal(zero["brand.typography.heading.family"], "B");
  assert.ok("brand.typography.heading.fontsource" in zero && zero["brand.typography.heading.fontsource"] === undefined, "the style's own bundle field goes");
  assert.equal(zero["brand.typography.heading.weight"], 700, "the base's field comes in");
  assert.equal(zero["brand.colors.accent"], "#ff0000", "the base has no accent: the style's stays");
  const part = blend.blendFlat(style, base, 75);
  assert.equal(part["brand.typography.heading.family"], "A", "a font follows one side as a whole");
  assert.equal(part["brand.surface"], "glass");
  assert.equal(part["brand.motion.stagger"], 0.15);
});

test("buildSetCommand quotes, shortens brand keys and is empty when nothing changed", () => {
  assert.equal(blend.buildSetCommand({ dir: "/p", slug: "a" }), "");
  const cmd = blend.buildSetCommand({ dir: "/my project", slug: "a", variant: "light", changes: { "brand.colors.accent": "#00ff88", "storyboard.target_shot_seconds": 3, "brand.typography.heading.family": "Be Vietnam Pro", "storyboard.visual_modes": ["a", "b"] }, unsets: ["brand.typography.heading.fontsource"], lock: ["brand.colors.accent"], unlock: ["brand.motion.stagger"] });
  assert.equal(cmd, `node "$S/scripts/style-set.mjs" '/my project' a --variant light colors.accent=#00ff88 storyboard.target_shot_seconds=3 'typography.heading.family=Be Vietnam Pro' storyboard.visual_modes=a,b --unset typography.heading.fontsource --lock colors.accent --unlock motion.stagger`);
  const { changes, unsets } = blend.diffChanges({ a: 1, b: 2, c: "x" }, { a: 1, b: 3, c: undefined, d: 4 });
  assert.deepEqual([changes, unsets], [{ b: 3, d: 4 }, ["c"]]);
});

test("schema lookup and coercion cover the editable fields", () => {
  assert.equal(values.coerce("brand.colors.accent", " #ABCDEF "), "#abcdef");
  assert.strictEqual(values.coerce("brand.motion.duration.slow", "1.25"), 1.25);
  assert.deepEqual(values.coerce("storyboard.visual_modes", "kinetic-type, split-screen"), ["kinetic-type", "split-screen"]);
  assert.equal(values.coerce("brand.surface", "GLASS"), "glass");
  assert.strictEqual(values.coerce("audio.has_voice", "có"), true);
  assert.deepEqual(values.coerce("brand.typography.heading", '{"family":"Inter"}'), { family: "Inter" });
  assert.throws(() => values.coerce("brand.typography.heading", "Inter"), /JSON object/);
  assert.throws(() => values.schemaAt("brand.motion.nope.x"), /unknown field/);
});

// ---- the page and the round trip

function runCommand(dir, cmd) {
  const r = spawnSync("sh", ["-c", cmd.replace('"$S/scripts/style-set.mjs"', `"${SCRIPTS}/style-set.mjs"`).replace(/^node /, `${process.execPath} `)], { encoding: "utf8" });
  assert.equal(r.status, 0, `${cmd}\n${r.stderr}`);
}
const flat = (style) => layers.flatten(style);

test("round trip: a blended change set becomes a style-set command whose result is exactly what the page showed", () => {
  const dir = project();
  const style = effective(dir);
  const merged = { ...loadProject(dir).brand, ...style.brand };
  const pick = (b) => Object.fromEntries(["colors", "surface", "typography", "motion", "transitions", "captions"].filter((k) => b[k]).map((k) => [k, b[k]]));
  const initial = flat({ brand: pick(merged), storyboard: style.storyboard });
  const base = flat({ brand: pick(loadProject(dir).brand) });
  for (const sim of [0, 30, 50, 80]) {
    const shown = { ...blend.blendFlat(initial, base, sim), "brand.colors.accent": "#12ab34", "storyboard.target_shot_seconds": 3.5 };
    const { changes, unsets } = blend.diffChanges(initial, shown);
    const cmd = blend.buildSetCommand({ dir, slug: "a", changes, unsets, lock: ["brand.colors.accent"] });
    assert.ok(cmd.includes("colors.accent=#12ab34"), cmd);
    runCommand(dir, cmd);
    const got = flat(effective(dir));
    for (const [p, v] of Object.entries(shown)) {
      if (v === undefined) assert.equal(got[p], undefined, `${sim}%: ${p} removed`);
      else if (p in changes) assert.deepEqual(got[p], v, `${sim}%: ${p}`);
    }
    assert.ok(readJson(custom(dir)).locked.includes("brand.colors.accent"));
    rmSync(custom(dir));
    assert.deepEqual(flat(effective(dir)), flat(style), "without the custom layer the extracted card is back");
  }
});

test("the editor page is one offline file whose inlined code is the tested code", () => {
  const dir = project();
  const r = editor.buildEditor(dir, "a", { offline: true });
  const html = readFileSync(r.file, "utf8");
  assert.ok(r.file.endsWith(join("review", "style-editor.html")));
  assert.ok(!/\bimport\s.*from\b/.test(html) && !/^export\s/m.test(html), "plain script, no modules");
  assert.ok(!/https?:\/\//.test(html.replace(/<!--.*?-->/gs, "").replace(/"\$schema"/g, "")), "no remote URL in the page");
  for (const name of ["lerpHex", "blendFlat", "diffChanges", "buildSetCommand"]) assert.ok(html.includes(`function ${name}`), name);
  assert.deepEqual(r.data.fonts.map((f) => f.family).sort(), fonts.loadFontMap().map((f) => f.family).sort(), "the font select lists exactly the map");
  assert.ok(existsSync(join(dir, "review", "style-editor", "assets", "brand-glass.css")) && existsSync(join(dir, "review", "style-editor", "scenes", "caption.html")));
  assert.match(readFileSync(join(dir, "review", "style-editor", "scenes", "title.html"), "utf8"), /editor-bridge\.js/);
  assert.deepEqual(Object.keys(r.data.initial).filter((k) => k.startsWith("brand.colors.")).length, 6);
  assert.equal(readJson(join(dir, "brand", "brand.json")).version, 1, "brand.json untouched");
  assert.equal(run("style-editor.mjs", dir, "a", "--variant", "nope", "--offline").code, 1);
});

test("editor page in headless Chrome: no network request, CSS variables reach the sample scenes, the command matches", async (t) => {
  if (!cdp.cdpAvailable() || !cdp.findChrome()) return t.skip("no Chrome or no WebSocket");
  const dir = project();
  if (!realGsap(dir)) return t.skip("no cached GSAP to animate the sample scenes");
  editor.buildEditor(dir, "a", { offline: true });
  const { cdp: c, close } = await cdp.launchChrome({ width: 1440, height: 1000 });
  try {
    const urls = [];
    c.on((m) => m.method === "Network.requestWillBeSent" && urls.push(m.params.request.url));
    const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (m, p) => c.send(m, p, sessionId);
    await send("Page.enable");
    await send("Network.enable");
    await send("Runtime.enable");
    const loaded = c.waitFor((m) => m.method === "Page.loadEventFired" && m.sessionId === sessionId, 20000, "page load");
    await send("Page.navigate", { url: `file://${join(dir, "review", "style-editor.html")}` });
    await loaded;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    const page = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
    // Computed style inside the sample iframes (cross-origin on file://): an isolated world per frame.
    const inFrames = async (expression) => {
      const { frameTree } = await send("Page.getFrameTree");
      const out = [];
      for (const f of frameTree.childFrames ?? []) {
        const { executionContextId } = await send("Page.createIsolatedWorld", { frameId: f.frame.id, worldName: "probe" });
        out.push((await send("Runtime.evaluate", { contextId: executionContextId, expression, returnByValue: true })).result.value);
      }
      return out;
    };
    const probe = "getComputedStyle(document.getElementById('root')).backgroundColor + '|' + getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim()";
    assert.deepEqual(await inFrames(probe), Array(3).fill("rgb(16, 24, 32)|#101820"));
    assert.equal(await page("document.getElementById('cmd').value"), "Chưa đổi gì.");

    await page("(() => { const i = document.querySelector('input[aria-label=\"brand.colors.bg\"]'); i.value = '#336699'; i.dispatchEvent(new Event('input')); })()");
    await wait(400);
    assert.deepEqual(await inFrames(probe), Array(3).fill("rgb(51, 102, 153)|#336699"), "the scenes' computed background follows the control");
    assert.equal(await page("document.getElementById('cmd').value"), `node "$S/scripts/style-set.mjs" ${dir} a colors.bg=#336699`);

    await page("(() => { const s = document.querySelector('select[aria-label=\"brand.surface\"]'); s.value = 'glass'; s.dispatchEvent(new Event('change')); })()");
    await wait(400);
    assert.deepEqual(await inFrames("document.querySelector('link[rel=stylesheet]').getAttribute('href')"), Array(3).fill("../assets/brand-glass.css"));

    // The similarity slider and a lock; the line the page shows is what style-set must reproduce.
    await page("(() => { const s = document.getElementById('similarity'); s.value = 20; s.dispatchEvent(new Event('input')); document.querySelector('button.lock').click(); })()");
    await wait(300);
    const shown = JSON.parse(await page("JSON.stringify(window.__editor.cur())"));
    const cmd = await page("window.__editor.command()");
    assert.match(cmd, /--lock colors\.bg/);
    runCommand(dir, cmd);
    const got = flat(effective(dir));
    const initial = JSON.parse(await page("document.getElementById('data').textContent")).initial;
    const { changes, unsets } = blend.diffChanges(initial, shown);
    assert.ok(Object.keys(changes).length > 3, "the slider moved several fields");
    for (const [p, v] of Object.entries(changes)) assert.deepEqual(got[p], v, p);
    for (const p of unsets) assert.equal(got[p], undefined, `${p} removed`);
    assert.deepEqual(urls.filter((u) => !/^(file|about|data):/.test(u)), [], "no request left the machine");
    assert.ok(urls.some((u) => u.startsWith("file:") && u.includes("scenes/title.html")), "the scenes were loaded from disk");
  } finally {
    close();
  }
});

// ---- enhance sheet (needs the HyperFrames browser, like style-compare)

test("style-enhance draws a before/after row for each visual proposal", (t) => {
  const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
  if (!chrome) return t.skip("no Chrome for HyperFrames");
  const weak = card("a");
  weak.brand.colors.fg = "#555555";
  const dir = project(weak);
  realGsap(dir);
  const r = run("style-enhance.mjs", dir, "a", "--offline");
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, "review", "style-a-enhance.jpg")));
  assert.match(r.out, /row 1 left to right: #1 contrast · before \| #1 contrast · after/);
  assert.ok(!existsSync(join(dir, ".one-studio", "enhance")), "staging removed");
});

test("validate.mjs checks the merged style and every variant, and style-diff --get prints current values", () => {
  const dir = project();
  assert.equal(run("validate.mjs", dir).code, 0);
  assert.equal(setRun(dir, "--variant", "warm", "colors.bg=#221100").code, 0);
  assert.equal(run("validate.mjs", dir).code, 0);
  writeJson(join(dir, "style-refs", "a", "variants", "warm.json"), { brand: { colors: { bg: "nope" } }, provenance: { "brand.colors.bg": { source: "seen" } } });
  const bad = run("validate.mjs", dir);
  assert.equal(bad.code, 1);
  assert.match(bad.out + bad.err, /variant warm/);
  const get = run("style-diff.mjs", dir, "a", "--get", "motion.duration,surface");
  assert.equal(get.code, 0, get.err);
  assert.match(get.out, /motion\.duration\.base = 0\.4/);
  assert.match(get.out, /surface = flat/);
  assert.equal(run("style-diff.mjs", dir, "a", "--get", "nothing.here").code, 1);
});

test("style-compare --variant renders the variant into its own sheet", (t) => {
  const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
  if (!chrome) return t.skip("no Chrome for HyperFrames");
  const dir = project();
  assert.equal(setRun(dir, "--variant", "warm", "colors.bg=#221100").code, 0);
  const r = run("style-compare.mjs", dir, "a", "--variant", "warm", "--offline");
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, "review", "style-a-warm-compare.jpg")));
  assert.equal(run("style-compare.mjs", dir, "a", "--variant", "missing", "--offline").code, 1);
});
