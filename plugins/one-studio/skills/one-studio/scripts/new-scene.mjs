#!/usr/bin/env node
// Scaffold scenes/<id>.html from its storyboard entry and the type template (HyperFrames scenes only).
// Existing files are kept unless --force. Then edit content/timeline; never restyle with literal colours.
//   node new-scene.mjs <project-dir> <scene-id…|--all> [--force] [--kit <kit> [--component <name>]]
// --kit copies <library>/kits/<kit>/kit.css into the scene (<style data-kit>); on an existing scene it only
// refreshes that block. --component starts a new scene (or --force) from one of the kit's components.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { TEMPLATE_DIR, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { buildIndex, effectiveDuration, renderSceneTemplate, sceneFile } from "./lib/scenes.mjs";
import { findLibrary } from "./lib/library.mjs";
import { loadKit, withKit } from "./lib/kits.mjs";

export function newScenes(dir, ids, { force = false, kit: kitName = null, component = null } = {}) {
  const project = loadProject(dir);
  if (component && !kitName) throw new Error("--component needs --kit <kit>");
  const kit = kitName ? loadKit(findLibrary(project.root), kitName) : null;
  const scenes = project.storyboard?.scenes ?? [];
  const pick = ids === "all" ? scenes.filter((s) => sceneEngine(s, project.studio) !== "remotion") : ids.map((id) => {
    const s = scenes.find((x) => x.id === id);
    if (!s) throw new Error(`scene ${id} is not in storyboard.json`);
    return s;
  });
  const out = [];
  for (const scene of pick) {
    const engine = sceneEngine(scene, project.studio);
    if (engine === "lemo") {
      out.push(newLemoScene(project, scene, force));
      continue;
    }
    if (engine === "remotion") throw new Error(`scene ${scene.id} renders with Remotion: use new-remotion.mjs`);
    const path = sceneFile(project, scene.id);
    if (scene.world) ensureWorldFile(project, scene.world);
    if (existsSync(path) && !force) {
      if (kit && !component) {
        const html = readFileSync(path, "utf8");
        const next = withKit(html, kit);
        if (next !== html) writeFileSync(path, next);
        out.push({ id: scene.id, path, created: false, kit: next !== html ? "refreshed" : "unchanged" });
      } else out.push({ id: scene.id, path, created: false });
      continue;
    }
    writeFileSync(path, renderSceneTemplate(project, scene, { kit, component }));
    out.push({ id: scene.id, path, created: true, kit: kit ? "added" : null });
  }
  buildIndex(project);
  return out;
}

// worlds/<name>.html is shared by every scene of that world: start it from the basic template, never overwrite it.
function ensureWorldFile(project, name) {
  const file = resolve(project.root, project.storyboard.worlds?.[name]?.file ?? `worlds/${name}.html`);
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(join(TEMPLATE_DIR, "worlds", "basic.html"), file);
}

// Character scene: a lemo-opuscar page folder scenes/<id>/ with its own copy of the brand tokens
// (lemo serves the folder on its own, so it cannot reach ../assets).
function newLemoScene(project, scene, force) {
  const dir = join(project.root, "scenes", scene.id);
  const path = join(dir, "index.html");
  mkdirSync(dir, { recursive: true });
  const brandJs = join(project.root, "assets", "brand.js");
  if (existsSync(brandJs)) copyFileSync(brandJs, join(dir, "brand.js"));
  if (existsSync(path) && !force) return { id: scene.id, path, created: false };
  const vars = { id: scene.id, lang: project.studio.meta.language, style: scene.character?.style ?? "", duration: effectiveDuration(project, scene) };
  const html = readFileSync(join(TEMPLATE_DIR, "lemo-scene", "index.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  writeFileSync(path, html);
  return { id: scene.id, path, created: true };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["all", "force", "help"], options: ["kit", "component"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir || (!args.all && !ids.length)) {
      console.log("usage: new-scene.mjs <project-dir> <scene-id…|--all> [--force] [--kit <kit> [--component <name>]]\n       kits and components: library.mjs <project-dir> --kits");
      process.exit(args.help ? 0 : 1);
    }
    for (const r of newScenes(dir, args.all ? "all" : ids, { force: args.force, kit: args.kit, component: args.component })) {
      const kitNote = r.kit === "refreshed" ? ` (kit ${args.kit} styles refreshed: the scene re-opens for review)` : r.kit === "unchanged" ? ` (kit ${args.kit} already current)` : r.kit === "added" ? ` (kit ${args.kit}${args.component ? `, component ${args.component}` : ""})` : "";
      console.log(`${r.created ? "✓ created" : "· kept   "} ${r.path}${kitNote}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
