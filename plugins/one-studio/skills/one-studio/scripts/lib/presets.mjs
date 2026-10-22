// Brand presets: colours, surface (flat | glass) and optional fonts.
// Plugin presets live in templates/brand-presets.json (read-only); presets saved from an extracted style live in
// `${cacheDir()}/presets/<name>.json` (one preset entry per file, written by style-apply --as-preset).
// init-project --preset <name> starts a brand kit from one; compare-presets.mjs shows them side by side.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, readJson } from "./project.mjs";
import { cacheDir } from "./vendor.mjs";
import { mergeBrandPatch } from "./style-refs.mjs";

export const PRESET_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
// Optional preset sections merged over the brand section by section (a preset without them leaves the brand's own).
export const PRESET_EXTRA_SECTIONS = ["motion", "transitions", "captions", "grid", "lower_third"];

export const presetCacheDir = () => join(cacheDir(), "presets");
const pluginPresets = () => readJson(join(TEMPLATE_DIR, "brand-presets.json"));

// Plugin presets plus cached ones. A cached file that is unreadable is skipped (it must not break init);
// one that reuses a plugin preset's name is skipped with a warning (the plugin's preset wins).
export function loadPresets() {
  const presets = pluginPresets();
  const dir = presetCacheDir();
  if (!existsSync(dir)) return presets;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const name = file.slice(0, -5);
    if (!PRESET_NAME_RE.test(name)) continue;
    if (name in presets) {
      console.warn(`Skipped cached preset "${name}" (${join(dir, file)}): the plugin has a preset with that name; rename or delete the file / bỏ qua preset trong cache trùng tên preset của plugin`);
      continue;
    }
    let entry;
    try {
      entry = readJson(join(dir, file));
    } catch {
      continue;
    }
    if (entry && typeof entry === "object" && entry.colors) presets[name] = entry;
  }
  return presets;
}
export const PRESET_NAMES = () => Object.keys(loadPresets());

// Saves a preset entry into the cache; returns { file, updated }. Never touches the plugin's presets.
export function assertCachePresetName(name) {
  if (!PRESET_NAME_RE.test(name)) throw new Error(`Preset name must be kebab-case (a-z, 0-9, -), got "${name}"`);
  if (name in pluginPresets()) throw new Error(`"${name}" is a plugin preset; pick another name`);
}

export function saveCachePreset(name, entry) {
  assertCachePresetName(name);
  const dir = presetCacheDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const updated = existsSync(file);
  writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
  return { file, updated };
}

// A new brand object: `brand` with the preset's colours, surface and font overrides (scale, motion… kept
// unless the preset carries those sections).
export function applyPreset(brand, name) {
  const presets = loadPresets();
  const p = presets[name];
  if (!p) throw new Error(`unknown preset "${name}"; use ${Object.keys(presets).join(", ")}`);
  const typography = { ...brand.typography };
  for (const [k, v] of Object.entries(p.typography ?? {})) typography[k] = { ...v };
  const extra = Object.fromEntries(PRESET_EXTRA_SECTIONS.filter((k) => p[k]).map((k) => [k, p[k]]));
  return mergeBrandPatch({ ...brand, preset: name, surface: p.surface ?? "flat", colors: { ...p.colors }, typography }, extra);
}
