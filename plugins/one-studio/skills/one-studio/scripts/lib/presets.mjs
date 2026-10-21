// Brand presets (templates/brand-presets.json): colours, surface (flat | glass) and optional fonts.
// init-project --preset <name> starts a brand kit from one; compare-presets.mjs shows them side by side.
import { join } from "node:path";
import { TEMPLATE_DIR, readJson } from "./project.mjs";

export const loadPresets = () => readJson(join(TEMPLATE_DIR, "brand-presets.json"));
export const PRESET_NAMES = () => Object.keys(loadPresets());

// A new brand object: `brand` with the preset's colours, surface and font overrides (scale, motion… kept).
export function applyPreset(brand, name) {
  const presets = loadPresets();
  const p = presets[name];
  if (!p) throw new Error(`unknown preset "${name}"; use ${Object.keys(presets).join(", ")}`);
  const typography = { ...brand.typography };
  for (const [k, v] of Object.entries(p.typography ?? {})) typography[k] = { ...v };
  return { ...brand, preset: name, surface: p.surface ?? "flat", colors: { ...p.colors }, typography };
}
