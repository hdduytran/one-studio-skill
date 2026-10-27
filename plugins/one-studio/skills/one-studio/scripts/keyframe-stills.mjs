#!/usr/bin/env node
// Gate 5: capture review stills (start / middle / end) per scene and one labelled contact sheet,
// plus one middle frame per scene for every other ratio in studio.json → format.exports, so portrait /
// square problems show up at review time instead of at publish.
// Only scenes that changed since their last approval (or last ratio capture) are captured unless --all.
//   node keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3] [--ratios 9:16,1:1 | --no-exports]
//   node keyframe-stills.mjs <project-dir> <scene-id…> --at 12.4,13.6     stills at chosen scene times (seconds)
// Output: review/<id>/frame-*.png, review/sheet.jpg, review/<ratio>/<id>/…, review/sheet-<ratio>.jpg.
// --at: review/at/<id>/frame-*.png + review/sheet-at.jpg; no ratio stills, seams or studio.json change.
// Sheets hold at most 12 scenes and are ≤ 1200 px wide; longer videos get sheet-1.jpg, sheet-2.jpg …
// Labels need FFmpeg's drawtext (freetype); builds without it (Homebrew FFmpeg 8) get unlabelled sheets.
import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { ENGINES, engineFor, reviewTimes } from "./lib/engines.mjs";
import { hasDrawtext } from "./lib/ffmpeg.mjs";
import { contactSheet, contactSheets, findFont, overviewSheets } from "./lib/contact-sheet.mjs";
import { effectiveDuration } from "./lib/scenes.mjs";
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
  // Portrait/square tiles in a grid read better than one tall column (≤ 12 scenes, ≤ 1200 px per sheet).
  const sheets = overviewSheets(rows.map((r) => ({ still: r.stills[0], label: `${r.id} · ${aspect}` })), join(project.root, "review", `sheet-${tag}.jpg`), { tileWidth: 300 });
  return { aspect, scenes: rows.map((r) => r.id), sheet: sheets[0], sheets };
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

// "12.4,13.6" / "12.4s, 13.6" → [12.4, 13.6]
export function parseAt(spec) {
  const parts = String(spec ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) throw new Error("--at needs scene times in seconds, e.g. --at 12.4,13.6");
  return parts.map((p) => {
    const m = /^(\d+(?:\.\d+)?|\.\d+)s?$/.exec(p);
    if (!m) throw new Error(`--at: "${p}" is not a time in seconds (e.g. 12.4)`);
    return Number(m[1]);
  });
}

// Stills at chosen scene-relative times, for the named scenes only. Times past a scene's end are refused.
export function stillsAt(dir, ids, times) {
  const project = loadProject(dir);
  if (!ids.length) throw new Error("--at needs the scene id(s): keyframe-stills.mjs <dir> <scene-id> --at 12.4,13.6");
  const scenes = project.storyboard?.scenes ?? [];
  const unknown = ids.filter((id) => !scenes.some((s) => s.id === id));
  if (unknown.length) throw new Error(`not in storyboard.json: ${unknown.join(", ")}`);
  const rows = [];
  for (const scene of scenes.filter((s) => ids.includes(s.id))) {
    if (!sceneSourceExists(project, scene)) throw new Error(`${scene.id}: no source file yet`);
    const d = effectiveDuration(project, scene);
    const late = times.filter((t) => t > d);
    if (late.length) throw new Error(`${scene.id} is ${d}s long: ${late.join(", ")}s is past its end (times are seconds into the scene)`);
    const outDir = join(project.root, "review", "at", scene.id);
    rows.push({ id: scene.id, times, stills: engineFor(project, scene).stills(project, scene, times, outDir) });
  }
  const sheets = contactSheets(rows, join(project.root, "review", "sheet-at.jpg"));
  rmSync(join(project.root, ".one-studio", "stage"), { recursive: true, force: true });
  return { rows, sheets, labels: Boolean(findFont()) };
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
  let sheets = [];
  if (rows.length) {
    mkdirSync(join(project.root, "review"), { recursive: true });
    sheets = contactSheets(rows, join(project.root, "review", "sheet.jpg"));
  }
  const sheet = sheets[0] ?? null;
  const main = project.studio.format.aspect;
  const extra = (ratios ?? project.studio.format.exports ?? []).filter((r) => r !== main);
  for (const r of extra) if (!ASPECTS[r]) throw new Error(`unknown aspect ${r}; use ${Object.keys(ASPECTS).join(", ")}`);
  const ratioSheets = extra.map((r) => ratioStills(project, project.storyboard?.scenes ?? [], r, { all, ids })).filter(Boolean);
  project.save();
  const seams = checkSeams(project, rows.map((r) => r.id));
  rmSync(join(project.root, ".one-studio", "stage"), { recursive: true, force: true });
  return { project, rows, skipped, sheet, sheets, ratioSheets, seams, labels: Boolean(findFont()) };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["all", "no-exports", "help"], options: ["frames", "ratios", "at"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir) {
      console.log("usage: keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3] [--ratios 9:16,1:1 | --no-exports]\n       keyframe-stills.mjs <project-dir> <scene-id…> --at 12.4,13.6");
      process.exit(dir ? 0 : 1);
    }
    if (args.at != null) {
      const r = stillsAt(dir, ids, parseAt(args.at));
      for (const row of r.rows) console.log(`✓ ${row.id}: ${row.stills.length} still(s) at ${row.times.join(", ")}s → ${relative(process.cwd(), join(row.stills[0], "..")) || "."}`);
      for (const f of r.sheets) console.log(`Sheet: ${relative(process.cwd(), f) || f}`);
      process.exit(0);
    }
    const ratios = args["no-exports"] ? [] : args.ratios ? args.ratios.split(",").map((s) => s.trim()) : null;
    const r = keyframeStills(dir, { ids, all: args.all, frames: Number(args.frames ?? 3), ratios });
    if (!r.rows.length) console.log("No scenes to review (all approved and unchanged). Use --all to capture everything.");
    for (const row of r.rows) console.log(`✓ ${row.id}: ${row.stills.length} still(s) at ${row.times.join(", ")}s`);
    for (const s of r.skipped) console.log(`· skipped ${s}`);
    for (const x of r.ratioSheets) console.log(`✓ ${x.aspect}: ${x.scenes.join(", ")} → ${x.sheets.map((f) => relative(process.cwd(), f) || f).join(", ")}`);
    if (!r.labels && (r.sheet || r.ratioSheets.length)) console.log("· this FFmpeg has no drawtext (freetype): sheets are unlabelled; rows follow storyboard order");
    if (r.seams?.warning) console.log(`· ${r.seams.warning}`);
    if (r.seams?.rows.length) {
      console.log(formatSeams(r.seams));
      console.log(`Seams sheet: ${relative(process.cwd(), r.seams.sheet) || r.seams.sheet}`);
      if (r.seams.failed.length) console.log(`! ${r.seams.failed.length} same-world seam(s) above ${(r.seams.threshold * 100).toFixed(1)}%: make the camera/state at the end of one scene equal the start of the next`);
    }
    if (r.sheet) console.log(`Contact sheet${r.sheets.length > 1 ? `s (${r.sheets.length}, ≤ 12 scenes each)` : ""}: ${r.sheets.map((f) => relative(process.cwd(), f) || f).join(", ")}\nShow ${r.sheets.length > 1 ? "them" : "it"} to the user, then: status.mjs <dir> --approve-scenes <ids|all>`);
    if (r.ratioSheets.length) console.log("Export ratios are for review only (approval follows the main ratio). Fix them with <style data-ratio=\"9:16\"> blocks: the main ratio's approval and clips stay valid.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
