// style-compare staging, style-apply, style-merge and the preset cache behind --as-preset.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { readJson, run, scene, tmp, writeJson } from "./helpers.mjs";

// Presets saved by --as-preset and fonts never touch the real cache.
process.env.ONE_STUDIO_CACHE = tmp();

const S = "plugins/one-studio/skills/one-studio";
const refs = await import(`../${S}/scripts/lib/style-refs.mjs`);
const presets = await import(`../${S}/scripts/lib/presets.mjs`);
const stage = await import(`../${S}/scripts/lib/stage-brand.mjs`);
const apply = await import(`../${S}/scripts/style-apply.mjs`);
const merge = await import(`../${S}/scripts/style-merge.mjs`);
const compare = await import(`../${S}/scripts/style-compare.mjs`);
const { loadProject, validateKind } = await import(`../${S}/scripts/lib/project.mjs`);
const { sceneHash } = await import(`../${S}/scripts/lib/hash.mjs`);

const cluster = (hex, weight, bg = false) => ({ hex, weight, L: 0.5, C: 0.1, h: 30, bg });

function card(slug, over = {}) {
  const style = {
    version: 1,
    slug,
    reference: { file: "source.mp4", accessed: "2026-10-22", range: { from: 0, to: 30 }, title: `Video ${slug}`, url: "https://example.com/v" },
    brand: {
      colors: { bg: "#101820", fg: "#f2f2f2", primary: "#e30613", accent: "#f2c200" },
      surface: "flat",
      typography: { heading: { family: "Montserrat", weight: 800 } },
      motion: { duration: { fast: 0.2, base: 0.4, slow: 0.8 }, stagger: 0.05 },
      transitions: { default: "cut", duration: 0.2 },
      captions: { position: "middle", size: 52 },
    },
    storyboard: { target_shot_seconds: 2.4, visual_modes: ["kinetic-type"] },
    writing: { format: "short-vertical", tone: "playful", hook: "question" },
    audio: { lufs: -16, has_voice: true },
    do_not_copy: ["mascot"],
    ...over,
  };
  style.provenance = Object.fromEntries(
    ["brand", "storyboard", "writing", "audio"].flatMap((k) => refs.leafPaths(style[k] ?? {}, k, []).filter((p) => p !== k)).map((p) => [p, { source: "measured" }]),
  );
  return style;
}

// A project with style-refs/<slug>/ holding a card, metrics, footage and frames.
function project(slugs = { a: card("a") }, { palettes = {}, tone } = {}) {
  const dir = join(tmp(), "p");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [scene("s01", "text", { duration: 4 })] });
  mkdirSync(join(dir, "scenes"), { recursive: true });
  writeFileSync(join(dir, "scenes", "s01.html"), "<html><body>s01</body></html>");
  if (tone) {
    const studio = readJson(join(dir, "studio.json"));
    writeJson(join(dir, "studio.json"), { ...studio, story: { tone } });
  }
  for (const [slug, style] of Object.entries(slugs)) {
    const sd = join(dir, "style-refs", slug);
    mkdirSync(join(sd, "frames"), { recursive: true });
    writeJson(join(sd, "style.json"), style);
    writeJson(join(sd, "metrics.json"), { format: { width: 1920, height: 1080, aspect: "16:9" }, color: { palette: palettes[slug] ?? [] } });
    writeJson(join(sd, "info.json"), { file: "source.mp4", url: "https://example.com/v", keep: false });
    writeFileSync(join(sd, "source.mp4"), "not a video");
    writeFileSync(join(sd, "frames", "frame-01.jpg"), "x");
  }
  return dir;
}

// Every file under dir with size and mtime, to prove a command wrote nothing.
const snapshot = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? snapshot(p, base) : [`${relative(base, p)}:${statSync(p).size}:${statSync(p).mtimeMs}`];
  });

// ---- apply

test("dry run writes nothing", () => {
  const dir = project();
  const before = snapshot(dir);
  const r = apply.applyStyle(dir, "a", { dryRun: true, asPreset: "dry-look" });
  assert.equal(r.version, 2);
  assert.deepEqual(snapshot(dir), before);
  assert.ok(!existsSync(join(process.env.ONE_STUDIO_CACHE, "presets", "dry-look.json")));
});

