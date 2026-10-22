// colors.surface: the card / panel fill (cream cards on a lavender page). Mapped from a reference, emitted as
// --c-surface and the .os-card background, and checked as a background for text, never darkened as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmp } from "./helpers.mjs";

const S = "../plugins/one-studio/skills/one-studio/scripts";
const roles = await import(`${S}/lib/style-color-roles.mjs`);
const contrast = await import(`${S}/lib/style-contrast.mjs`);
const color = await import(`${S}/lib/color.mjs`);
const { brandToCss } = await import(`${S}/brand-to-css.mjs`);
const { validateKind } = await import(`${S}/lib/project.mjs`);

const cluster = (hex, weight, bg = false) => {
  const { L, C, h } = color.hexToOklch(hex);
  return { hex, weight, L: +L.toFixed(3), C: +C.toFixed(3), h: +h.toFixed(1), bg };
};

test("a large near-neutral panel close to bg is mapped to surface, not to primary", () => {
  // The Claude Duet frames: lavender page, cream cards, near-black text, a rust accent and a slate violet.
  const r = roles.assignColorRoles([cluster("#cccad8", 0.5, true), cluster("#faf9f5", 0.25), cluster("#141413", 0.1), cluster("#b25435", 0.06), cluster("#716c8c", 0.05)]);
  assert.equal(r.colors.surface, "#faf9f5");
  assert.notEqual(r.colors.primary, "#faf9f5");
  assert.equal(r.sources.surface.source, "measured");
  // No such panel: no surface role.
  assert.equal(roles.assignColorRoles([cluster("#f5f4ef", 0.8, true), cluster("#1c1e22", 0.15), cluster("#d7262e", 0.05)]).colors.surface, undefined);
});

test("contrast: text is checked on the surface too, and the surface is never the colour to change", () => {
  const colors = { bg: "#cccad8", fg: "#8a8a8a", primary: "#716c8c", accent: "#b25435", surface: "#faf9f5" };
  const issues = contrast.contrastIssues(colors);
  assert.ok(issues.some((i) => i.token === "colors.fg" && i.on === "surface"));
  assert.ok(!issues.some((i) => i.token === "colors.surface"));
  const fixed = contrast.fixContrastOn("#8a8a8a", ["#cccad8", "#faf9f5"], contrast.AA_TEXT);
  for (const bg of ["#cccad8", "#faf9f5"]) assert.ok(color.contrastRatio(fixed, bg) >= contrast.AA_TEXT, `${fixed} on ${bg}`);
  assert.deepEqual(contrast.contrastIssues({ ...colors, fg: "#141413" }).filter((i) => i.on === "surface"), []);
});

test("brand.css: --c-surface and the card fill only when the brand has a surface", () => {
  const brand = JSON.parse(readFileSync("examples/demo/brand/brand.json", "utf8"));
  const write = (b) => {
    const root = tmp();
    mkdirSync(join(root, "brand"), { recursive: true });
    brandToCss({ brand: b, brandPath: join(root, "brand", "brand.json"), root }, { offline: true });
    return readFileSync(join(root, "assets", "brand.css"), "utf8");
  };
  const plain = write({ ...brand, surface: "flat" });
  assert.ok(!plain.includes("--c-surface") && !plain.includes("colors.surface"));
  const withSurface = { ...brand, surface: "flat", colors: { ...brand.colors, surface: "#faf9f5" } };
  assert.deepEqual(validateKind("brand", withSurface), []);
  const css = write(withSurface);
  assert.match(css, /--c-surface: #faf9f5;/);
  assert.match(css, /html \.os-card, html \.os-glass \{\n  background: var\(--c-surface\);/);
});
