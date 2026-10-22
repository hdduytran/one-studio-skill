// Labelled contact sheets from stills (FFmpeg). Builds without drawtext (freetype) get unlabelled sheets.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
  run("ffmpeg", ["-nostdin", "-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", out], { timeout: SHEET_TIMEOUT_MS });
  return out;
}
