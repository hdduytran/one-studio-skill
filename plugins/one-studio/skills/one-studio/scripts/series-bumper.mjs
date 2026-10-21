#!/usr/bin/env node
// Save an approved scene of this episode as the series intro or outro. Later episodes created with
// init-project.mjs --series get it automatically (first/last scene, same look every episode).
//   node series-bumper.mjs <project-dir> <scene-id> --as intro|outro
// The scene may only use brand assets (logo, fonts) — project assets are not carried over.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain, loadProject, parseArgs, sceneEngine, validateKind, writeJson } from "./lib/project.mjs";
import { effectiveDuration, sceneFile } from "./lib/scenes.mjs";

export function toTemplate(html, { id, duration, width, height }) {
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html
    .replace(new RegExp(`data-composition-id="${esc(id)}"`, "g"), 'data-composition-id="{{id}}"')
    .replace(new RegExp(`OS\\.scene\\("${esc(id)}"\\)`, "g"), 'OS.scene("{{id}}")')
    .replace(new RegExp(`data-duration="${esc(duration)}"`, "g"), 'data-duration="{{duration}}"')
    .replace(new RegExp(`data-width="${width}"`, "g"), 'data-width="{{width}}"')
    .replace(new RegExp(`data-height="${height}"`, "g"), 'data-height="{{height}}"')
    .replace(new RegExp(`width=${width}, height=${height}`, "g"), "width={{width}}, height={{height}}")
    .replace(new RegExp(`--w:\\s*${width}px`, "g"), "--w: {{width}}px")
    .replace(new RegExp(`--h:\\s*${height}px`, "g"), "--h: {{height}}px");
}

export function saveBumper(dir, id, kind) {
  if (!["intro", "outro"].includes(kind)) throw new Error("--as must be intro or outro");
  const project = loadProject(dir);
  const scene = project.storyboard?.scenes?.find((s) => s.id === id);
  if (!scene) throw new Error(`scene ${id} is not in storyboard.json`);
  if (sceneEngine(scene, project.studio) !== "hyperframes") throw new Error("only HyperFrames scenes can be series bumpers");
  const html = readFileSync(sceneFile(project, id), "utf8");
  const assets = [...html.matchAll(/\.\.\/assets\/([^"')]+)/g)].map((m) => m[1]).filter((a) => !/^(vendor|fonts|brand|lottie)\/|^(brand|os)\.(css|js)$/.test(a));
  if (assets.length) throw new Error(`scene ${id} uses project assets (${[...new Set(assets)].join(", ")}); bumpers may only use brand assets`);
  const duration = effectiveDuration(project, scene);
  const { width, height } = project.studio.format;
  const tpl = toTemplate(html, { id, duration, width, height });
  const brandDir = dirname(project.brandPath);
  writeFileSync(join(brandDir, `${kind}.html`), tpl);
  const brand = project.brand;
  brand[kind] = { enabled: true, template: `${kind}.html`, duration };
  const errors = validateKind("brand", brand);
  if (errors.length) throw new Error(errors.join("\n"));
  writeJson(project.brandPath, brand);
  return { file: join(brandDir, `${kind}.html`), duration };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["as"] });
    const [dir, id] = args._;
    if (args.help || !dir || !id || !args.as) {
      console.log("usage: series-bumper.mjs <project-dir> <scene-id> --as intro|outro");
      process.exit(args.help ? 0 : 1);
    }
    const r = saveBumper(dir, id, args.as);
    console.log(`✓ series ${args.as} saved: ${r.file} (${r.duration}s). New episodes start${args.as === "outro" ? "/end" : ""} with it.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
