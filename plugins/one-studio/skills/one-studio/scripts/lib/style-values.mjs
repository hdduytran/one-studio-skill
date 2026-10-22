// Turns "key=value" text from style-set (or a chat phrase) into a typed value by looking the field up in
// style.schema.json. Anything the schema would not accept is refused here with a message naming the field.
import { schemaFor } from "./project.mjs";
import { SECTIONS, unitOf } from "./style-layers.mjs";
import { fontFromRow, fontRow } from "./style-fonts.mjs";

let root;
const resolveRef = (node) => (node?.$ref ? node.$ref.slice(2).split("/").reduce((n, k) => n[k], root) : node);

// Schema node of a dotted card path (brand.colors.accent), or throws "unknown field".
export function schemaAt(path) {
  root ??= schemaFor("style");
  const [section, ...rest] = path.split(".");
  if (!SECTIONS.includes(section)) throw new Error(`"${path}" is not a style field (use ${SECTIONS.join(", ")} or a brand field such as colors.accent)`);
  let node = resolveRef(root.properties[section]);
  for (const seg of rest) {
    const next = resolveRef(node.properties?.[seg] ?? (node.additionalProperties && typeof node.additionalProperties === "object" ? node.additionalProperties : undefined));
    if (!next) throw new Error(`unknown field "${path}" ("${seg}" is not defined here)`);
    node = next;
  }
  return node;
}

const BOOL = new Map([["true", true], ["yes", true], ["on", true], ["1", true], ["co", true], ["có", true], ["false", false], ["no", false], ["off", false], ["0", false], ["khong", false], ["không", false]]);

// `raw` text -> value of the field's type. Non-text input (programmatic) is only type-checked later by the schema.
export function coerce(path, raw) {
  const node = schemaAt(path);
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  const types = [].concat(node.type ?? []);
  if (node.enum) {
    const hit = node.enum.find((v) => String(v).toLowerCase() === text.toLowerCase());
    if (hit === undefined) throw new Error(`${path}: "${raw}" is not one of ${node.enum.join(", ")}`);
    return hit;
  }
  if (types.includes("number") || types.includes("integer")) {
    const n = text === "" ? NaN : Number(text);
    if (!Number.isFinite(n)) throw new Error(`${path}: expected a number, got "${raw}"`);
    if (types.includes("integer") && !types.includes("number") && !Number.isInteger(n)) throw new Error(`${path}: expected a whole number, got "${raw}"`);
    return n;
  }
  if (types.includes("boolean")) {
    if (!BOOL.has(text.toLowerCase())) throw new Error(`${path}: expected true or false, got "${raw}"`);
    return BOOL.get(text.toLowerCase());
  }
  if (types.includes("array")) return text.startsWith("[") ? JSON.parse(text) : text.split(",").map((s) => s.trim()).filter(Boolean);
  if (types.includes("object")) {
    let v;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Error(`${path}: expected a JSON object, e.g. {"family":"Inter","weight":700}`);
    }
    return v;
  }
  if (node.$ref?.endsWith("/color") || /^\^#/.test(node.pattern ?? "")) return text.toLowerCase();
  return text;
}

// Resolves edits ({path: raw}) and drops (paths to remove) into whole units to write: a field inside an atomic
// value (a font, an easing set, a music bed) rewrites the whole value, starting from `current(unit)`. A bare family
// name from the font map brings the map's weight, fallback and bundle with it.
export function unitEdits(edits, drops, current) {
  const units = new Map();
  const inUnit = (p, unit) => p !== unit && unitOf(p) === unit;
  const working = (unit) => units.get(unit) ?? structuredClone(current(unit) ?? {});
  for (const [path, raw] of Object.entries(edits)) {
    const unit = unitOf(path);
    const typed = coerce(path, raw);
    if (unit === path) {
      units.set(unit, typed);
      continue;
    }
    const value = working(unit);
    const rel = path.slice(unit.length + 1);
    const others = Object.keys(edits).filter((p) => p !== path && inUnit(p, unit));
    const row = rel === "family" && !others.length ? fontRow(typed) : null;
    if (row) {
      units.set(unit, fontFromRow(row, value.weight));
      continue;
    }
    // A new family drops the old family's bundle unless the same call sets it.
    if (rel === "family" && value.family !== typed) for (const k of ["fontsource", "src"]) if (!others.includes(`${unit}.${k}`)) delete value[k];
    value[rel] = typed;
    units.set(unit, value);
  }
  for (const path of drops) {
    const unit = unitOf(path);
    if (unit === path) continue;
    const value = working(unit);
    delete value[path.slice(unit.length + 1)];
    units.set(unit, value);
  }
  return units;
}
