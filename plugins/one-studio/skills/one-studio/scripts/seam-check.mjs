#!/usr/bin/env node
// Seam check: the last frame of scene A beside the first frame of scene B, with their pixel difference.
// Pairs: consecutive scenes of one world (must match: exit 1 above the threshold) and handoff pairs
// (a match cut changes everything but the motif, so their difference is shown for the eye, not gated).
// The motif's bounding box is not measured: the stills engine exposes no page, so judge handoffs on the sheet.
//   node seam-check.mjs <project-dir> [--pairs s01:s02,s02:s03] [--threshold 0.02]
// Output: review/seams.jpg (one row per pair: A end | B start) and a table.
import { mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { engineFor } from "./lib/engines.mjs";
import { effectiveDuration } from "./lib/scenes.mjs";
import { run } from "./lib/ffmpeg.mjs";
import { contactSheet } from "./lib/contact-sheet.mjs";
import { seamPairs } from "./lib/visual-refs.mjs";

export const DEFAULT_THRESHOLD = 0.02;

// Mean absolute difference between two same-size images, 0 (identical) .. 1 (black vs white).
export function imageDifference(a, b) {
  const r = run("ffmpeg", ["-v", "error", "-i", a, "-i", b, "-filter_complex",
    "[0:v][1:v]blend=all_mode=difference,format=gray,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]);
  const yavg = parseYavg(r.stdout);
  if (yavg == null) throw new Error(`could not measure the difference between ${a} and ${b}`);
  return yavg / 255;
}

// The first YAVG value printed by FFmpeg's signalstats. Tiny averages come in exponent form (9.6e-06).
export function parseYavg(stdout) {
  const m = /lavfi\.signalstats\.YAVG=([\d.]+(?:e[-+]?\d+)?)/i.exec(stdout);
  return m ? Number(m[1]) : null;
}

// pairs: [{ a, b, kind }] (default: every same-world and handoff pair). Returns { rows, sheet, failed }.
export function seamCheck(dir, { pairs = null, threshold = DEFAULT_THRESHOLD } = {}) {
  const project = loadProject(dir);
  const scenes = new Map((project.storyboard?.scenes ?? []).map((s) => [s.id, s]));
  const all = seamPairs(project.storyboard ?? { scenes: [] });
  const list = pairs ?? all;
  for (const p of list) for (const id of [p.a, p.b]) if (!scenes.has(id)) throw new Error(`seam-check: scene ${id} is not in storyboard.json`);
  if (!list.length) return { rows: [], sheet: null, failed: [] };
  const fps = project.studio.format.fps;
  const base = join(project.root, "review", "seams");
  mkdirSync(base, { recursive: true });
  const still = (id, t, tag) => engineFor(project, scenes.get(id)).stills(project, scenes.get(id), [t], join(base, `${id}-${tag}`))[0];
  const rows = list.map((p) => {
    const a = scenes.get(p.a);
    const kind = p.kind ?? all.find((x) => x.a === p.a && x.b === p.b)?.kind ?? "world";
    const end = still(p.a, Math.round((effectiveDuration(project, a) - 1 / fps) * 1000) / 1000, "end");
    const start = still(p.b, 0, "start");
    const diff = imageDifference(end, start);
    return { a: p.a, b: p.b, kind, diff, ok: kind === "handoff" || diff <= threshold, stills: [end, start] };
  });
  const sheet = contactSheet(
    rows.map((r) => ({ id: `${r.a}>${r.b}`, times: [], stills: r.stills, labels: [`${r.a} end`, `${r.b} start · diff ${(r.diff * 100).toFixed(2)}%${r.ok ? "" : " TOO HIGH"}`] })),
    join(project.root, "review", "seams.jpg"),
  );
  return { rows, sheet, failed: rows.filter((r) => !r.ok), threshold, root: project.root };
}

export function formatSeams(r) {
  const lines = r.rows.map((x) => `${x.ok ? "✓" : "✗"} ${x.a} → ${x.b}  ${x.kind.padEnd(7)} diff ${(x.diff * 100).toFixed(2)}%${x.kind === "handoff" ? "  (review on the sheet)" : x.ok ? "" : `  > ${(r.threshold * 100).toFixed(1)}%`}`);
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["pairs", "threshold"] });
    const [dir] = args._;
    if (args.help || !dir) {
      console.log("usage: seam-check.mjs <project-dir> [--pairs s01:s02,s02:s03] [--threshold 0.02]");
      process.exit(dir ? 0 : 1);
    }
    const pairs = args.pairs ? args.pairs.split(",").map((p) => { const [a, b] = p.trim().split(":"); return { a, b }; }) : null;
    const threshold = args.threshold == null ? DEFAULT_THRESHOLD : Number(args.threshold);
    if (!(threshold >= 0)) throw new Error("--threshold must be a number >= 0 (0.02 = 2% mean difference)");
    const r = seamCheck(dir, { pairs, threshold });
    if (!r.rows.length) console.log("No same-world or handoff pairs to check.");
    else {
      console.log(formatSeams(r));
      console.log(`Sheet: ${relative(process.cwd(), r.sheet) || r.sheet}`);
    }
    process.exit(r.failed.length ? 1 : 0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
