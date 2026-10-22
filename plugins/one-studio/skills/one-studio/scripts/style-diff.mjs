#!/usr/bin/env node
// What differs from the extracted card, field by field, and which layer set it.
//   node style-diff.mjs <project-dir> <slug> [--variant v]
//   node style-diff.mjs <project-dir> <slug> [--variant v] --get motion.duration,captions   current values of those fields
// Columns: field | extracted | current | layer (enhance / custom / variant) | 🔒. At most 40 rows.
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { diffRows, effectiveStyle, flatten, normalizeKey } from "./lib/style-layers.mjs";

export const MAX_ROWS = 40;
const show = (v) => {
  if (v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
};

export function printDiff(rows, { vi = false, log = console.log } = {}) {
  if (!rows.length) return log(vi ? "Không có thay đổi so với style gốc." : "No change from the extracted style.");
  const head = vi ? ["trường", "gốc", "hiện tại", "lớp", "🔒"] : ["field", "extracted", "current", "layer", "🔒"];
  const lines = rows.slice(0, MAX_ROWS).map((r) => [r.path.replace(/^brand\./, ""), show(r.base), show(r.current), r.layer, r.locked ? "🔒" : ""]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => [...l[i]].length)));
  const row = (cells) => cells.map((c, i) => c + " ".repeat(widths[i] - [...c].length)).join(" | ").trimEnd();
  log(row(head));
  for (const l of lines) log(row(l));
  if (rows.length > MAX_ROWS) log(vi ? `… và ${rows.length - MAX_ROWS} dòng nữa` : `… and ${rows.length - MAX_ROWS} more`);
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["variant", "get"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-diff.mjs <project-dir> <slug> [--variant v] [--get field,field]");
      process.exit(dir && slug ? 0 : 1);
    }
    const project = loadProject(dir);
    if (args.get) {
      // Current (effective) values of the fields starting with each prefix, for computing relative changes.
      const prefixes = args.get.split(",").map((k) => normalizeKey(k));
      const all = flatten(effectiveStyle(project, slug, args.variant));
      const hits = Object.entries(all).filter(([p]) => prefixes.some((x) => p === x || p.startsWith(`${x}.`)));
      if (!hits.length) throw new Error(`no field starts with ${args.get}`);
      for (const [p, v] of hits) console.log(`${p.replace(/^brand\./, "")} = ${typeof v === "string" ? v : JSON.stringify(v)}`);
      process.exit(0);
    }
    printDiff(diffRows(project, slug, args.variant), { vi: project.studio.meta.language?.startsWith("vi") });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
