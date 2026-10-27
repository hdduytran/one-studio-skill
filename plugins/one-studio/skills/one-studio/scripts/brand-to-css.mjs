#!/usr/bin/env node
// brand.json → <project>/assets/brand.css (CSS variables + @font-face) and assets/brand.js (window.BRAND).
// Also bundles fonts and the logo into assets/, so scenes never fetch anything at render time.
//   node brand-to-css.mjs <project-dir> [--offline]   (--offline: skip @fontsource download, use fallbacks)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isMain, loadProject, parseArgs, validateKind } from "./lib/project.mjs";
import { copyInto, vendorFontsource } from "./lib/vendor.mjs";

const quote = (family) => (/^[\w-]+$/.test(family) ? family : `"${family.replace(/"/g, "")}"`);
const stack = (font, generic) => [quote(font.family), font.fallback ?? generic].join(", ");
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Relative luminance of "#rgb" / "#rrggbb[aa]" (0 = black, 1 = white).
export function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Chips shown while an opinion / quote line is spoken (os.js adds them). Brand variables only.
const LABEL_CSS = `
.os-label {
  position: absolute;
  left: calc(var(--margin) * var(--u));
  top: calc(var(--margin) * 0.6 * var(--u));
  z-index: 40;
  padding: calc(var(--grid-unit) * 0.75 * var(--u)) calc(var(--grid-unit) * 2 * var(--u));
  font-family: var(--font-body);
  font-weight: var(--fw-heading);
  font-size: calc(var(--fs-small) * var(--u));
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: calc(var(--grid-unit) * var(--u));
}
.os-label-opinion { background: var(--c-accent); color: var(--c-bg); }
.os-label-quote { background: var(--c-bg); color: var(--c-fg); border: calc(2 * var(--u)) solid var(--c-accent); text-transform: none; letter-spacing: 0; }
`;

// colors.surface (flat brands): cards and panels take the brand's surface colour instead of a tint of fg.
// Only written when the role is set, so brands without it keep a byte-identical brand.css (no re-render).
const SURFACE_CSS = `/* colors.surface: card / panel fill */
html .os-card, html .os-glass {
  background: var(--c-surface);
  border-color: color-mix(in srgb, var(--c-fg) 8%, transparent);
}
`;

// brand.surface = "glass": macOS-style frosted cards over a soft wallpaper of brand-colour glows.
// `html …` selectors outrank the flat defaults in os.css, so scenes need no extra <link> or classes:
// every .os-card (and .os-glass) turns to glass, every .os-scene gets the wallpaper.
export function glassCss(brand) {
  const light = luminance(brand.colors.bg) > 0.4;
  const hair = light ? "rgba(255, 255, 255, 0.72)" : "rgba(255, 255, 255, 0.16)";
  const glint = light ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.22)";
  const shadow = light ? "rgba(0, 0, 0, 0.10)" : "rgba(0, 0, 0, 0.45)";
  const glow = light ? [34, 30, 24] : [42, 36, 30];
  return `/* surface: glass */
html .os-scene {
  background:
    radial-gradient(60% 55% at 12% 18%, color-mix(in srgb, var(--c-primary) ${glow[0]}%, transparent), transparent 70%),
    radial-gradient(55% 50% at 88% 22%, color-mix(in srgb, var(--c-secondary) ${glow[1]}%, transparent), transparent 72%),
    radial-gradient(65% 60% at 70% 96%, color-mix(in srgb, var(--c-accent) ${glow[2]}%, transparent), transparent 70%),
    var(--c-bg);
}
html .os-card, html .os-glass {
  background: color-mix(in srgb, var(--c-bg) 52%, transparent);
  -webkit-backdrop-filter: blur(calc(36 * var(--u))) saturate(180%);
  backdrop-filter: blur(calc(36 * var(--u))) saturate(180%);
  border: calc(1.5 * var(--u)) solid ${hair};
  border-radius: calc(var(--grid-unit) * 3.5 * var(--u));
  box-shadow: inset 0 calc(1.5 * var(--u)) 0 ${glint}, 0 calc(24 * var(--u)) calc(64 * var(--u)) ${shadow};
}
`;
}