test("apply merges the brand, bumps the version, records the style and hints, drops the footage", () => {
  const dir = project();
  const brandBefore = readJson(join(dir, "brand", "brand.json"));
  const r = apply.applyStyle(dir, "a", {});
  const brand = readJson(join(dir, "brand", "brand.json"));
  assert.equal(brand.version, brandBefore.version + 1);
  assert.equal(brand.colors.primary, "#e30613");
  assert.equal(brand.colors.muted, brandBefore.colors.muted, "roles the style lacks keep the project's value");
  assert.equal(brand.typography.heading.family, "Montserrat");
  assert.equal(brand.typography.body.family, brandBefore.typography.body.family);
  assert.equal(brand.motion.ease.out, brandBefore.motion.ease.out, "motion merges per section");
  assert.equal(brand.motion.duration.base, 0.4);
  assert.equal(brand.captions.mode, brandBefore.captions.mode);
  assert.equal(brand.captions.position, "middle");
  assert.equal(brand.preset, undefined);
  assert.deepEqual(validateKind("brand", brand), []);
  const studio = readJson(join(dir, "studio.json"));
  assert.deepEqual(studio.story.style, { slug: "a" });
  assert.equal(studio.story.format, "short-vertical");
  assert.equal(studio.story.tone, "playful");
  const hints = readJson(join(dir, "style-refs", "a", "hints.json"));
  assert.equal(hints.storyboard.target_shot_seconds, 2.4);
  assert.equal(hints.audio.lufs, -16);
  assert.deepEqual(hints.do_not_copy, ["mascot"]);
  assert.deepEqual(r.removed.sort(), ["frames", "source.mp4"]);
  assert.ok(existsSync(join(dir, "style-refs", "a", "style.json")) && existsSync(join(dir, "style-refs", "a", "metrics.json")));
  assert.deepEqual(run("validate.mjs", join(dir, "studio.json")).code, 0);
});

test("--keep and a fetch recorded with keep keep the footage", () => {
  const dir = project();
  assert.deepEqual(apply.applyStyle(dir, "a", { keep: true }).removed, []);
  assert.ok(existsSync(join(dir, "style-refs", "a", "source.mp4")));
  const again = project();
  writeJson(join(again, "style-refs", "a", "info.json"), { file: "source.mp4", keep: true });
  apply.applyStyle(again, "a", {});
  assert.ok(existsSync(join(again, "style-refs", "a", "frames")));
});

test("an approved tone is not overwritten; absent style fields keep the project's values", () => {
  const dir = project({ a: card("a", { writing: { tone: "playful" }, brand: { colors: { primary: "#112233" } } }) }, { tone: "calm" });
  const before = readJson(join(dir, "brand", "brand.json"));
  apply.applyStyle(dir, "a", {});
  const studio = readJson(join(dir, "studio.json"));
  assert.equal(studio.story.tone, "calm");
  assert.equal(studio.story.format, undefined);
  const after = readJson(join(dir, "brand", "brand.json"));
  assert.equal(after.colors.primary, "#112233");
  assert.deepEqual([after.colors.bg, after.colors.fg, after.colors.accent], [before.colors.bg, before.colors.fg, before.colors.accent]);
});

test("nothing from style-refs/ lands in assets/ or out/", () => {
  const dir = project();
  mkdirSync(join(dir, "assets"), { recursive: true });
  const names = () => ["assets", "out"].flatMap((d) => (existsSync(join(dir, d)) ? snapshot(join(dir, d)).map((f) => f.split(":")[0]) : []));
  const before = names();
  apply.applyStyle(dir, "a", { keep: true });
  assert.deepEqual(names(), before);
  assert.equal(names().filter((f) => /source\.|frame-|style\.json|hints\.json/.test(f)).length, 0);
});

test("reapproval count: approved scenes lose their approval when the version bumps", () => {
  const dir = project();
  const p = loadProject(dir);
  const hash = sceneHash(p, p.storyboard.scenes[0]);
  const studio = readJson(join(dir, "studio.json"));
  studio.scenes = [{ id: "s01", status: "built", approved_hash: hash }];
  writeJson(join(dir, "studio.json"), studio);
  const r = apply.applyStyle(dir, "a", { dryRun: true });
  assert.deepEqual([r.approved, r.reapprove], [1, 1]);
});

