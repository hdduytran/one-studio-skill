#!/usr/bin/env node
// Apply an extracted style to the project.
//   node style-apply.mjs <project-dir> <slug> [--variant v] [--as-preset name] [--keep] [--dry-run] [--allow-low-contrast]
//   brand.json        the style's brand patch merged over it (section by section), version +1 (unchanged when the brand already matches)
//   studio.json       story.style = {slug, variant?}; story.format / story.tone only when still empty
//   style-refs/<slug>/hints.json   storyboard / audio / writing hints that gates 3 and 7 read
//   --as-preset       also saves the look to ${ONE_STUDIO_CACHE}/presets/<name>.json (usable by init-project --preset)
//   cleanup           source.* and frames/ are deleted unless --keep (or the fetch recorded keep: true)
//   contrast          text/background pairs under WCAG AA refuse the apply (nothing written) unless --allow-low-contrast
// The script never asks anything: SKILL.md has Claude confirm first, and a version bump re-opens every
// approved scene (the count is printed). Nothing from style-refs/ is copied into assets/ or out/.
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, parseArgs, readJson, validateKind, writeJson } from "./lib/project.mjs";
import { mergeBrandPatch, resolveStyle, styleContentHash, styleDir } from "./lib/style-refs.mjs";
import { PRESET_EXTRA_SECTIONS, assertCachePresetName, loadPresets, saveCachePreset } from "./lib/presets.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { stripUserinfo } from "./lib/ytdlp.mjs";
import { contrastIssues } from "./lib/style-contrast.mjs";

// JSON with object keys sorted, so two brands compare equal whatever their key order.
const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const withoutMeta = ({ version, preset, ...rest }) => rest;

// Approved scenes whose approval no longer matches once `brand` is the project's brand (the same
// comparison render-changed-scenes makes, evaluated for the new brand version).
export function reapprovalCount(project, brand) {
  const next = { ...project, brand };
  const states = new Map((project.studio.scenes ?? []).map((s) => [s.id, s]));
  const scenes = (project.storyboard?.scenes ?? []).filter((s) => sceneSourceExists(project, s));
  const approved = scenes.filter((s) => states.get(s.id)?.approved_hash);
  return { approved: approved.length, reapprove: approved.filter((s) => states.get(s.id).approved_hash !== sceneHash(next, s)).length, scenes: scenes.length };
}

