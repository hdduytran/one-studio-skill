// Layered style: style.json <- style.enhance.json <- style.custom.json <- variants/<v>.json (later layer wins).
//   style-refs/<slug>/style.json           written by extraction (style-draft, style-merge) only
//   style-refs/<slug>/style.enhance.json   proposals the user accepted      { brand?, storyboard?, writing?, audio?, provenance?, applied?, rejected? }
//   style-refs/<slug>/style.custom.json    the user's own choices           { …same sections…, provenance?, locked? }
//   style-refs/<slug>/variants/<v>.json    named variant (light, dark, …)   { …same sections…, provenance?, locked? }
// A layer is a partial patch of the card: an absent field means "keep the lower layer". Objects merge field by
// field; arrays and the ATOMIC_UNITS (a font, an easing set, a music bed) replace as a whole.
// `locked` lists units the user pinned: their value is stored in the layer, so a re-extraction cannot change them.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJson } from "./project.mjs";
import { ATOMIC_UNITS, unitOf } from "./style-blend.mjs";
import { leafPaths, loadStyle, styleDir, styleErrors } from "./style-refs.mjs";

export { ATOMIC_UNITS, unitOf };
export const SECTIONS = ["brand", "storyboard", "writing", "audio"];
// Brand parts a series owns; the style schema cannot carry them, so a lock on them only records the intent.
export const SERIES_OWNED = ["brand.logo", "brand.voice", "brand.intro", "brand.outro", "brand.lower_third"];
const META_KEYS = ["provenance", "locked", "applied", "rejected"];
export const VARIANT_RE = /^[a-z0-9][a-z0-9-]*$/;

export const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// "colors.accent" -> "brand.colors.accent"; a first segment that is a section stays as written.
export function normalizeKey(key) {
  const k = String(key).trim().replace(/^\.+|\.+$/g, "");
  if (!k || /\s|=/.test(k)) throw new Error(`invalid field "${key}"`);
  return SECTIONS.includes(k.split(".")[0]) ? k : `brand.${k}`;
}
export const provenanceKey = (path) => path.split(".").slice(0, 3).join(".");
// Provenance keys (cut at three segments) a unit with this value needs.
export const provenanceKeys = (unit, value) => [...new Set(leafPaths(value, unit, []).map(provenanceKey))];
export const getPath = (obj, path) => path.split(".").reduce((o, k) => (isObj(o) ? o[k] : undefined), obj);
export function setPath(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (const k of parts.slice(0, -1)) o = isObj(o[k]) ? o[k] : (o[k] = {});
  o[parts.at(-1)] = value;
}
// Removes a field and any object left empty above it.
export function deletePath(obj, path) {
  const parts = path.split(".");
  const walk = (o, i) => {
    if (!isObj(o) || !(parts[i] in o)) return;
    if (i === parts.length - 1) delete o[parts[i]];
    else {
      walk(o[parts[i]], i + 1);
      if (isObj(o[parts[i]]) && !Object.keys(o[parts[i]]).length) delete o[parts[i]];
    }
  };
  walk(obj, 0);
}

// Every unit (a leaf, or an atomic value) a layer sets, as dotted paths.
export function layerUnits(layer, out = [], prefix = "") {
  for (const [k, v] of Object.entries(layer)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!prefix && !SECTIONS.includes(k)) continue;
    if (isObj(v) && !ATOMIC_UNITS.has(path)) layerUnits(v, out, path);
    else out.push(path);
  }
  return out;
}
// Every dotted field of a card, atomic values expanded (for tables and diffs); arrays stay one field.
export function flatten(style, out = {}, prefix = "") {
  for (const [k, v] of Object.entries(style)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!prefix && !SECTIONS.includes(k)) continue;
    if (isObj(v)) flatten(v, out, path);
    else out[path] = v;
  }
  return out;
}
export const isLocked = (locked, path) => locked.some((l) => path === l || path.startsWith(`${l}.`) || unitOf(path) === l);

function mergeInto(target, src, path) {
  for (const [k, v] of Object.entries(src)) {
    const p = `${path}.${k}`;
    target[k] = isObj(v) && isObj(target[k]) && !ATOMIC_UNITS.has(p) ? mergeInto(target[k], v, p) : clone(v);
  }
  return target;
}

// Merges the partial card `src` into the layer `dst` with the same rules as applyLayer; provenance entries are spread.
export function mergeLayerInto(dst, src) {
  for (const sec of SECTIONS) if (isObj(src[sec])) dst[sec] = mergeInto(dst[sec] ?? {}, src[sec], sec);
  if (src.provenance) dst.provenance = { ...(dst.provenance ?? {}), ...src.provenance };
  return dst;
}

