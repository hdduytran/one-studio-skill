// Labelled contact sheets from stills (FFmpeg). Builds without drawtext (freetype) get unlabelled sheets.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { hasDrawtext, run } from "./ffmpeg.mjs";

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

const SHEET_TIMEOUT_MS = 120_000;
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

// One row per scene: its stills side by side, labelled "<id> · <t>s".
// maxWidth: tiles shrink so a row never gets wider. A row with fill: false keeps its own cells (padded on the
// right) instead of repeating its last still (grid rows of an overview).
export function contactSheet(rows, out, { tileWidth = 480, maxWidth = Infinity } = {}) {
  const font = findFont();
  const cols = Math.max(...rows.map((r) => r.stills.length));
  tileWidth = Math.min(tileWidth, Math.floor(maxWidth / cols / 2) * 2);
  const inputs = [];
  const filters = [];
  let n = 0;
  rows.forEach((row, ri) => {
    const cells = [];
    const own = row.fill === false ? row.stills.length : cols;
    for (let c = 0; c < own; c++) {
      const still = row.stills[c] ?? row.stills[row.stills.length - 1];
      inputs.push("-i", still);
      const label = row.labels?.[c] ?? `${row.id} · ${row.times[c] ?? ""}s${row.note ? ` · ${row.note}` : ""}`;
      const text = `,pad=iw:ih+${font ? 34 : 6}:0:${font ? 34 : 6}:color=0x1b1d22${font ? `,drawtext=fontfile='${esc(font)}':text='${esc(label)}':x=10:y=7:fontsize=20:fontcolor=white` : ""}`;
      filters.push(`[${n}:v]scale=${tileWidth}:-2${text}[c${ri}_${c}]`);
      cells.push(`[c${ri}_${c}]`);
      n++;
    }
    const pad = own < cols ? `,pad=${cols * tileWidth}:ih:0:0:color=0x1b1d22` : "";
    filters.push(own > 1 ? `${cells.join("")}hstack=inputs=${own}${pad}[r${ri}]` : `${cells[0]}null${pad}[r${ri}]`);
  });
  filters.push(rows.length > 1 ? `${rows.map((_, i) => `[r${i}]`).join("")}vstack=inputs=${rows.length}[out]` : "[r0]null[out]");
  run("ffmpeg", ["-nostdin", "-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", out], { timeout: SHEET_TIMEOUT_MS });
  return out;
}

// Readable sheets: at most `perSheet` scene rows and `maxWidth` px per file. One chunk → `out` itself; more →
// out-1.jpg, out-2.jpg … (stale chunks of an earlier, longer run are removed). Returns the files written.
export function contactSheets(rows, out, { perSheet = 12, maxWidth = 1200, tileWidth = 480 } = {}) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += perSheet) chunks.push(rows.slice(i, i + perSheet));
  const ext = /\.[^.]+$/.exec(out)?.[0] ?? ".jpg";
  const stem = basename(out, ext);
  const stale = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+${ext.replace(".", "\\.")}$`);
  if (existsSync(dirname(out))) for (const f of readdirSync(dirname(out))) if (stale.test(f)) rmSync(join(dirname(out), f));
  if (chunks.length <= 1) return chunks.length ? [contactSheet(chunks[0], out, { tileWidth, maxWidth })] : [];
  rmSync(out, { force: true });
  return chunks.map((c, i) => contactSheet(c, join(dirname(out), `${stem}-${i + 1}${ext}`), { tileWidth, maxWidth }));
}

// Overview of one still per scene (export ratios, publish): a grid as wide as maxWidth allows, ≤ perSheet scenes per file.
// items: [{ still, label }]
export function overviewSheets(items, out, { perSheet = 12, maxWidth = 1200, tileWidth = 300 } = {}) {
  const cols = Math.max(1, Math.min(items.length, Math.floor(maxWidth / tileWidth)));
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const part = items.slice(i, i + cols);
    rows.push({ id: "", times: part.map(() => ""), stills: part.map((x) => x.still), labels: part.map((x) => x.label), fill: false });
  }
  // perSheet counts scenes: whole grid rows per file.
  return contactSheets(rows, out, { perSheet: Math.max(1, Math.floor(perSheet / cols)), maxWidth, tileWidth });
}
