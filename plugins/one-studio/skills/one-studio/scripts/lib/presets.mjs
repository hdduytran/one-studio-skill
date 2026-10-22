// Brand presets: colours (incl. an optional card surface), surface (flat | glass) and optional fonts.
// Plugin presets live in templates/brand-presets.json (read-only). The user's own presets live in the library
// (lib/library.mjs): <library>/presets/<name>.json, one preset entry per file, written by style-apply --as-preset
// or library.mjs --save-preset. Presets saved in the cache folder before the library existed are still read.
// init-project --preset <name> starts a brand kit from one; compare-presets.mjs shows them side by side.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, readJson } from "./project.mjs";
import { cacheDir } from "./vendor.mjs";
import { mergeBrandPatch } from "./style-refs.mjs";
import { findLibrary, libraryPart, presetDirs } from "./library.mjs";

export const PRESET_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
// Optional preset sections merged over the brand section by section (a preset without them leaves the brand's own).
export const PRESET_EXTRA_SECTIONS = ["motion", "transitions", "captions", "grid", "lower_third"];

export const presetCacheDir = () => join(cacheDir(), "presets");
const pluginPresets = () => readJson(join(TEMPLATE_DIR, "brand-presets.json"));

// -> { presets: {name: entry}, origin: {name: { source: "plugin" | "library" | "cache", file? }} }
// `from` is where the library lookup starts (the project folder). An unreadable file is skipped (it must not
// break init); a name the plugin already uses is skipped with a warning (the plugin's preset wins); between
// library and cache the library wins.
export function scanPresets({ from } = {}) {
  const presets = pluginPresets();
  const origin = Object.fromEntries(Object.keys(presets).map((n) => [n, { source: "plugin" }]));
  const lib = findLibrary(from);
  presetDirs(lib).forEach((dir, i) => {
    if (!existsSync(dir)) return;
    const source = i === 0 && lib.source !== "cache" ? "library" : "cache";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const name = file.slice(0, -5);
      if (!PRESET_NAME_RE.test(name) || origin[name]?.source === "library") continue;
      if (origin[name]?.source === "plugin") {
        console.warn(`Skipped preset "${name}" (${join(dir, file)}): the plugin has a preset with that name; rename or delete the file / bỏ qua preset trùng tên preset của plugin`);
        continue;
      }
      let entry;
      try {
        entry = readJson(join(dir, file));
      } catch {
        continue;
      }
      if (entry && typeof entry === "object" && entry.colors) {
        presets[name] = entry;
        origin[name] = { source, file: join(dir, file) };
      }
    }
  });
  return { presets, origin, library: lib };
}

export const loadPresets = (opts) => scanPresets(opts).presets;
export const PRESET_NAMES = (opts) => Object.keys(loadPresets(opts));

export function assertPresetName(name) {
  if (!PRESET_NAME_RE.test(name)) throw new Error(`Preset name must be kebab-case (a-z, 0-9, -), got "${name}"`);
  if (name in pluginPresets()) throw new Error(`"${name}" is a plugin preset; pick another name`);
}

// Saves a preset entry into the library (the cache folder when no library is set up); returns
// { file, updated, library }. Never touches the plugin's presets.
export function savePreset(name, entry, { from } = {}) {
  assertPresetName(name);
  const lib = findLibrary(from);
  const dir = libraryPart(lib, "presets");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const updated = existsSync(file);
  writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
  return { file, updated, library: lib };
}

// Names from before the library (kept for callers and tests).
export const assertCachePresetName = assertPresetName;
export const saveCachePreset = savePreset;

// A preset entry from a brand kit as it is now (library.mjs --save-preset): colours, surface, fonts and the
// optional sections, without project-specific parts (logo, voice, intro/outro, version).
export function presetFromBrand(brand, about) {
  const fonts = Object.fromEntries(["heading", "body", "mono"].filter((k) => brand.typography?.[k]).map((k) => [k, brand.typography[k]]));
  return {
    about: about ?? `Look of ${brand.name ?? "a project"} v${brand.version ?? 1}`,
    surface: brand.surface ?? "flat",
    colors: { ...brand.colors },
    ...(Object.keys(fonts).length && { typography: fonts }),
    ...Object.fromEntries(PRESET_EXTRA_SECTIONS.filter((k) => brand[k]).map((k) => [k, brand[k]])),
    source: { brand: brand.name ?? null, version: brand.version ?? null },
  };
}

// A new brand object: `brand` with the preset's colours, surface and font overrides (scale, motion… kept
// unless the preset carries those sections).
export function applyPreset(brand, name, opts) {
  const presets = loadPresets(opts);
  const p = presets[name];
  if (!p) throw new Error(`unknown preset "${name}"; use ${Object.keys(presets).join(", ")}`);
  const typography = { ...brand.typography };
  for (const [k, v] of Object.entries(p.typography ?? {})) typography[k] = { ...v };
  const extra = Object.fromEntries(PRESET_EXTRA_SECTIONS.filter((k) => p[k]).map((k) => [k, p[k]]));
  return mergeBrandPatch({ ...brand, preset: name, surface: p.surface ?? "flat", colors: { ...p.colors }, typography }, extra);
}