// project-like: { brand, brandPath, root }; assetsDir defaults to <root>/assets.
export function brandToCss(project, { offline = false, assetsDir } = {}) {
  const brand = project.brand;
  if (!brand) throw new Error(`brand.json not found at ${project.brandPath}`);
  const errors = validateKind("brand", brand);
  if (errors.length) throw new Error(`brand.json is not valid:\n  ${errors.join("\n  ")}`);
  const assets = assetsDir ?? join(project.root, "assets");
  const brandDir = dirname(project.brandPath);
  mkdirSync(assets, { recursive: true });

  // Fonts: group weights per fontsource spec, copy local files.
  const faces = [];
  const bySpec = new Map();
  for (const font of Object.values(brand.typography).filter((f) => f && typeof f === "object" && f.family)) {
    if (font.fontsource) bySpec.set(font.fontsource, [...(bySpec.get(font.fontsource) ?? []), font.weight ?? 400]);
    if (font.src) {
      const src = resolve(brandDir, font.src);
      if (!existsSync(src)) throw new Error(`font file not found: ${src}`);
      copyInto(src, join(assets, "fonts"));
      faces.push(
        `@font-face {\n  font-family: ${quote(font.family)};\n  font-weight: ${font.weight ?? 400};\n  font-display: block;\n  src: url(fonts/${basename(src)});\n}`,
      );
    }
  }
  if (!offline) for (const [spec, weights] of bySpec) faces.push(vendorFontsource(spec, weights, assets));

  let logo = null;
  if (brand.logo?.svg) {
    const src = resolve(brandDir, brand.logo.svg);
    if (!existsSync(src)) throw new Error(`logo not found: ${src}`);
    copyInto(src, join(assets, "brand"), "logo.svg");
    logo = "brand/logo.svg";
  }

  const t = brand.typography;
  const vars = [];
  for (const [k, v] of Object.entries(brand.colors)) vars.push(`--c-${kebab(k)}: ${v};`);
  vars.push(`--font-heading: ${stack(t.heading, "sans-serif")};`, `--fw-heading: ${t.heading.weight ?? 700};`);
  vars.push(`--font-body: ${stack(t.body, "sans-serif")};`, `--fw-body: ${t.body.weight ?? 400};`);
  vars.push(`--font-mono: ${t.mono ? stack(t.mono, "monospace") : "ui-monospace, monospace"};`);
  const scale = { display: 120, h1: 88, h2: 64, body: 40, caption: 44, small: 28, ...(t.scale ?? {}) };
  for (const [k, v] of Object.entries(scale)) vars.push(`--fs-${kebab(k)}: ${v};`);
  const g = { unit: 8, margin: 96, columns: 12, safe_area: 0.06, ...(brand.grid ?? {}) };
  vars.push(`--grid-unit: ${g.unit};`, `--margin: ${g.margin};`, `--columns: ${g.columns};`, `--safe: ${g.safe_area};`);
  for (const [k, v] of Object.entries(brand.motion.duration)) vars.push(`--dur-${kebab(k)}: ${v}s;`);
  vars.push(`--stagger: ${brand.motion.stagger ?? 0.08}s;`);
  const cap = brand.captions ?? {};
  vars.push(`--caption-size: ${cap.size ?? 44};`, `--caption-color: ${cap.color ?? "#ffffff"};`, `--caption-bg: ${cap.background ?? "rgba(0,0,0,0.55)"};`);
  if (logo) vars.push(`--logo: url(${logo});`);

  const surface = brand.surface ?? "flat";
  vars.push(`--surface: ${surface};`);

  const header = `/* Generated by one-studio brand-to-css from ${brand.name} v${brand.version}. Do not edit: change brand.json and re-run. */`;
  const css = `${header}\n${faces.join("\n\n")}\n\n:root {\n  ${vars.join("\n  ")}\n}\n${LABEL_CSS}${surface === "glass" ? `\n${glassCss(brand)}` : brand.colors.surface ? `\n${SURFACE_CSS}` : ""}`;
  writeFileSync(join(assets, "brand.css"), css);

  const tokens = {
    name: brand.name,
    version: brand.version,
    colors: brand.colors,
    motion: { stagger: 0.08, ...brand.motion },
    transitions: { default: "fade", duration: 0.4, ...(brand.transitions ?? {}) },
    captions: cap,
    surface,
    logo,
    fonts: [t.heading.family, t.body.family, t.mono?.family].filter(Boolean),
  };
  writeFileSync(join(assets, "brand.js"), `${header}\nwindow.BRAND = ${JSON.stringify(tokens, null, 2)};\n`);
  return { css: join(assets, "brand.css"), js: join(assets, "brand.js"), fonts: faces.length, logo };
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["offline", "help"] });
  if (args.help || !args._[0]) {
    console.log("usage: brand-to-css.mjs <project-dir> [--offline]");
    process.exit(args._[0] ? 0 : 1);
  }
  const project = loadProject(args._[0]);
  const r = brandToCss(project, { offline: args.offline });
  console.log(`✓ ${project.brand.name} v${project.brand.version} → ${r.css} (${r.fonts} font block(s)${r.logo ? ", logo" : ""})`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
