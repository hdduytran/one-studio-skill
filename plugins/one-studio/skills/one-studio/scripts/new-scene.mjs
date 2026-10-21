#!/usr/bin/env node
// Scaffold scenes/<id>.html from its storyboard entry and the type template (HyperFrames scenes only).
// Existing files are kept unless --force. Then edit content/timeline; never restyle with literal colours.
//   node new-scene.mjs <project-dir> <scene-id|--all> [--force]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { buildIndex, effectiveDuration, renderSceneTemplate, sceneFile } from "./lib/scenes.mjs";

export function newScenes(dir, ids, { force = false } = {}) {
  const project = loadProject(dir);
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
    if (existsSync(path) && !force) {
      out.push({ id: scene.id, path, created: false });
      continue;
    }
    writeFileSync(path, renderSceneTemplate(project, scene));
    out.push({ id: scene.id, path, created: true });
  }
  buildIndex(project);
  return out;
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
    const args = parseArgs(process.argv.slice(2), { flags: ["all", "force", "help"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir || (!args.all && !ids.length)) {
      console.log("usage: new-scene.mjs <project-dir> <scene-id…|--all> [--force]");
      process.exit(args.help ? 0 : 1);
    }
    for (const r of newScenes(dir, args.all ? "all" : ids, { force: args.force })) {
      console.log(`${r.created ? "✓ created" : "· kept   "} ${r.path}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
