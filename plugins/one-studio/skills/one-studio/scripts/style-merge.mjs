#!/usr/bin/env node
// Blend several extracted styles into one new style (what the references have in common).
//   node style-merge.mjs <project-dir> <slug-a> <slug-b> [<slug-c> …] --as <slug>
//   numbers            median across the sources that have them
//   colours            palette clusters seen in at least 2 sources (ΔE ≤ 8), weights added up, roles re-assigned
//   other values       the majority value; a tie leaves the field out (absent, never null): the card then
//                      lists it as still open for Claude to choose with the user
//   do_not_copy        union
// Sources are read through their layers (extracted <- enhance <- your choices), so locked and custom values count.
// Writes style-refs/<slug>/{style.json, metrics.json, sources.json}. The card's `reference` stays one object
// (the schema's shape: that of the first source); every source's reference is kept in sources.json.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, now, parseArgs, readJson, writeJson } from "./lib/project.mjs";
import { ensureGitignore, leafPaths, resolveStyle, styleDir, styleErrors } from "./lib/style-refs.mjs";
import { keptByChoice } from "./lib/style-layers.mjs";
import { deltaE2000, hexToOklch } from "./lib/color.mjs";
import { assignColorRoles } from "./lib/style-color-roles.mjs";

export const PALETTE_MATCH_DELTA_E = 8;
export const MIN_SOURCES_FOR_COLOUR = 2;
// Whole-value fields: their parts only make sense together (a font, a bed with its bpm, an easing set).
const ATOMIC = new Set(["brand.typography.heading", "brand.typography.body", "brand.typography.mono", "brand.motion.ease", "audio.music"]);
const SOURCE_RANK = { measured: 0, seen: 1, guessed: 2 };

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return +m.toFixed(3);
};
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Majority of `values` by JSON equality; undefined on a tie.
function majority(values) {
  const tally = new Map();
  for (const v of values) tally.set(JSON.stringify(v), (tally.get(JSON.stringify(v)) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length === 1 || ranked[0][1] > ranked[1][1] ? JSON.parse(ranked[0][0]) : undefined;
}

// Merge the values one field has across the sources. Collects ties into `ties`.
function mergeValues(values, path, ties) {
  if (values.every(isObj) && !ATOMIC.has(path)) {
    const out = {};
    for (const k of [...new Set(values.flatMap(Object.keys))]) {
      const v = mergeValues(values.map((o) => o[k]).filter((x) => x !== undefined), `${path}.${k}`, ties);
      if (v !== undefined) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (values.every((v) => typeof v === "number")) {
    const m = median(values);
    // Integer-typed fields (every source holds a whole number) must stay whole.
    return values.every(Number.isInteger) ? Math.round(m) : m;
  }
  const v = majority(values);
  if (v === undefined) ties.push(path);
  return v;
}

// Clusters that recur across sources, with weights added up (divided by the source count so they stay ≤ 1).
export function mergePalettes(palettes) {
  const groups = [];
  palettes.forEach((palette, si) => {
    for (const c of [...palette].sort((a, b) => b.weight - a.weight)) {
      const g = groups.find((x) => deltaE2000(x.hex, c.hex) <= PALETTE_MATCH_DELTA_E);
      if (g) {
        g.weight += c.weight;
        g.sources.add(si);
        g.bg = g.bg || Boolean(c.bg);
      } else groups.push({ hex: c.hex, weight: c.weight, sources: new Set([si]), bg: Boolean(c.bg) });
    }
  });
  const kept = groups.filter((g) => g.sources.size >= MIN_SOURCES_FOR_COLOUR);
  const palette = kept.sort((a, b) => b.weight - a.weight).map((g) => {
    const { L, C, h } = hexToOklch(g.hex);
    return { hex: g.hex, weight: +(g.weight / palettes.length).toFixed(3), L: +L.toFixed(3), C: +C.toFixed(3), h: +h.toFixed(1), bg: g.bg };
  });
  return { palette, dropped: groups.length - kept.length };
}

export function mergeStyles(project, slugs, as) {
  const sources = slugs.map((slug) => {
    const style = resolveStyle(project, slug);
    const mf = join(styleDir(project, slug), "metrics.json");
    if (!existsSync(mf)) throw new Error(`No metrics.json for "${slug}" (run style-analyze.mjs first): the palette merge needs it`);
    return { slug, style, metrics: readJson(mf) };
  });
  const ties = [];
  const sectionOf = (key) => mergeValues(sources.map((s) => s.style[key]).filter(Boolean), key, ties);
  const brand = sectionOf("brand") ?? {};
  const { palette, dropped } = mergePalettes(sources.map((s) => s.metrics.color?.palette ?? []));
  const roles = assignColorRoles(palette);
  if (Object.keys(roles.colors).length) brand.colors = roles.colors;
  else delete brand.colors;
  const style = { version: 1, slug: as, reference: sources[0].style.reference, brand, provenance: {} };
  for (const k of ["storyboard", "writing", "audio"]) {
    const v = sectionOf(k);
    if (v) style[k] = v;
  }
  style.do_not_copy = [...new Set(sources.flatMap((s) => s.style.do_not_copy ?? []))];
  // Provenance per leaf: the weakest source among the cards that have the field.
  const names = slugs.join(", ");
  for (const path of ["brand", "storyboard", "writing", "audio"].flatMap((k) => (style[k] ? leafPaths(style[k], k, []) : []))) {
    const colour = path.startsWith("brand.colors.");
    const found = colour ? [roles.sources[path.split(".")[2]]] : sources.map((s) => s.style.provenance[path]).filter(Boolean);
    const source = found.reduce((w, p) => (SOURCE_RANK[p.source] > SOURCE_RANK[w] ? p.source : w), "measured");
    style.provenance[path] = { source, note: colour ? `shared by at least ${MIN_SOURCES_FOR_COLOUR} of: ${names}` : `merged from ${names}` };
  }
  const metrics = { schema_version: 1, generated_at: now(), merged_from: slugs, format: sources[0].metrics.format, color: { palette } };
  // Each source enters as its effective style, so what the user set or locked there is part of the blend.
  const carried = sources.flatMap((s) => keptByChoice(project, s.slug).map((p) => `${p} (${s.slug})`));
  return { style, metrics, refs: sources.map((s) => ({ slug: s.slug, reference: s.style.reference })), ties, dropped, notes: roles.notes, carried };
}

export function writeMerged(dir, slugs, as) {
  const project = loadProject(dir);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(as ?? "")) throw new Error("--as needs a kebab-case slug (a-z, 0-9, -)");
  if (slugs.length < 2 || new Set(slugs).size !== slugs.length) throw new Error("Merge needs at least two different styles");
  const sd = styleDir(project, as);
  if (existsSync(join(sd, "style.json"))) throw new Error(`${sd}/style.json already exists; pick another --as`);
  const r = mergeStyles(project, slugs, as);
  const errors = styleErrors(r.style, { slug: as, brand: project.brand });
  if (errors.length) throw new Error(`Merged style is invalid:\n  ${errors.join("\n  ")}`);
  mkdirSync(sd, { recursive: true });
  ensureGitignore(project);
  writeJson(join(sd, "style.json"), r.style);
  writeJson(join(sd, "metrics.json"), r.metrics);
  writeJson(join(sd, "sources.json"), r.refs);
  return { ...r, dir: sd };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["as"] });
    const [dir, ...slugs] = args._;
    if (args.help || !dir || slugs.length < 2 || !args.as) {
      console.log("usage: style-merge.mjs <project-dir> <slug-a> <slug-b> [...] --as <slug>");
      process.exit(args.help ? 0 : 1);
    }
    const r = writeMerged(dir, slugs, args.as);
    console.log(`✓ ${slugs.join(" + ")} → ${r.dir}/style.json`);
    console.log(`  colours: ${Object.keys(r.style.brand.colors).length} role(s) from ${r.metrics.color.palette.length} shared cluster(s); ${r.dropped} cluster(s) seen in one source only were dropped`);
    for (const n of r.notes) console.log(`  · ${n}`);
    if (r.carried.length) console.log(`  kept by your choice (giữ theo lựa chọn của bạn), blended in: ${r.carried.join(", ")}`);
    if (r.ties.length) console.log(`  left open (sources disagree, no majority): ${r.ties.join(", ")}`);
    console.log("Next: style-draft.mjs <dir> <slug> --check, then style-compare.mjs.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
