#!/usr/bin/env node
// Brand presets side by side: the same scenes rendered once per preset into one contact sheet.
//   node compare-presets.mjs <project-dir> [--presets apple-light,synthwave] [--scenes s01,s03] [--at 0.6] [--offline]
//        → review/presets.jpg (row = preset, column = scene) — show it, ask which one
//   node compare-presets.mjs <project-dir> --apply <preset>
//        → brand.json takes the preset's colours, surface and fonts, version +1 (every scene re-renders: ask first)
// Works on staged copies under .one-studio/presets/; the project's assets and approvals are untouched.
// Fonts come from the local @fontsource cache (--offline: fallbacks only, no fetch).
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { isMain, loadProject, parseArgs, sceneEngine, writeJson } from "./lib/project.mjs";
import { applyPreset, loadPresets } from "./lib/presets.mjs";
import { buildIndex, sceneFile } from "./lib/scenes.mjs";
import { snapshotStills, stageBrand } from "./lib/stage-brand.mjs";
import { contactSheet } from "./keyframe-stills.mjs";

export function comparePresets(dir, { presets = null, ids = null, at = 0.6, offline = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  if (!project.brand) throw new Error("brand.json not found");
  const all = loadPresets();
  const names = presets ?? Object.keys(all);
  for (const n of names) if (!all[n]) throw new Error(`unknown preset ${n}; use ${Object.keys(all).join(", ")}`);
  const hf = (project.storyboard?.scenes ?? []).filter((s) => sceneEngine(s, project.studio) === "hyperframes" && existsSync(sceneFile(project, s.id)));
  const scenes = ids ? hf.filter((s) => ids.includes(s.id)) : hf.slice(0, 4);
  if (!scenes.length) throw new Error("no HyperFrames scene files to compare yet (gate 5: new-scene.mjs, write the scenes)");
  const sceneIds = scenes.map((s) => s.id);
  const rows = [];
  const warnings = [];
  for (const name of names) {
    const brand = { ...applyPreset(project.brand, name), name: `${project.brand.name} · ${name}` };
    const { root, warning } = stageBrand(project, {
      root: join(project.root, ".one-studio", "presets", name),
      brand,
      scenes: sceneIds.map((id) => ({ id, file: sceneFile(project, id) })),
      offline,
      label: name,
    });
    if (warning) warnings.push(warning);
    const index = buildIndex(project, { outDir: root, ids: sceneIds });
    const times = sceneIds.map((id) => Math.round((index.starts[id].start + index.starts[id].duration * at) * 100) / 100);
    const stills = snapshotStills(project, root, times);
    rows.push({ id: name, times, stills, labels: sceneIds.map((id) => `${name} · ${id}`) });
    log(`✓ ${name}`);
  }
  mkdirSync(join(project.root, "review"), { recursive: true });
  const sheet = contactSheet(rows, join(project.root, "review", "presets.jpg"), { tileWidth: project.studio.format.width >= project.studio.format.height ? 400 : 240 });
  rmSync(join(project.root, ".one-studio", "presets"), { recursive: true, force: true });
  return { sheet, presets: names, scenes: sceneIds, warnings };
}

export function applyPresetToProject(dir, name) {
  const project = loadProject(dir);
  const next = applyPreset(project.brand, name);
  next.version = (project.brand.version ?? 1) + 1;
  writeJson(project.brandPath, next);
  return { brandPath: project.brandPath, version: next.version, series: project.studio.meta.series };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["offline", "help"], options: ["presets", "scenes", "at", "apply"] });
    const dir = args._[0];
    if (args.help || !dir) {
      console.log("usage: compare-presets.mjs <project-dir> [--presets a,b] [--scenes s01,s02] [--at 0.6] [--offline] | --apply <preset>");
      process.exit(dir ? 0 : 1);
    }
    if (args.apply) {
      const r = applyPresetToProject(dir, args.apply);
      console.log(`✓ ${args.apply} → ${r.brandPath} (version ${r.version})${r.series ? ` — shared by series ${r.series}` : ""}`);
      console.log("  Every scene hash changes: prepare-project.mjs, then keyframe-stills.mjs and re-approve (ask the user first).");
    } else {
      const r = comparePresets(dir, {
        presets: args.presets ? args.presets.split(",").map((s) => s.trim()) : null,
        ids: args.scenes ? args.scenes.split(",").map((s) => s.trim()) : null,
        at: args.at ? Number(args.at) : 0.6,
        offline: args.offline,
        log: console.log,
      });
      for (const w of r.warnings) console.log(`⚠ ${w}`);
      console.log(`Sheet: ${relative(process.cwd(), r.sheet) || r.sheet}  (rows: ${r.presets.join(", ")}; columns: ${r.scenes.join(", ")})`);
      console.log("Show it to the user; apply the pick with --apply <preset>.");
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
