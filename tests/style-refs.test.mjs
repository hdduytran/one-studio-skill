import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { run, readJson, tmp, writeJson } from "./helpers.mjs";

const S = "plugins/one-studio/skills/one-studio";
const lib = await import(`../${S}/scripts/lib/style-refs.mjs`);
const { validateKind } = await import(`../${S}/scripts/lib/project.mjs`);

const brandTemplate = () => JSON.parse(readFileSync(`${S}/templates/brand.json`, "utf8").replace("{{name}}", "t"));

const card = (over = {}) => ({
  version: 1,
  slug: "demo-style",
  reference: { file: "source.mp4", accessed: "2026-10-22", range: { from: 0, to: 90 } },
  brand: {
    colors: { bg: "#ffffff", primary: "#e30613" },
    surface: "flat",
    typography: { heading: { family: "Montserrat", weight: 800 } },
    transitions: { default: "wipe", duration: 0.3 },
  },
  storyboard: { target_shot_seconds: 2.4, visual_modes: ["kinetic-type"], sfx_density: "low" },
  audio: { lufs: -16, has_voice: true, music: { preset: "upbeat", bpm: 118 } },
  do_not_copy: ["mascot in the corner"],
  provenance: {
    "brand.colors.bg": { source: "measured" },
    "brand.colors.primary": { source: "measured", note: "dominant accent" },
    "brand.surface": { source: "seen" },
    "brand.typography.heading": { source: "guessed" },
    "brand.transitions.default": { source: "seen" },
    "brand.transitions.duration": { source: "measured" },
    "storyboard.target_shot_seconds": { source: "measured" },
    "storyboard.visual_modes": { source: "seen" },
    "storyboard.sfx_density": { source: "guessed" },
    "audio.lufs": { source: "measured" },
    "audio.has_voice": { source: "measured" },
    "audio.music.preset": { source: "guessed" },
    "audio.music.bpm": { source: "measured" },
  },
  ...over,
});

const project = () => {
  const dir = tmp();
  writeJson(join(dir, "studio.json"), {});
  return dir;
};

test("valid style card passes schema and provenance checks", () => {
  assert.deepEqual(lib.styleErrors(card(), { slug: "demo-style" }), []);
});

test("style card without provenance or with a bad source is rejected", () => {
  const { provenance, ...noProv } = card();
  assert.ok(validateKind("style", noProv).some((e) => e.includes('missing required "provenance"')));
  const bad = card();
  bad.provenance["brand.surface"].source = "invented";
  assert.ok(validateKind("style", bad).some((e) => e.includes("brand.surface.source") || e.includes("provenance")));
});

test("fields without provenance and stray provenance entries are reported", () => {
  const c = card();
  delete c.provenance["audio.lufs"];
  c.provenance["writing.tone"] = { source: "seen" };
  const errors = lib.styleErrors(c);
  assert.ok(errors.some((e) => e.includes("missing entry for audio.lufs")));
  assert.ok(errors.some((e) => e.includes('"writing.tone" is not a field')));
});

test("slug must match its folder; unknown properties are rejected", () => {
  assert.ok(lib.styleErrors(card(), { slug: "other" }).some((e) => e.includes("does not match folder")));
  assert.ok(validateKind("style", card({ extra: 1 })).some((e) => e.includes("unknown property")));
});

test("brand patch merged over the brand template still satisfies brand.schema", () => {
  const merged = lib.mergeBrandPatch(brandTemplate(), card().brand);
  assert.equal(merged.colors.primary, "#e30613");
  assert.equal(merged.colors.accent, "#ffb547", "untouched tokens survive the merge");
  assert.deepEqual(validateKind("brand", merged), []);
  assert.deepEqual(lib.styleErrors(card(), { brand: brandTemplate() }), []);
  const broken = card();
  broken.brand.transitions.default = "cut";
  broken.brand.captions = { position: "bottom" };
  assert.deepEqual(lib.styleErrors(broken, { brand: brandTemplate() }).filter((e) => e.startsWith("merged")), []);
});

test("slugify folds Vietnamese diacritics and file extensions", () => {
  assert.equal(lib.slugify("Giới thiệu Đồng Hồ Mới!.mp4"), "gioi-thieu-dong-ho-moi");
  assert.equal(lib.slugify("   "), "style");
  assert.equal(lib.slugify(undefined), "style");
});

test("newSlug appends -2, -3 when the name is taken", () => {
  const dir = project();
  assert.equal(lib.newSlug(dir, "My Video"), "my-video");
  mkdirSync(lib.styleDir(dir, "my-video"), { recursive: true });
  assert.equal(lib.newSlug(dir, "My Video"), "my-video-2");
  mkdirSync(lib.styleDir(dir, "my-video-2"), { recursive: true });
  assert.equal(lib.newSlug(dir, "my video"), "my-video-3");
});

test("ensureGitignore writes the footage patterns once and keeps other lines", () => {
  const dir = project();
  assert.equal(lib.ensureGitignore(dir), true);
  const file = join(dir, "style-refs", ".gitignore");
  const first = readFileSync(file, "utf8");
  assert.deepEqual(first.trim().split("\n"), ["*/source.*", "*/frames/", "*/subs.vtt"]);
  assert.equal(lib.ensureGitignore(dir), false);
  assert.equal(readFileSync(file, "utf8"), first);
  writeFileSync(file, "keep-me\n*/source.*");
  assert.equal(lib.ensureGitignore(dir), true);
  assert.deepEqual(readFileSync(file, "utf8").trim().split("\n"), ["keep-me", "*/source.*", "*/frames/", "*/subs.vtt"]);
});

test("loadStyle reads a valid card and lists every problem of an invalid one", () => {
  const dir = project();
  const folder = lib.styleDir(dir, "demo-style");
  mkdirSync(folder, { recursive: true });
  assert.throws(() => lib.loadStyle(dir, "demo-style"), /No style/);
  writeJson(join(folder, "style.json"), card());
  assert.equal(lib.loadStyle(dir, "demo-style").slug, "demo-style");
  writeJson(join(folder, "style.json"), card({ slug: "x" }));
  assert.throws(() => lib.loadStyle(dir, "demo-style"), /does not match folder/);
});

test("studio schema accepts services.download and story.style, rejects a bad style slug", () => {
  const studio = readJson("examples/demo/studio.json");
  studio.services = { ...studio.services, download: true };
  studio.story = { ...studio.story, style: { slug: "demo-style", variant: "bolder" } };
  assert.deepEqual(validateKind("studio", studio), []);
  studio.story.style.slug = "Bad Slug";
  assert.ok(validateKind("studio", studio).some((e) => e.includes("story.style.slug")));
});

test("validate.mjs checks style-refs/*/style.json and ignores projects without it", () => {
  const dir = tmp();
  const init = run("init-project.mjs", dir, "--title", "T", "--lang", "vi", "--dimension", "2d", "--aspect", "16:9", "--duration", "30");
  assert.equal(init.code, 0, init.err);
  assert.equal(run("validate.mjs", dir).code, 0);
  const folder = join(dir, "style-refs", "demo-style");
  mkdirSync(folder, { recursive: true });
  writeJson(join(folder, "style.json"), card());
  const ok = run("validate.mjs", dir);
  assert.equal(ok.code, 0, ok.out);
  assert.ok(existsSync(join(folder, "style.json")) && ok.out.includes("style.json"));
  writeJson(join(folder, "style.json"), card({ version: 0 }));
  assert.equal(run("validate.mjs", dir).code, 1);
});