// One-line description for a preset: the first prose line of STYLE.md, else the reference title.
function presetAbout(sd, style) {
  const file = join(sd, "STYLE.md");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^(#|Reference:|Card:|[-*]\s|`)/.test(l));
  return (line ?? `Style from ${style.reference.title ?? style.slug}`).slice(0, 160);
}

// A preset entry (same shape as templates/brand-presets.json) plus where the look came from.
export function presetEntry(style, sd) {
  const b = style.brand;
  const fonts = Object.fromEntries(["heading", "body", "mono"].filter((k) => b.typography?.[k]).map((k) => [k, b.typography[k]]));
  return {
    about: presetAbout(sd, style),
    surface: b.surface ?? "flat",
    // A preset replaces the whole palette, so roles the style could not measure come from the default preset.
    colors: { ...loadPresets().default.colors, ...b.colors },
    ...(Object.keys(fonts).length && { typography: fonts }),
    ...Object.fromEntries(PRESET_EXTRA_SECTIONS.filter((k) => b[k]).map((k) => [k, b[k]])),
    source: { slug: style.slug, ...(style.reference.url && { url: stripUserinfo(style.reference.url) }), ...(style.reference.title && { title: style.reference.title }) },
  };
}

function cleanupSource(sd, keep) {
  if (keep) return [];
  const gone = readdirSync(sd).filter((f) => f.startsWith("source.") || f === "frames");
  for (const f of gone) rmSync(join(sd, f), { recursive: true, force: true });
  return gone;
}

export function applyStyle(dir, slug, { variant, asPreset, keep = false, dryRun = false, allowLowContrast = false } = {}) {
  if (asPreset) assertCachePresetName(asPreset);
  const project = loadProject(dir);
  if (!project.brand) throw new Error("brand.json not found; run init-project.mjs first");
  const style = resolveStyle(project, slug, { variant });
  const sd = styleDir(project, slug);
  const merged = mergeBrandPatch(project.brand, style.brand);
  // Applying a style the brand already carries changes nothing: keep the version (no scene is re-opened) and the preset.
  const unchanged = canonical(withoutMeta(merged)) === canonical(withoutMeta(project.brand));
  const brand = unchanged ? project.brand : merged;
  if (!unchanged) {
    brand.version = (project.brand.version ?? 1) + 1;
    delete brand.preset; // the colours no longer match the preset the kit started from
  }
  const errors = validateKind("brand", brand);
  if (errors.length) throw new Error(`Merged brand.json would be invalid:\n  ${errors.join("\n  ")}`);

  // Writers-room choices already approved stay; the style only fills what is empty.
  const story = { ...project.studio.story };
  const filled = [];
  for (const k of ["format", "tone"]) {
    if (style.writing?.[k] && !story[k]) {
      story[k] = style.writing[k];
      filled.push(k);
    }
  }
  story.style = { slug, ...(variant && { variant }) };
  const studio = { ...project.studio, story };
  const studioErrors = validateKind("studio", studio);
  if (studioErrors.length) throw new Error(`studio.json would be invalid:\n  ${studioErrors.join("\n  ")}`);

  // Pairs under WCAG AA once applied. Refused unless the user knowingly accepts them: the fix is the contrast
  // proposal of style-enhance or other colours.
  const contrast = contrastIssues(brand.colors, brand.captions).map((i) => `${i.token}${i.on === "surface" ? " on surface" : ""} ${i.ratio.toFixed(1)} < ${i.min}`);
  if (contrast.length && !allowLowContrast) {
    throw new Error(`Refused: text/background pairs below WCAG AA (${contrast.join(", ")}). Accept the "contrast" proposal (style-enhance.mjs ${dir} ${slug} lists it; then --accept contrast) or set other colours with style-set.mjs; pass --allow-low-contrast only if the user insists. Nothing was written.`);
  }

  const info = existsSync(join(sd, "info.json")) ? readJson(join(sd, "info.json")) : {};
  // Scene templates style-enhance generated (lower third, intro, outro, thumbnail), for gate 3 to offer.
  const partsDir = join(sd, "parts");
  const parts = existsSync(partsDir) ? readdirSync(partsDir).filter((f) => f.endsWith(".html")).sort() : [];
  const hints = { slug, ...(variant && { variant }), applied_hash: styleContentHash(project, slug, variant), storyboard: style.storyboard ?? {}, audio: style.audio ?? {}, writing: style.writing ?? {}, do_not_copy: style.do_not_copy ?? [], ...(parts.length && { parts }) };
  const result = { brandPath: project.brandPath, version: brand.version, ...reapprovalCount(project, brand), filled, series: project.studio.meta.series ?? null, hintsFile: join(sd, "hints.json"), preset: null, removed: [], dryRun,
    contrast };
  if (dryRun) return result;

  if (asPreset) result.preset = saveCachePreset(asPreset, presetEntry(style, sd));
  writeJson(project.brandPath, brand);
  project.studio = studio;
  project.save();
  writeJson(result.hintsFile, hints);
  result.removed = cleanupSource(sd, keep || info.keep === true);
  return result;
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["keep", "dry-run", "help", "allow-low-contrast"], options: ["variant", "as-preset"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-apply.mjs <project-dir> <slug> [--variant v] [--as-preset name] [--keep] [--dry-run] [--allow-low-contrast]");
      process.exit(dir && slug ? 0 : 1);
    }
    const r = applyStyle(dir, slug, { variant: args.variant, asPreset: args["as-preset"], keep: args.keep, dryRun: args["dry-run"], allowLowContrast: args["allow-low-contrast"] });
    console.log(`${r.dryRun ? "Would apply" : "✓ Applied"} ${slug} → ${r.brandPath} (version ${r.version})${r.series ? ` — shared by series ${r.series}` : ""}`);
    console.log(`  ${r.reapprove} of ${r.scenes} scene(s) need re-approval (${r.approved} approved now); every scene hash changes with the brand version`);
    if (r.contrast.length) console.log(`  ⚠ below WCAG AA, applied because of --allow-low-contrast: ${r.contrast.join(", ")}`);
    if (r.filled.length) console.log(`  story ${r.filled.join(", ")} filled from the style (they were empty)`);
    if (r.dryRun) process.exit(0);
    console.log(`  hints: ${r.hintsFile} (read at gates 3 and 7)`);
    if (r.preset) console.log(`  preset ${args["as-preset"]} ${r.preset.updated ? "updated" : "saved"}: ${r.preset.file}`);
    console.log(r.removed.length ? `  removed ${r.removed.join(", ")} from style-refs/${slug}/` : "  source footage kept");
    console.log("Next: prepare-project.mjs, then keyframe-stills.mjs and re-approve the scenes (ask the user first).");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
