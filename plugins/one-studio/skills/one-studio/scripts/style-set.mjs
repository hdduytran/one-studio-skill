#!/usr/bin/env node
// Change a style by hand, field by field, without touching the extracted card.
//   node style-set.mjs <project-dir> <slug> [--variant v] key=value … [--lock key] [--unlock key] [--unset key]
//   key      dotted field: colors.accent, motion.duration.base, typography.heading.weight (brand fields need no
//            prefix); storyboard./writing./audio. fields are written in full (storyboard.target_shot_seconds)
//   value    typed from style.schema.json: numbers, #hex, enums, lists "a,b", JSON for objects; a wrong type or an
//            invalid value is refused and nothing is written
//   --lock   pins the field: the value is stored with it, so a new extraction, merge or enhance leaves it alone
//   --unlock removes the pin (the value stays)   --unset removes your value: the layer below shows through again
// Writes style.custom.json (or variants/<v>.json with --variant) and prints a short style-diff. Several
// --lock/--unlock/--unset are allowed, each also as a comma list.
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { SERIES_OWNED, clone, composeLayers, deletePath, diffRows, getPath, layerUnits, loadLayers, normalizeKey, provenanceKeys, setPath, unitOf, writeLayer } from "./lib/style-layers.mjs";
import { styleErrors } from "./lib/style-refs.mjs";
import { schemaAt, unitEdits } from "./lib/style-values.mjs";
import { printDiff } from "./style-diff.mjs";

const MULTI = ["lock", "unlock", "unset"];

// Splits repeated --lock/--unlock/--unset out of argv (parseArgs keeps only one value per option).
export function takeMulti(argv) {
  const rest = [];
  const multi = Object.fromEntries(MULTI.map((k) => [k, []]));
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(lock|unlock|unset)(?:=(.*))?$/.exec(argv[i]);
    if (!m) {
      rest.push(argv[i]);
      continue;
    }
    const value = m[2] ?? argv[++i];
    if (value === undefined) throw new Error(`--${m[1]} needs a field`);
    multi[m[1]].push(...value.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return { rest, ...multi };
}

export function setStyle(dir, slug, { variant, set = {}, lock = [], unlock = [], unset = [] } = {}) {
  const project = loadProject(dir);
  const name = variant ?? "custom";
  const { base, layers } = loadLayers(project, slug, variant, { create: true });
  const own = clone(layers.find(([n]) => n === name)?.[1] ?? {});
  const before = composeLayers(base, layers);
  const norm = (keys) => keys.map(normalizeKey);
  const edits = Object.fromEntries(Object.entries(set).map(([k, v]) => [normalizeKey(k), v]));
  for (const p of Object.keys(edits)) schemaAt(p);
  const drops = norm(unset);
  const units = unitEdits(edits, drops.filter((p) => unitOf(p) !== p), (u) => getPath(own, u) ?? getPath(before, u));

  for (const p of drops) {
    if (unitOf(p) === p) deletePath(own, p);
  }
  const prov = { ...(own.provenance ?? {}) };
  for (const [unit, value] of units) {
    setPath(own, unit, value);
    for (const k of provenanceKeys(unit, value)) prov[k] = { source: "seen", note: variant ? `set by you (variant ${variant})` : "set by you" };
  }

  const withOwn = (layer) => composeLayers(base, layers.map(([n, l]) => (n === name ? [n, layer] : [n, l])));
  // A lock stores the current value in the layer, so no later extraction can change it.
  const locked = new Set(own.locked ?? []);
  const mid = withOwn(own);
  for (const unit of norm(lock).map(unitOf)) {
    if (!SERIES_OWNED.includes(unit)) {
      const value = getPath(mid, unit);
      if (value === undefined) throw new Error(`cannot lock ${unit}: the style has no value for it`);
      if (getPath(own, unit) === undefined) {
        setPath(own, unit, clone(value));
        for (const k of provenanceKeys(unit, value)) prov[k] = mid.provenance[k] ?? { source: "seen", note: "pinned by you" };
      }
    }
    locked.add(unit);
  }
  for (const unit of norm(unlock).map(unitOf)) locked.delete(unit);

  // Provenance follows the units the layer still has.
  const live = new Set(layerUnits(own).flatMap((u) => provenanceKeys(u, getPath(own, u))));
  own.provenance = Object.fromEntries(Object.entries(prov).filter(([k]) => live.has(k)));
  if (!Object.keys(own.provenance).length) delete own.provenance;
  if (locked.size) own.locked = [...locked].sort();
  else delete own.locked;

  const errors = styleErrors(withOwn(own), { slug, brand: project.brand });
  if (errors.length) throw new Error(`Refused, nothing written:\n  ${errors.join("\n  ")}`);
  const file = writeLayer(project, slug, name, own);
  return { file, layer: name, locked: [...locked].sort(), rows: diffRows(project, slug, variant), project };
}

if (isMain(import.meta.url)) {
  try {
    const { rest, lock, unlock, unset } = takeMulti(process.argv.slice(2));
    const args = parseArgs(rest, { flags: ["help"], options: ["variant"] });
    const [dir, slug, ...pairs] = args._;
    if (args.help || !dir || !slug || (!pairs.length && !lock.length && !unlock.length && !unset.length)) {
      console.log("usage: style-set.mjs <project-dir> <slug> [--variant v] key=value … [--lock key] [--unlock key] [--unset key]");
      process.exit(args.help ? 0 : 1);
    }
    const set = {};
    for (const pair of pairs) {
      const i = pair.indexOf("=");
      if (i < 1) throw new Error(`expected key=value, got "${pair}"`);
      set[pair.slice(0, i)] = pair.slice(i + 1);
    }
    const r = setStyle(dir, slug, { variant: args.variant, set, lock, unlock, unset });
    const vi = r.project.studio.meta.language?.startsWith("vi");
    console.log(`${vi ? "Đã ghi" : "Saved"}: ${r.file}${r.locked.length ? `  🔒 ${r.locked.join(", ")}` : ""}`);
    printDiff(r.rows, { vi });
    console.log(vi ? "Tiếp theo: style-compare.mjs để xem lại, rồi hỏi người dùng." : "Next: style-compare.mjs to look again, then ask the user.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
