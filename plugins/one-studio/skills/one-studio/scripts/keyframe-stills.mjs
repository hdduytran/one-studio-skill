#!/usr/bin/env node
// Gate 5: capture review stills (start / middle / end) per scene and one labelled contact sheet.
// Only scenes that changed since their last approval are captured unless --all.
//   node keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3]
// Output: review/<id>/frame-*.png and review/sheet.jpg (show the sheet to the user).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { engineFor, reviewTimes } from "./lib/engines.mjs";
import { run } from "./lib/ffmpeg.mjs";

function findFont() {
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
      const text = `,pad=iw:ih+34:0:34:color=0x1b1d22${font ? `,drawtext=fontfile='${esc(font)}':text='${esc(label)}':x=10:y=7:fontsize=20:fontcolor=white` : ""}`;
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

export function keyframeStills(dir, { ids = [], all = false, frames = 3 } = {}) {
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
  rmSync(join(project.root, ".one-studio", "stage"), { recursive: true, force: true });
  return { project, rows, skipped, sheet };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["all", "help"], options: ["frames"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir) {
      console.log("usage: keyframe-stills.mjs <project-dir> [scene-id…] [--all] [--frames 1|2|3]");
      process.exit(dir ? 0 : 1);
    }
    const r = keyframeStills(dir, { ids, all: args.all, frames: Number(args.frames ?? 3) });
    if (!r.rows.length) console.log("No scenes to review (all approved and unchanged). Use --all to capture everything.");
    for (const row of r.rows) console.log(`✓ ${row.id}: ${row.stills.length} still(s) at ${row.times.join(", ")}s`);
    for (const s of r.skipped) console.log(`· skipped ${s}`);
    if (r.sheet) console.log(`Contact sheet: ${relative(process.cwd(), r.sheet) || r.sheet}\nShow it to the user, then: status.mjs <dir> --approve-scenes <ids|all>`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
