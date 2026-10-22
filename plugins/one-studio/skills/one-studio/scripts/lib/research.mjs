// research.md → rows. Columns are read by header name, so extra columns or a different order still work:
//   | id | type | content | source | url | published | accessed | speaker |
// Header, separator and HTML-comment text are skipped. Missing cells become "".
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIELDS = ["id", "type", "content", "source", "url", "published", "accessed", "speaker"];
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, "");

export function parseResearch(text) {
  const rows = [];
  let cols = null;
  for (const raw of stripComments(text ?? "").split("\n")) {
    const t = raw.trim();
    if (!t.startsWith("|")) { cols = null; continue; }
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^[-: ]*$/.test(c))) continue;
    if (cells[0].toLowerCase() === "id") { cols = cells.map((c) => c.toLowerCase()); continue; }
    if (!cells[0]) continue;
    const row = Object.fromEntries(FIELDS.map((f) => [f, ""]));
    (cols ?? FIELDS).forEach((name, i) => { if (name in row) row[name] = cells[i] ?? ""; });
    rows.push(row);
  }
  return rows;
}

export function loadResearch(project) {
  const file = join(project.root, "research.md");
  return existsSync(file) ? parseResearch(readFileSync(file, "utf8")) : [];
}

// Line `source` (string or array; ids may be comma-separated) → ids.
export const sourceIds = (source) => [source ?? []].flat().flatMap((s) => String(s).split(/[,\s]+/)).filter(Boolean);
