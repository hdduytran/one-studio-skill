// The user library: where it is found, presets (library first, cache still read), mockup kits in scenes,
// custom playbooks next to the built-in ones, and the seeded example library (examples/library).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, run, tmp, writeJson } from "./helpers.mjs";

process.env.ONE_STUDIO_CACHE = tmp();
delete process.env.ONE_STUDIO_LIBRARY;

const S = "../plugins/one-studio/skills/one-studio/scripts";
const { findLibrary } = await import(`${S}/lib/library.mjs`);
const presets = await import(`${S}/lib/presets.mjs`);
const { listKits, loadKit } = await import(`${S}/lib/kits.mjs`);
const { listPlaybooks, PLAYBOOK_HEADINGS } = await import(`${S}/lib/playbooks.mjs`);
const { sceneHash } = await import(`${S}/lib/hash.mjs`);
const { loadProject, validateKind } = await import(`${S}/lib/project.mjs`);

const EXAMPLE = "examples/library";
// A video-factory-like folder: library/ beside the projects.
function factory() {
  const root = tmp();
  cpSync(EXAMPLE, join(root, "library"), { recursive: true });
  return root;
}

test("lookup order: ONE_STUDIO_LIBRARY, then one-studio.library.json or library/ above the project, then the cache", () => {
  const root = factory();
  const project = join(root, "videos", "ep1");
  assert.deepEqual(findLibrary(project, {}), { root: join(root, "library"), source: "folder" });
  mkdirSync(join(root, "videos"));
  writeJson(join(root, "videos", "one-studio.library.json"), { path: "../library" });
  const viaFile = findLibrary(project, {});
  assert.equal(viaFile.source, "file");
  assert.equal(viaFile.root, join(root, "library"));
  assert.equal(findLibrary(project, { ONE_STUDIO_LIBRARY: "/x/lib" }).root, "/x/lib");
  // A folder named Library (macOS ~/Library on a case-insensitive disk) is never taken for library/.
  const mac = tmp();
  mkdirSync(join(mac, "Library", "presets"), { recursive: true });
  assert.equal(findLibrary(join(mac, "p"), {}).source, "cache");
  // library/ without presets, kits or playbooks is just a folder.
  const plain = tmp();
  mkdirSync(join(plain, "library", "docs"), { recursive: true });
  assert.equal(findLibrary(join(plain, "p"), {}).source, "cache");
});

test("presets: the library's are listed next to the plugin's, win over the cache, and the cache is still read", () => {
  const root = factory();
  const from = join(root, "p");
  const entry = (bg) => ({ about: "x", surface: "flat", colors: { bg, fg: "#111111", primary: "#e30613", accent: "#f2c200" } });
  mkdirSync(join(process.env.ONE_STUDIO_CACHE, "presets"), { recursive: true });
  writeJson(join(process.env.ONE_STUDIO_CACHE, "presets", "old-look.json"), entry("#000000"));
  writeJson(join(process.env.ONE_STUDIO_CACHE, "presets", "claude-duet-light.json"), entry("#ffffff"));
  const { presets: all, origin } = presets.scanPresets({ from });
  assert.equal(origin["claude-duet-light"].source, "library");
  assert.equal(all["claude-duet-light"].colors.surface, "#faf9f5", "the library copy wins");
  assert.equal(origin["old-look"].source, "cache", "presets saved before the library still load");
  assert.equal(origin.default.source, "plugin");
  const saved = presets.savePreset("new-look", entry("#222222"), { from });
  assert.equal(saved.file, join(root, "library", "presets", "new-look.json"));
  assert.throws(() => presets.savePreset("apple-light", entry("#222222"), { from }), /plugin preset/);
});

test("init-project --preset takes a library preset (surface kept); --save-preset stores a project's look", () => {
  const root = factory();
  const dir = join(root, "ep1");
  assert.match(run("init-project.mjs", "--help", dir).out, /claude-duet-light/);
  const r = run("init-project.mjs", dir, "--lang", "vi", "--preset", "claude-duet-light");
  assert.equal(r.code, 0, r.err);
  const brand = readJson(join(dir, "brand", "brand.json"));
  assert.equal(brand.colors.surface, "#faf9f5");
  assert.equal(brand.typography.heading.family, "Fraunces");
  const saved = run("library.mjs", dir, "--save-preset", "ep1-look", "--about", "Episode one");
  assert.equal(saved.code, 0, saved.err);
  const preset = readJson(join(root, "library", "presets", "ep1-look.json"));
  assert.equal(preset.about, "Episode one");
  assert.equal(preset.colors.surface, "#faf9f5");
  assert.ok(!("logo" in preset) && !("version" in preset));
  assert.deepEqual(validateKind("brand", presets.applyPreset(brand, "ep1-look", { from: dir })), []);
  assert.match(run("compare-presets.mjs", dir, "--help").out + run("library.mjs", dir, "--presets").out, /ep1-look\s+library/);
});

