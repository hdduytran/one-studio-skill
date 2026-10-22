// style-extract/references/font-map.md as data: the only fonts the editor offers and the diacritics rule trusts.
// Parsed from the markdown table so the doc stays the single source.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FONT_MAP_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "style-extract", "references", "font-map.md");

let cache;
// -> [{ cls, family, name, version|null, fontsource|null, verified, weights[], fallback }]
export function loadFontMap(file = FONT_MAP_FILE) {
  if (cache?.file === file) return cache.rows;
  const rows = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8 || !cells[1] || /^(Class|-+)$/.test(cells[1])) continue;
    const spec = /`([a-z0-9-]+)@([^`]+)`/.exec(cells[3]);
    const fallback = /`([^`]+)`/.exec(cells[6]);
    if (!spec || !fallback) continue;
    const version = /^\d+\.\d+\.\d+$/.test(spec[2]) ? spec[2] : null;
    rows.push({
      cls: cells[1],
      family: cells[2],
      name: spec[1],
      version,
      // A "-" pin means no version is recorded yet: such a font cannot be bundled, only named.
      fontsource: version ? `${spec[1]}@${version}` : null,
      verified: cells[4] === "verified",
      weights: cells[5].split(/\s+/).map(Number).filter(Boolean),
      fallback: fallback[1],
    });
  }
  if (!rows.length) throw new Error(`No fonts found in ${file}`);
  cache = { file, rows };
  return rows;
}

export const fontRow = (family) => loadFontMap().find((r) => r.family.toLowerCase() === String(family).trim().toLowerCase()) ?? null;

const nearest = (weights, w) => weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), weights[0]);

// A brand font object for a map row, keeping `weight` when the row has it (else the nearest one).
export function fontFromRow(row, weight = 700) {
  return { family: row.family, weight: nearest(row.weights, weight), ...(row.fontsource && { fontsource: row.fontsource }), fallback: row.fallback };
}

// True when the font is known to ship the vietnamese subset: a verified map row or the user's own font file.
export function supportsVietnamese(font) {
  if (!font) return true;
  if (font.src) return true;
  return Boolean(fontRow(font.family)?.verified);
}

// Verified replacement in the same class when there is one, else the first verified row (the map's default for Vietnamese).
export function vietnameseSibling(font) {
  const row = fontRow(font.family);
  const verified = loadFontMap().filter((r) => r.verified);
  const pick = verified.find((r) => row && r.cls.split(" ")[0] === row.cls.split(" ")[0]) ?? verified[0];
  return fontFromRow(pick, font.weight ?? 700);
}
