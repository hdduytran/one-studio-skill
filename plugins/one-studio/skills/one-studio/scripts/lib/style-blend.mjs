// Pure helpers shared by the Node tests and the style editor page (style-editor.mjs inlines this file, with
// color.mjs, into the page: keep it free of I/O and of imports other than ./color.mjs).
//   blendFlat      "độ giống gốc": interpolates a style towards the project's current brand
//   diffChanges    what the user changed on the page, field by field
//   buildSetCommand the one-line style-set command the page copies
import { hexToOklch, oklchToHex } from "./color.mjs";

// Values rewritten as a whole (a font, an easing set, a music bed): their parts only make sense together.
export const ATOMIC_UNITS = new Set(["brand.typography.heading", "brand.typography.body", "brand.typography.mono", "brand.motion.ease", "audio.music"]);
export function unitOf(path) {
  const parts = path.split(".");
  for (let i = 2; i <= parts.length; i++) if (ATOMIC_UNITS.has(parts.slice(0, i).join("."))) return parts.slice(0, i).join(".");
  return path;
}

const SOLID_HEX = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
const round3 = (n) => Math.round(n * 1000) / 1000;

// OKLCH interpolation along the shortest hue arc; a grey takes the other colour's hue.
export function lerpHex(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const [a, b] = [hexToOklch(from), hexToOklch(to)];
  const ha = a.C < 0.004 ? b.h : a.h;
  const hb = b.C < 0.004 ? a.h : b.h;
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return oklchToHex({ L: a.L + (b.L - a.L) * t, C: a.C + (b.C - a.C) * t, h: (ha + dh * t + 360) % 360 });
}

// t = 0 gives `from`, t = 1 gives `to`: colours in OKLCH, numbers linear (whole numbers stay whole), anything
// else (enums, text, lists) takes the side above 50%.
export function blendValue(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  if (typeof from === "number" && typeof to === "number") {
    const v = from + (to - from) * t;
    return Number.isInteger(from) && Number.isInteger(to) ? Math.round(v) : round3(v);
  }
  if (typeof from === "string" && typeof to === "string" && SOLID_HEX.test(from) && SOLID_HEX.test(to)) return lerpHex(from, to, t);
  return t > 0.5 ? to : from;
}

// styleFlat/baseFlat: { "brand.colors.bg": "#…" } maps. `similarity` 0-100 = how much of the style is kept.
// A field the base does not have keeps the style's value. An atomic value (a font…) follows one side as a whole:
// at 50% or less it is the base's, so fields only the style has come out undefined (to be unset).
export function blendFlat(styleFlat, baseFlat, similarity) {
  const t = Math.min(1, Math.max(0, similarity / 100));
  const out = {};
  const baseUnits = new Set(Object.keys(baseFlat).map(unitOf));
  for (const [path, value] of Object.entries(styleFlat)) {
    const unit = unitOf(path);
    if (unit === path) out[path] = baseFlat[path] === undefined ? value : blendValue(baseFlat[path], value, t);
    else out[path] = t > 0.5 || !baseUnits.has(unit) ? value : baseFlat[path];
  }
  if (t <= 0.5) {
    const styled = new Set(Object.keys(styleFlat).map(unitOf));
    for (const [path, value] of Object.entries(baseFlat)) if (!(path in out) && unitOf(path) !== path && styled.has(unitOf(path))) out[path] = value;
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// -> { changes: {path: value}, unsets: [path] } between the values the page opened with and the current ones.
export function diffChanges(initial, current) {
  const changes = {};
  const unsets = [];
  for (const path of new Set([...Object.keys(initial), ...Object.keys(current)])) {
    if (same(initial[path], current[path])) continue;
    if (current[path] === undefined) unsets.push(path);
    else changes[path] = current[path];
  }
  return { changes, unsets: unsets.sort() };
}

// Brand fields are written without their "brand." prefix, like style-set takes them.
export const shortKey = (path) => path.replace(/^brand\./, "");
const text = (v) => (Array.isArray(v) ? v.join(",") : typeof v === "object" ? JSON.stringify(v) : String(v));
export const shellWord = (s) => (/^[\w.,:@%+/#=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

// "node style-set.mjs <dir> <slug> k=v … --unset k --lock k --unlock k". Empty when nothing changed.
export function buildSetCommand({ script = '"$S/scripts/style-set.mjs"', dir, slug, variant, changes = {}, unsets = [], lock = [], unlock = [] }) {
  const parts = [`node ${script}`, shellWord(dir), slug];
  if (variant) parts.push("--variant", variant);
  for (const [k, v] of Object.entries(changes)) parts.push(shellWord(`${shortKey(k)}=${text(v)}`));
  for (const k of unsets) parts.push("--unset", shellWord(shortKey(k)));
  for (const k of lock) parts.push("--lock", shellWord(shortKey(k)));
  for (const k of unlock) parts.push("--unlock", shellWord(shortKey(k)));
  return Object.keys(changes).length + unsets.length + lock.length + unlock.length ? parts.join(" ") : "";
}