test("a variant that does not exist is refused", () => {
  const dir = project();
  assert.throws(() => apply.applyStyle(dir, "a", { variant: "light" }), /No variant "light"/);
});

// ---- preset cache

test("--as-preset saves a cache preset that loadPresets sees; plugin names are refused", () => {
  const dir = project();
  const r = apply.applyStyle(dir, "a", { asPreset: "my-look" });
  assert.equal(r.preset.file, join(process.env.ONE_STUDIO_CACHE, "presets", "my-look.json"));
  const all = presets.loadPresets();
  assert.equal(all["my-look"].colors.primary, "#e30613");
  assert.equal(all["my-look"].colors.muted, all.default.colors.muted, "missing roles are filled from the default preset");
  assert.equal(all["my-look"].source.url, "https://example.com/v");
  assert.ok(presets.PRESET_NAMES().includes("my-look"));
  assert.deepEqual(validateKind("brand", presets.applyPreset(readJson(join(dir, "brand", "brand.json")), "my-look")), []);
  const plugin = JSON.parse(readFileSync(`${S}/templates/brand-presets.json`, "utf8"));
  assert.throws(() => apply.applyStyle(project(), "a", { asPreset: "apple-light" }), /plugin preset/);
  assert.deepEqual(JSON.parse(readFileSync(`${S}/templates/brand-presets.json`, "utf8")), plugin, "plugin presets are never written");
  assert.throws(() => apply.applyStyle(project(), "a", { asPreset: "Bad Name" }), /kebab-case/);
});

// ---- merge

test("merge: median numbers, colours in two sources only, majority values, ties left open", () => {
  const a = card("a", { brand: { colors: {}, motion: { stagger: 0.04 } }, storyboard: { target_shot_seconds: 2, visual_modes: ["kinetic-type"] } });
  const b = card("b", { brand: { colors: {}, motion: { stagger: 0.08 } }, storyboard: { target_shot_seconds: 4, visual_modes: ["kinetic-type"] } });
  const c = card("c", { brand: { colors: {}, motion: { stagger: 0.2 } }, storyboard: { target_shot_seconds: 9, visual_modes: ["photo-wall"] } });
  const dir = project(
    { a, b, c },
    { palettes: { a: [cluster("#101010", 0.7, true), cluster("#e30613", 0.2), cluster("#00ff00", 0.1)], b: [cluster("#111111", 0.6, true), cluster("#e50a16", 0.3), cluster("#ffffff", 0.1)], c: [cluster("#0f0f0f", 0.8, true), cluster("#e20614", 0.2)] } },
  );
  const r = merge.writeMerged(dir, ["a", "b", "c"], "mix");
  const out = readJson(join(dir, "style-refs", "mix", "style.json"));
  assert.equal(out.brand.motion.stagger, 0.08);
  assert.equal(out.storyboard.target_shot_seconds, 4);
  assert.deepEqual(out.storyboard.visual_modes, ["kinetic-type"]);
  const hexes = readJson(join(dir, "style-refs", "mix", "metrics.json")).color.palette.map((p) => p.hex);
  assert.ok(!hexes.includes("#00ff00") && !hexes.includes("#ffffff"), "colours seen in one source are dropped");
  assert.ok(hexes.includes("#101010") && hexes.includes("#e30613"));
  assert.ok(out.brand.colors.bg && out.brand.colors.primary);
  assert.deepEqual(refs.styleErrors(out, { slug: "mix" }), []);
  assert.equal(readJson(join(dir, "style-refs", "mix", "sources.json")).length, 3);
  assert.equal(r.dropped, 2);
  // two sources that disagree on a string: no majority, the field is absent (not null)
  const t = merge.mergeStyles(loadProject(dir), ["a", "c"], "tie");
  assert.equal(t.style.storyboard.visual_modes, undefined);
  assert.ok(t.ties.includes("storyboard.visual_modes"));
  assert.throws(() => merge.writeMerged(dir, ["a", "b"], "mix"), /already exists/);
  assert.throws(() => merge.writeMerged(dir, ["a"], "solo"), /at least two/);
});