test("the seeded kit: nine brand-variable components that the lint finds clean", () => {
  const kit = loadKit({ root: EXAMPLE }, "claude-duet");
  assert.equal(kit.components.length, 9);
  assert.deepEqual(kit.issues, []);
  assert.equal(kit.preset, "claude-duet-light");
  assert.match(kit.css, /--cream: var\(--c-surface, /);
  for (const c of kit.components) assert.ok(c.title, `${c.name} has a title`);
  // A literal colour is reported.
  const lib = tmp();
  cpSync(join(EXAMPLE, "kits"), join(lib, "kits"), { recursive: true });
  writeFileSync(join(lib, "kits", "claude-duet", "components", "bad.html"), '<div style="color: #ff0000"></div>\n');
  assert.match(listKits({ root: lib })[0].issues.join(), /bad\.html: literal colour #ff0000/);
});

test("new-scene --kit: the kit CSS goes into the scene, a component starts it, and a kit change refreshes on request", () => {
  const root = factory();
  const dir = join(root, "ep1");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [{ id: "s01", type: "text", duration: 3, lines: [] }, { id: "s02", type: "text", duration: 3, lines: [] }] });
  const a = run("new-scene.mjs", dir, "s01", "--kit", "claude-duet", "--component", "phone-chat-thread");
  assert.equal(a.code, 0, a.err);
  const s01 = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
  assert.match(s01, /<style data-kit="claude-duet">[\s\S]*\.phone \{[\s\S]*<\/style>\n<\/head>/);
  assert.match(s01, /<div class="os-kit" data-component="phone-chat-thread">[\s\S]*class="bubble me"/);
  assert.ok(!s01.includes("{{"), "every placeholder filled");
  assert.equal(run("new-scene.mjs", dir, "s02", "--component", "x").code, 1, "--component needs --kit");
  assert.match(run("new-scene.mjs", dir, "s02", "--kit", "nope").err, /no kit "nope".*kits: claude-duet/);

  const before = sceneHash(loadProject(dir), { id: "s01", type: "text", duration: 3 });
  assert.match(run("new-scene.mjs", dir, "s01", "--kit", "claude-duet").out, /already current/);
  const css = join(root, "library", "kits", "claude-duet", "kit.css");
  writeFileSync(css, readFileSync(css, "utf8") + "  .chip { letter-spacing: 0.01em; }\n");
  assert.match(run("validate.mjs", dir).out, /! scene s01: kit claude-duet changed since the scene copied it/);
  assert.match(run("new-scene.mjs", dir, "s01", "--kit", "claude-duet").out, /styles refreshed/);
  const after = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
  assert.equal(after.match(/data-kit=/g).length, 1, "the block is replaced, not added twice");
  assert.match(after, /letter-spacing: 0\.01em/);
  assert.notEqual(sceneHash(loadProject(dir), { id: "s01", type: "text", duration: 3 }), before, "the kit is part of the scene hash");
  assert.equal(run("validate.mjs", dir).code, 0);

  const g = run("library.mjs", dir, "--kit-gallery", "claude-duet");
  assert.equal(g.code, 0, g.err);
  const page = readFileSync(join(dir, "review", "kit-claude-duet.html"), "utf8");
  for (const c of loadKit({ root: join(root, "library") }, "claude-duet").components) assert.ok(page.includes(`data-component="${c.name}"`), c.name);
  assert.match(page, /--c-surface: #?[0-9a-f]*|--c-bg/);
});

test("playbooks: library ones are listed after the built-in ones; a built-in id is never replaced", () => {
  const root = factory();
  const lib = { root: join(root, "library") };
  const { playbooks } = listPlaybooks(lib);
  const mine = playbooks.find((p) => p.id === "product-launch-short");
  assert.equal(mine.source, "library");
  assert.match(mine.signals, /waitlist/);
  assert.deepEqual(mine.issues, []);
  assert.equal(playbooks.filter((p) => p.source === "built-in").length, 14);
  writeFileSync(join(root, "library", "playbooks", "saas-product.md"), "# mine\n");
  const again = listPlaybooks(lib);
  assert.equal(again.playbooks.find((p) => p.id === "saas-product").source, "built-in");
  assert.deepEqual(again.skipped.map((p) => p.id), ["saas-product"]);
  assert.match(run("library.mjs", join(root, "p"), "--playbooks").out, /product-launch-short\s+library[\s\S]*saas-product\.md skipped/);
});

test("the seeded playbook follows the built-in format", () => {
  const text = readFileSync(join(EXAMPLE, "playbooks", "product-launch-short.md"), "utf8");
  assert.ok(text.trimEnd().split("\n").length <= 90);
  assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()), PLAYBOOK_HEADINGS);
  const hooks = /## Hook types\n\n([\s\S]*?)\n\n## /.exec(text)[1].split("\n").filter((l) => l.startsWith("- "));
  assert.equal(hooks.length, 3);
});

test("library.mjs --init creates the folders; --import-cache copies old cache presets without overwriting", () => {
  const root = tmp();
  const r = run("library.mjs", "--init", join(root, "library"));
  assert.equal(r.code, 0, r.err);
  for (const part of ["presets", "kits", "playbooks"]) assert.ok(existsSync(join(root, "library", part)), part);
  mkdirSync(join(process.env.ONE_STUDIO_CACHE, "presets"), { recursive: true });
  writeJson(join(process.env.ONE_STUDIO_CACHE, "presets", "from-cache.json"), { about: "c", surface: "flat", colors: { bg: "#000000", fg: "#ffffff", primary: "#ff0000", accent: "#00ff00" } });
  const out = run("library.mjs", join(root, "p"), "--import-cache").out;
  assert.match(out, /from-cache/);
  assert.ok(existsSync(join(root, "library", "presets", "from-cache.json")));
  assert.equal(run("library.mjs", join(tmp(), "p"), "--import-cache").code, 1, "no library: refuses");
});
