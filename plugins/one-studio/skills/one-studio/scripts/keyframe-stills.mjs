#!/usr/bin/env node
// Gate 5: capture review stills (start / middle / end) per scene and one labelled contact sheet,
// plus one middle frame per scene for every other ratio in studio.json → format.exports, so portrait /
// square problems show up at review time instead of at publish.
// Only scenes that changed since their last approval (or last ratio capture) are captured unless --all.
//   node keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3] [--ratios 9:16,1:1 | --no-exports]
// Output: review/<id>/frame-*.png, review/sheet.jpg, review/<ratio>/<id>/…, review/sheet-<ratio>.jpg.
// Labels need FFmpeg's drawtext (freetype); builds without it (Homebrew FFmpeg 8) get unlabelled sheets.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { ENGINES, engineFor, reviewTimes } from "./lib/engines.mjs";
import { hasDrawtext, run } from "./lib/ffmpeg.mjs";
import { ratioTag, variantHash, variantRoot } from "./lib/variants.mjs";

export { hasDrawtext };

// A font for the labels, or null when this FFmpeg cannot draw text at all.
export function findFont() {
  if (!hasDrawtext()) return null;
  for (const f of ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]) {
    if (existsSync(f)) return f;
  }
  try {
    return execFileSync("fc-match", ["-f", "%{file}", "sans:bold"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

// One row per scene: its stills side by side, labelled "<id> · <t>s".
export function contactSheet(rows, out, { tileWidth = 480 } = {}) {
  const font = findFont();
  const cols = Math.max(...rows.map((r) => r.stills.length));
  const inputs = [];
  const filters = [];
  let n = 0;
  rows.forEach((row, ri) => {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const still = row.stills[c] ?? row.stills[row.stills.length - 1];
      inputs.push("-i", still);
      const label = row.labels?.[c] ?? `${row.id} · ${row.times[c] ?? ""}s${row.note ? ` · ${row.note}` : ""}`;
      const text = `,pad=iw:ih+${font ? 34 : 6}:0:${font ? 34 : 6}:color=0x1b1d22${font ? `,drawtext=fontfile='${esc(font)}':text='${esc(label)}':x=10:y=7:fontsize=20:fontcolor=white` : ""}`;
      filters.push(`[${n}:v]scale=${tileWidth}:-2${text}[c${ri}_${c}]`);
      cells.push(`[c${ri}_${c}]`);
      n++;
    }
    filters.push(cols > 1 ? `${cells.join("")}hstack=inputs=${cols}[r${ri}]` : `${cells[0]}null[r${ri}]`);
  });
  filters.push(rows.length > 1 ? `${rows.map((_, i) => `[r${i}]`).join("")}vstack=inputs=${rows.length}[out]` : "[r0]null[out]");
  run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", out]);
  return out;
}

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
        ? ENGINES.hyperframes.stills(project, scene, t, outDir, { root, tag: `${scene.id}-${tag}` })
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
  rmSync(join(project.root, ".one-studio", "stage"), { recursive: true, force: true });
  return { project, rows, skipped, sheet, ratioSheets, labels: Boolean(findFont()) };
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
    if (r.sheet) console.log(`Contact sheet: ${relative(process.cwd(), r.sheet) || r.sheet}\nShow it to the user, then: status.mjs <dir> --approve-scenes <ids|all>`);
    if (r.ratioSheets.length) console.log("Export ratios are for review only (approval follows the main ratio). Fix them with <style data-ratio=\"9:16\"> blocks: the main ratio's approval and clips stay valid.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
