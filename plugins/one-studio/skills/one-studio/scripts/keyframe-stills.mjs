#!/usr/bin/env node
// Gate 5: capture review stills (start / middle / end) per scene and one labelled contact sheet,
// plus one middle frame per scene for every other ratio in studio.json → format.exports, so portrait /
// square problems show up at review time instead of at publish.
// Only scenes that changed since their last approval (or last ratio capture) are captured unless --all.
//   node keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3] [--ratios 9:16,1:1 | --no-exports]
// Output: review/<id>/frame-*.png, review/sheet.jpg, review/<ratio>/<id>/…, review/sheet-<ratio>.jpg.
// Labels need FFmpeg's drawtext (freetype); builds without it (Homebrew FFmpeg 8) get unlabelled sheets.
import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { ENGINES, engineFor, reviewTimes } from "./lib/engines.mjs";
import { hasDrawtext } from "./lib/ffmpeg.mjs";
import { contactSheet, findFont } from "./lib/contact-sheet.mjs";
import { formatSeams, seamCheck } from "./seam-check.mjs";
import { seamPairs } from "./lib/visual-refs.mjs";
import { ratioTag, variantHash, variantRoot } from "./lib/variants.mjs";

export { contactSheet, findFont, hasDrawtext };

// Other export ratios: one middle still per scene, rendered from the resized variant (HyperFrames, lemo).
// Remotion scenes are fitted from their main clip at publish, so they have nothing new to show here.
function ratioStills(project, scenes, aspect, { all, ids }) {
  const tag = ratioTag(aspect);
  const states = new Map(project.studio.scenes.map((s) => [s.id, s]));
  const pick = scenes.filter((s) => sceneSourceExists(project, s) && sceneEngine(s, project.studio) !== "remotion")
    .filter((s) => (all || ids.length) ? !ids.length || ids.includes(s.id) : states.get(s.id)?.ratio_review?.[aspect] !== variantHash(project, s, aspect));
  if (!pick.length) return null;
  const root = pick.some((s) => sceneEngine(s, project.studio) === "hyperframes") ? variantRoot(project, aspect) : null;
  const rows = [];
  try {
    for (const scene of pick) {
      const t = reviewTimes(project, scene, 1);
      const outDir = join(project.root, "review", tag, scene.id);
      const engine = sceneEngine(scene, project.studio);
      const stills = engine === "hyperframes"
        ? ENGINES.hyperframes.stills(project, scene, t, outDir, { root, tag: `${scene.id}-${tag}`, aspect })
        : ENGINES.lemo.stills(project, scene, t, outDir, { size: ASPECTS[aspect] });
      rows.push({ id: scene.id, times: t, stills });
      const st = states.get(scene.id);
      if (st) st.ratio_review = { ...(st.ratio_review ?? {}), [aspect]: variantHash(project, scene, aspect) };
    }
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
  // Portrait/square tiles side by side (one row) reads better than one tall column.
  const flat = [{ id: "", times: rows.map((r) => r.times[0]), stills: rows.map((r) => r.stills[0]), labels: rows.map((r) => `${r.id} · ${aspect}`) }];
  const sheet = contactSheet(rows.length > 1 ? flat : rows, join(project.root, "review", `sheet-${tag}.jpg`), { tileWidth: 300 });
  return { aspect, scenes: rows.map((r) => r.id), sheet };
}

// Same-world and handoff pairs that touch a captured scene. A bad seam is a warning here (gate 5 shows it), never a failure.
function checkSeams(project, ids) {
  const pairs = seamPairs(project.storyboard ?? { scenes: [] }).filter((p) => ids.includes(p.a) || ids.includes(p.b));
  if (!pairs.length) return null;
  try {
    return seamCheck(project.root, { pairs });
  } catch (err) {
    return { rows: [], sheet: null, failed: [], warning: `seam check skipped: ${err.message.split("\n")[0]}` };
  }
}

export function keyframeStills(dir, { ids = [], all = false, frames = 3, ratios = null } = {}) {
  const project = loadProject(dir);
  const states = new Map(project.studio.scenes.map((s) => [s.id, s]));
  const scenes = (project.storyboard?.scenes ?? []).filter((s) => {
    if (ids.length) return ids.includes(s.id);
    if (all) return true;
    return states.get(s.id)?.approved_hash !== (sceneSourceExists(project, s) ? sceneHash(project, s) : null);
  });
  const rows = [];
  const skipped = [];
  for (const scene of scenes) {
    if (!sceneSourceExists(project, scene)) {
      skipped.push(`${scene.id} (no source file yet)`);
      continue;
    }
    const times = reviewTimes(project, scene, frames);
    const outDir = join(project.root, "review", scene.id);
    const stills = engineFor(project, scene).stills(project, scene, times, outDir);
    rows.push({ id: scene.id, times, stills, note: scene.type });
    const st = states.get(scene.id);
    if (st && st.status === "planned") st.status = "built";
  }
  project.save();
  let sheet = null;
  if (rows.length) {
    mkdirSync(join(project.root, "review"), { recursive: true });
    sheet = contactSheet(rows, join(project.root, "review", "sheet.jpg"));
  }
  const main = project.studio.format.aspect;
  const extra = (ratios ?? project.studio.format.exports ?? []).filter((r) => r !== main);
  for (const r of extra) if (!ASPECTS[r]) throw new Error(`unknown aspect ${r}; use ${Object.keys(ASPECTS).join(", ")}`);
  const ratioSheets = extra.map((r) => ratioStills(project, project.storyboard?.scenes ?? [], r, { all, ids })).filter(Boolean);
  project.save();
  const seams = checkSeams(project, rows.map((r) => r.id));
  rmSync(join(project.root, ".one-studio", "stage"), { recursive: true, force: true });
  return { project, rows, skipped, sheet, ratioSheets, seams, labels: Boolean(findFont()) };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["all", "no-exports", "help"], options: ["frames", "ratios"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir) {
      console.log("usage: keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3] [--ratios 9:16,1:1 | --no-exports]");
      process.exit(dir ? 0 : 1);
    }
    const ratios = args["no-exports"] ? [] : args.ratios ? args.ratios.split(",").map((s) => s.trim()) : null;
    const r = keyframeStills(dir, { ids, all: args.all, frames: Number(args.frames ?? 3), ratios });
    if (!r.rows.length) console.log("No scenes to review (all approved and unchanged). Use --all to capture everything.");
    for (const row of r.rows) console.log(`✓ ${row.id}: ${row.stills.length} still(s) at ${row.times.join(", ")}s`);
    for (const s of r.skipped) console.log(`· skipped ${s}`);
    for (const x of r.ratioSheets) console.log(`✓ ${x.aspect}: ${x.scenes.join(", ")} → ${relative(process.cwd(), x.sheet) || x.sheet}`);
    if (!r.labels && (r.sheet || r.ratioSheets.length)) console.log("· this FFmpeg has no drawtext (freetype): sheets are unlabelled; rows follow storyboard order");
    if (r.seams?.warning) console.log(`· ${r.seams.warning}`);
    if (r.seams?.rows.length) {
      console.log(formatSeams(r.seams));
      console.log(`Seams sheet: ${relative(process.cwd(), r.seams.sheet) || r.seams.sheet}`);
      if (r.seams.failed.length) console.log(`! ${r.seams.failed.length} same-world seam(s) above ${(r.seams.threshold * 100).toFixed(1)}%: make the camera/state at the end of one scene equal the start of the next`);
    }
    if (r.sheet) console.log(`Contact sheet: ${relative(process.cwd(), r.sheet) || r.sheet}\nShow it to the user, then: status.mjs <dir> --approve-scenes <ids|all>`);
    if (r.ratioSheets.length) console.log("Export ratios are for review only (approval follows the main ratio). Fix them with <style data-ratio=\"9:16\"> blocks: the main ratio's approval and clips stay valid.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