test("merge: median of an even count is the mean", () => {
  assert.equal(merge.median([1, 2, 3, 10]), 2.5);
  assert.equal(merge.median([5]), 5);
});

// ---- staging and compare

test("stageBrand: the style's colours land in the staged brand.css; the project stays untouched", () => {
  const dir = project();
  mkdirSync(join(dir, "assets", "vendor"), { recursive: true });
  for (const f of ["gsap.min.js", "howler.core.min.js"]) writeFileSync(join(dir, "assets", "vendor", f), "");
  const before = snapshot(dir);
  const p = loadProject(dir);
  const style = readJson(join(dir, "style-refs", "a", "style.json"));
  const brand = refs.mergeBrandPatch(p.brand, style.brand);
  const root = join(dir, ".one-studio", "styles", "a");
  const { warning } = stage.stageBrand(p, { root, brand, scenes: [{ id: "title", html: "<html></html>" }], offline: true });
  assert.equal(warning, null);
  assert.match(readFileSync(join(root, "assets", "brand.css"), "utf8"), /--c-primary: #e30613;/);
  assert.match(readFileSync(join(root, "assets", "brand.css"), "utf8"), /Montserrat/);
  assert.ok(existsSync(join(root, "assets", "os.css")) && existsSync(join(root, "assets", "audio-cues.js")));
  assert.ok(existsSync(join(root, "scenes", "title.html")));
  assert.ok(!existsSync(join(dir, "assets", "brand.css")), "the project's own assets are not written");
  assert.deepEqual(snapshot(dir).filter((f) => !f.startsWith(".one-studio")), before);
});

test("sample scenes fill every placeholder", () => {
  for (const name of ["title", "data", "caption"]) {
    const body = readFileSync(`plugins/one-studio/skills/style-extract/templates/samples/${name}.html`, "utf8");
    assert.match(body, /\{\{id\}\}/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(body), `${name}: brand variables only, no literal colours`);
    assert.match(body, /[ắằẳẵặâấầẩẫậêếềểễệôốồổỗộơớờởỡợưứừửữựđ]/i, `${name}: Vietnamese text with diacritics`);
  }
});

test("style-compare renders three samples under the reference frames", (t) => {
  const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
  if (!chrome) return t.skip("no Chrome for HyperFrames");
  const dir = project();
  mkdirSync(join(dir, "assets", "vendor"), { recursive: true });
  for (const f of ["gsap.min.js", "howler.core.min.js"]) writeFileSync(join(dir, "assets", "vendor", f), "");
  for (const n of ["01", "02", "03"]) spawnSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=teal:s=320x180", "-frames:v", "1", join(dir, "style-refs", "a", "frames", `frame-${n}.jpg`)]);
  const r = compare.compareStyle(dir, "a", { offline: true });
  assert.ok(existsSync(r.sheet) && r.sheet.endsWith("style-a-compare.jpg"));
  assert.ok(r.hasReference);
  assert.deepEqual(r.rows.map((x) => x.id), ["reference", "samples", "tokens"]);
  assert.equal(r.fonts.heading, "Montserrat");
  assert.ok(!existsSync(join(dir, ".one-studio", "styles")), "staging is removed");
  assert.equal(readJson(join(dir, "brand", "brand.json")).version, 1, "compare never changes brand.json");
});

test("check-external does not ask for yt-dlp once the style card exists", async () => {
  const { neededTools } = await import(`../${S}/scripts/check-external.mjs`);
  const dir = project();
  assert.ok(!neededTools(loadProject(dir)).includes("yt-dlp"), "footage on disk");
  apply.applyStyle(dir, "a", {});
  assert.ok(!neededTools(loadProject(dir)).includes("yt-dlp"), "footage removed after apply");
  const bare = project();
  rmSync(join(bare, "style-refs", "a", "source.mp4"), { force: true });
  rmSync(join(bare, "style-refs", "a", "style.json"), { force: true });
  assert.ok(neededTools(loadProject(bare)).includes("yt-dlp"), "a link without footage or card still needs it");
});