// One layer over a card; provenance entries follow the fields: layer entries win, missing ones are marked
// `guessed`, entries for fields that no longer exist are dropped.
export function applyLayer(style, layer, name = "layer") {
  const out = clone(style);
  for (const sec of SECTIONS) if (isObj(layer[sec])) out[sec] = mergeInto(out[sec] ?? {}, layer[sec], sec);
  const fields = SECTIONS.flatMap((k) => (out[k] ? leafPaths(out[k], k, []) : []));
  const prov = { ...out.provenance, ...(layer.provenance ?? {}) };
  out.provenance = Object.fromEntries(fields.map((f) => [f, prov[f] ?? { source: "guessed", note: `set by ${name} without provenance` }]));
  return out;
}

export function layerErrors(layer, file) {
  const errors = [];
  if (!isObj(layer)) return [`${file}: must be a JSON object`];
  for (const k of Object.keys(layer)) if (![...SECTIONS, ...META_KEYS].includes(k)) errors.push(`${file}: unknown key "${k}"`);
  for (const k of ["locked", "rejected"]) if (layer[k] !== undefined && !(Array.isArray(layer[k]) && layer[k].every((s) => typeof s === "string"))) errors.push(`${file}: ${k} must be a list of strings`);
  if (layer.applied !== undefined && !Array.isArray(layer.applied)) errors.push(`${file}: applied must be a list`);
  if (layer.provenance !== undefined && !isObj(layer.provenance)) errors.push(`${file}: provenance must be an object`);
  return errors;
}

export const layerFile = (project, slug, name) =>
  name === "enhance" || name === "custom" ? join(styleDir(project, slug), `style.${name}.json`) : join(styleDir(project, slug), "variants", `${name}.json`);

export function readLayer(project, slug, name) {
  const file = layerFile(project, slug, name);
  if (!existsSync(file)) return {};
  const layer = readJson(file);
  const errors = layerErrors(layer, file);
  if (errors.length) throw new Error(`Invalid layer:\n  ${errors.join("\n  ")}`);
  return layer;
}
export function writeLayer(project, slug, name, layer) {
  const file = layerFile(project, slug, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(layer, null, 2) + "\n");
  return file;
}
export const hasLayer = (project, slug, name) => existsSync(layerFile(project, slug, name));

// The four layers of one style; a requested variant must exist unless `create` is set.
export function loadLayers(project, slug, variant, { create = false } = {}) {
  if (variant && !VARIANT_RE.test(variant)) throw new Error(`variant must be kebab-case (a-z, 0-9, -), got "${variant}"`);
  if (variant && !create && !hasLayer(project, slug, variant)) throw new Error(`No variant "${variant}" for style "${slug}" (expected ${layerFile(project, slug, variant)}); create it with style-set --variant or style-enhance`);
  const base = loadStyle(project, slug);
  const layers = [["enhance", readLayer(project, slug, "enhance")], ["custom", readLayer(project, slug, "custom")], ...(variant ? [[variant, readLayer(project, slug, variant)]] : [])];
  return { base, layers };
}
export function composeLayers(base, layers) {
  return layers.reduce((style, [name, layer]) => applyLayer(style, layer, name), base);
}
export const lockedOf = (layers) => [...new Set(layers.flatMap(([, l]) => l.locked ?? []))];

// The style every consumer (compare, apply, merge, enhance, editor) reads. `project` is a project dir or a
// loadProject() result; with a result the merged card is also checked against its brand.
export function effectiveStyle(project, slug, variant) {
  const { base, layers } = loadLayers(project, slug, variant);
  const style = composeLayers(base, layers);
  const errors = styleErrors(style, { slug, brand: typeof project === "object" ? project.brand : null });
  if (errors.length) throw new Error(`Invalid style "${slug}"${variant ? ` (variant ${variant})` : ""} once its layers are merged:\n  ${errors.join("\n  ")}`);
  return style;
}

// Units a person set (custom or variant layer) or locked whose value differs from the extracted card:
// what a re-extraction would otherwise overwrite.
export function keptByChoice(project, slug, variant) {
  const { base, layers } = loadLayers(project, slug, variant);
  const own = layers.filter(([n]) => n !== "enhance");
  const units = new Set([...own.flatMap(([, l]) => layerUnits(l)), ...lockedOf(own)]);
  const style = composeLayers(base, own);
  return [...units].filter((u) => getPath(style, u) !== undefined && !same(getPath(style, u), getPath(base, u))).sort();
}

// Rows for style-diff: every field that differs from the extracted card, with the layer that set it.
export function diffRows(project, slug, variant) {
  const { base, layers } = loadLayers(project, slug, variant);
  const style = composeLayers(base, layers);
  const [from, to] = [flatten(base), flatten(style)];
  const locked = lockedOf(layers);
  const layerOf = (path) => [...layers].reverse().find(([, l]) => layerUnits(l).some((u) => path === u || path.startsWith(`${u}.`)))?.[0] ?? "?";
  return Object.keys({ ...from, ...to })
    .filter((p) => !same(from[p], to[p]))
    .sort()
    .map((path) => ({ path, base: from[path], current: to[path], layer: layerOf(path), locked: isLocked(locked, path) }));
}
