// Assign brand colour roles (bg/fg/primary/secondary/accent/muted) to the palette clusters of a metrics.json.
// Pure and deterministic. A role with no suitable cluster is left out and reported in `notes`, never invented
// from thin air (the one exception is fg on a near-monochrome palette: black or white, marked guessed).
import { contrastRatio, deltaE2000 } from "./color.mjs";

export const MIN_CLUSTER_WEIGHT = 0.01; // ignore dust clusters
export const FG_MIN_CONTRAST = 4.5; // WCAG AA body text
export const ACCENT_MIN_CHROMA = 0.08; // OKLCH C below this reads as grey
export const MUTED_MAX_CHROMA = 0.06;
export const DISTINCT_DELTA_E = 15; // accents must differ from each other and from bg/fg by at least this
const FG_FALLBACK = { dark: "#f5f5f5", light: "#111111" };

// palette: metrics.color.palette = [{hex, weight, L, C, h, bg}]
// -> { colors: {role: hex}, sources: {role: {source, note?}}, notes: [string] }
export function assignColorRoles(palette = []) {
  const colors = {};
  const sources = {};
  const notes = [];
  const set = (role, hex, source, note) => {
    colors[role] = hex;
    sources[role] = note ? { source, note } : { source };
  };
  const real = palette.filter((c) => c.weight >= MIN_CLUSTER_WEIGHT || c.bg);
  const bg = real.find((c) => c.bg) ?? real[0];
  if (!bg) return { colors, sources, notes: ["empty palette: no colour roles assigned"] };
  set("bg", bg.hex, "measured", "background cluster (largest at the frame border)");

  const others = real.filter((c) => c !== bg);
  const best = others.map((c) => ({ c, ratio: contrastRatio(c.hex, bg.hex) })).sort((a, b) => b.ratio - a.ratio || b.c.weight - a.c.weight)[0];
  let fg = null;
  if (best && best.ratio >= FG_MIN_CONTRAST) {
    fg = best.c;
    set("fg", fg.hex, "measured", `highest contrast with bg (${best.ratio.toFixed(1)}:1)`);
  } else {
    const hex = bg.L < 0.6 ? FG_FALLBACK.dark : FG_FALLBACK.light;
    set("fg", hex, "guessed", "no palette colour reaches 4.5:1 against bg; picked black/white. Look at the frames for the real text colour");
    notes.push("near-monochrome palette: rely on the frames for colour roles");
  }

  const taken = [bg.hex, colors.fg];
  const distinct = (hex) => taken.every((t) => deltaE2000(hex, t) >= DISTINCT_DELTA_E);
  const accents = others
    .filter((c) => c !== fg && c.C >= ACCENT_MIN_CHROMA)
    .sort((a, b) => b.weight * b.C - a.weight * a.C || (a.hex < b.hex ? -1 : 1));
  const roles = ["primary", "secondary", "accent"];
  for (const c of accents) {
    if (!roles.length) break;
    if (!distinct(c.hex)) continue;
    set(roles.shift(), c.hex, "measured", "chromatic cluster ranked by weight x chroma");
    taken.push(c.hex);
  }
  if (roles.length) notes.push(`no colour left for: ${roles.join(", ")}`);

  const lo = Math.min(bg.L, fg?.L ?? (bg.L < 0.6 ? 1 : 0));
  const hi = Math.max(bg.L, fg?.L ?? (bg.L < 0.6 ? 1 : 0));
  const mid = (lo + hi) / 2;
  const muted = others
    .filter((c) => c !== fg && !taken.includes(c.hex) && c.C <= MUTED_MAX_CHROMA && c.L > lo && c.L < hi)
    .sort((a, b) => Math.abs(a.L - mid) - Math.abs(b.L - mid) || (a.hex < b.hex ? -1 : 1))[0];
  if (muted) set("muted", muted.hex, "measured", "low-chroma cluster between bg and fg");
  else notes.push("no low-chroma cluster between bg and fg: muted left out");
  return { colors, sources, notes };
}
