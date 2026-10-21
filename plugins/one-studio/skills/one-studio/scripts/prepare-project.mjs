#!/usr/bin/env node
// Install the HyperFrames scene runtime into a project (idempotent; re-run after any brand change):
//   hyperframes.json, assets/os.css, assets/os.js, assets/vendor/gsap.min.js (+ lottie when needed),
//   assets/brand.css + brand.js (from brand.json), optimised assets, index.html preview.
//   node prepare-project.mjs <project-dir> [--offline] [--no-svgo]
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { buildIndex } from "./lib/scenes.mjs";
import { vendorGsap, vendorLottie, vendorThree } from "./lib/vendor.mjs";
import { brandToCss } from "./brand-to-css.mjs";
import { optimizeAssets } from "./optimize-assets.mjs";

export function prepareProject(dir, { offline = false, svgo = true } = {}) {
  const project = loadProject(dir);
  const tpl = join(TEMPLATE_DIR, "hyperframes-project");
  const assets = join(project.root, "assets");
  mkdirSync(join(project.root, "scenes"), { recursive: true });
  mkdirSync(assets, { recursive: true });
  if (!existsSync(join(project.root, "hyperframes.json"))) copyFileSync(join(tpl, "hyperframes.json"), join(project.root, "hyperframes.json"));
  for (const f of ["os.css", "os.js"]) copyFileSync(join(tpl, "assets", f), join(assets, f));
  vendorGsap(assets);
  const types = new Set((project.storyboard?.scenes ?? []).map((s) => s.type));
  if (types.has("lottie")) vendorLottie(assets);
  if (types.has("3d")) vendorThree(assets);
  const brand = brandToCss(project, { offline });
  // Character (lemo) scenes carry their own copy of the brand tokens.
  for (const s of project.storyboard?.scenes ?? []) {
    const dir = join(project.root, "scenes", s.id);
    if (sceneEngine(s, project.studio) === "lemo" && existsSync(dir)) copyFileSync(join(assets, "brand.js"), join(dir, "brand.js"));
  }
  const opt = optimizeAssets(project.root, { svgo });
  const index = buildIndex(project);
  return { project, brand, opt, index };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["offline", "no-svgo", "help"] });
    if (args.help || !args._[0]) {
      console.log("usage: prepare-project.mjs <project-dir> [--offline] [--no-svgo]");
      process.exit(args._[0] ? 0 : 1);
    }
    const r = prepareProject(args._[0], { offline: args.offline, svgo: !args["no-svgo"] });
    console.log(`✓ runtime installed in ${r.project.root}`);
    console.log(`  brand ${r.project.brand.name} v${r.project.brand.version}, ${r.brand.fonts} font block(s)`);
    console.log(`  assets: ${r.opt.svg.length} svg optimised, lottie: ${r.opt.lottie.join(", ") || "none"}`);
    console.log(`  index.html: ${r.index.scenes} scene(s), ${r.index.duration.toFixed(1)}s`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
