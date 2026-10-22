#!/usr/bin/env node
// A local page to adjust a style by eye: reference frames on the left, the three sample scenes on the right,
// colour / font / motion / caption controls below. One HTML file that works from file:// (no server, no network).
//   node style-editor.mjs <project-dir> <slug> [--variant v] [--offline]   → review/style-editor.html
// The scenes live in review/style-editor/ (staged brand.css, fonts, runtime): the page overrides CSS variables on
// top of them for an instant preview, so what you see is the real brand.css, not a mock-up. Nothing is rendered
// and nothing in the project changes. "Sao chép thay đổi" gives one `style-set.mjs …` line: paste it in the chat.
// The sheet from style-compare.mjs stays the thing the user approves; this page is a tool for getting there.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { brandToCss } from "./brand-to-css.mjs";
import { flatten, loadLayers, lockedOf, composeLayers } from "./lib/style-layers.mjs";
import { mergeBrandPatch, styleDir } from "./lib/style-refs.mjs";
import { loadFontMap } from "./lib/style-fonts.mjs";
import { SAMPLES, SAMPLE_DIR, sampleHtml } from "./lib/style-samples.mjs";
import { stageBrand } from "./lib/stage-brand.mjs";
import { vendorFontsource } from "./lib/vendor.mjs";
import { escapeHtml } from "./lib/scenes.mjs";
import { referenceFrames } from "./style-compare.mjs";

const TEMPLATES = join(SAMPLE_DIR, "..", "editor");
const BRAND_SECTIONS = ["colors", "surface", "typography", "motion", "transitions", "captions"];

const T = {
  vi: { title: "Chỉnh style", hint: "Kéo, chọn màu, đổi font: ba cảnh mẫu đổi ngay. Xong thì bấm “Sao chép thay đổi” và dán dòng lệnh vào chat; Claude chạy rồi cho bạn xem lại sheet so sánh. Trang này chỉ để chỉnh, bản duyệt là sheet.", frames: "Khung gốc", samples: "Cảnh mẫu theo style", command: "Dòng lệnh", copy: "Sao chép thay đổi", copied: "Đã chép", reset: "Đặt lại", replay: "Phát lại", nothing: "Chưa đổi gì.", noFrames: "Khung gốc đã bị xoá sau khi áp dụng.", lock: "Khoá: lần trích xuất lại không đổi trường này", colors: "Màu", fonts: "Phông chữ", motion: "Chuyển động & nhịp", captions: "Phụ đề", surface: "Bề mặt & chuyển cảnh", similarity: "Độ giống gốc", similarityHint: "100% = style này, 0% = brand hiện tại", contrast: "Tương phản", noPreview: "chưa nạp được", custom: "tự chọn" },
  en: { title: "Edit style", hint: "Drag, pick colours, change fonts: the three sample scenes update at once. When done press “Copy changes” and paste the line into the chat; Claude runs it and shows the compare sheet again. This page is for adjusting; the sheet is what gets approved.", frames: "Reference frames", samples: "Samples in this style", command: "Command", copy: "Copy changes", copied: "Copied", reset: "Reset", replay: "Replay", nothing: "Nothing changed.", noFrames: "Reference frames were removed after apply.", lock: "Lock: a new extraction will not change this field", colors: "Colours", fonts: "Fonts", motion: "Motion & pace", captions: "Captions", surface: "Surface & transitions", similarity: "Likeness to the original", similarityHint: "100% = this style, 0% = current brand", contrast: "Contrast", noPreview: "not loaded", custom: "custom" },
};

// A module's source without its imports and `export`s, so the page can run the same code the tests import.
const inline = (file) => readFileSync(file, "utf8").split("\n").filter((l) => !/^import\s/.test(l)).join("\n").replace(/^export\s+/gm, "");
const libs = join(import.meta.dirname, "lib");
const LIB_JS = `const Blend = (() => {\n${inline(join(libs, "color.mjs"))}\n${inline(join(libs, "style-blend.mjs"))}\nreturn { blendFlat, diffChanges, buildSetCommand, unitOf, contrastRatio, lerpHex };\n})();`;

const pickBrand = (brand) => Object.fromEntries(BRAND_SECTIONS.filter((k) => brand[k] !== undefined).map((k) => [k, brand[k]]));

// The staged scenes: the three samples with the bridge script right after brand.js.
function stageScenes(project, brand, root, { ratio, offline }) {
  const { width, height } = ASPECTS[ratio];
  const lang = project.studio.meta.language;
  const scenes = SAMPLES.map((s) => ({ id: s.id, html: sampleHtml(s.id, { width, height, lang, brand }).replace('<script src="../assets/brand.js"></script>', '<script src="../assets/brand.js"></script>\n<script src="../editor-bridge.js"></script>') }));
  const { warning } = stageBrand(project, { root, brand, scenes, offline, label: "editor" });
  copyFileSync(join(TEMPLATES, "editor-bridge.js"), join(root, "editor-bridge.js"));
  return warning;
}

// Every map font that can be bundled gets its @font-face (the font select needs them loaded), and brand-flat.css /
// brand-glass.css let the page switch surface. -> Set of families that will actually render.
function stageStylesheets(project, brand, root, { offline }) {
  const assets = join(root, "assets");
  let extra = "";
  if (!offline) {
    for (const row of loadFontMap().filter((r) => r.fontsource)) {
      try {
        extra += `\n${vendorFontsource(row.fontsource, row.weights, assets)}\n`;
      } catch {
        // not cached and no network: the font stays "not loaded" in the select
      }
    }
  }
  const main = readFileSync(join(assets, "brand.css"), "utf8") + extra;
  writeFileSync(join(assets, "brand.css"), main);
  const surface = brand.surface ?? "flat";
  const scratch = join(root, ".surface");
  for (const s of ["flat", "glass"]) {
    let css = main;
    if (s !== surface) {
      mkdirSync(scratch, { recursive: true });
      try {
        brandToCss({ brand: { ...brand, surface: s }, brandPath: project.brandPath, root }, { offline, assetsDir: scratch });
      } catch {
        brandToCss({ brand: { ...brand, surface: s }, brandPath: project.brandPath, root }, { offline: true, assetsDir: scratch });
      }
      css = readFileSync(join(scratch, "brand.css"), "utf8") + extra;
    }
    writeFileSync(join(assets, `brand-${s}.css`), css);
  }
  rmSync(scratch, { recursive: true, force: true });
  return new Set([...main.matchAll(/font-family:\s*['"]?([^;'"]+?)['"]?;/g)].map((m) => m[1].trim()));
}

export function buildEditor(dir, slug, { variant, offline = false } = {}) {
  const project = loadProject(dir);
  if (!project.brand) throw new Error("brand.json not found; run init-project.mjs first");
  const { base, layers } = loadLayers(project, slug, variant);
  const style = composeLayers(base, layers);
  const brand = { ...mergeBrandPatch(project.brand, style.brand), name: `${project.brand.name} · ${slug}` };
  const ratio = project.studio.format.aspect;
  const root = join(project.root, "review", "style-editor");
  const warning = stageScenes(project, brand, root, { ratio, offline });
  const embedded = stageStylesheets(project, brand, root, { offline });
  const lang = project.studio.meta.language?.startsWith("vi") ? "vi" : "en";
  const t = T[lang];
  const data = {
    slug,
    variant: variant ?? null,
    dir: project.root,
    t,
    title: `${t.title} · ${slug}${variant ? ` (${variant})` : ""}`,
    size: ASPECTS[ratio],
    scenes: SAMPLES.map((s) => ({ id: s.id, label: s.label, src: `style-editor/scenes/${s.id}.html` })),
    frames: referenceFrames(styleDir(project, slug)).map((f) => relative(join(project.root, "review"), f)),
    initial: flatten({ brand: pickBrand(brand), storyboard: style.storyboard, writing: style.writing, audio: style.audio }),
    base: flatten({ brand: pickBrand(project.brand) }),
    styleHas: Object.keys(flatten(style)),
    locked: lockedOf(layers),
    fonts: loadFontMap().map((r) => ({ family: r.family, weights: r.weights, fallback: r.fallback, fontsource: r.fontsource, embedded: embedded.has(r.family) })),
  };
  const fill = { lang, title: escapeHtml(data.title), css: readFileSync(join(TEMPLATES, "editor.css"), "utf8"), data: JSON.stringify(data).replace(/</g, "\\u003c"), lib_js: LIB_JS, client_js: readFileSync(join(TEMPLATES, "editor-client.js"), "utf8") };
  const html = readFileSync(join(TEMPLATES, "editor.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  const file = join(project.root, "review", "style-editor.html");
  mkdirSync(join(project.root, "review"), { recursive: true });
  writeFileSync(file, html);
  return { file, root, data, warning, lang, embedded: data.fonts.filter((f) => f.embedded).map((f) => f.family) };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help", "offline"], options: ["variant"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-editor.mjs <project-dir> <slug> [--variant v] [--offline]");
      process.exit(dir && slug ? 0 : 1);
    }
    const r = buildEditor(dir, slug, { variant: args.variant, offline: args.offline });
    if (r.warning) console.log(`⚠ ${r.warning}`);
    const vi = r.lang === "vi";
    console.log(`${vi ? "Trang chỉnh" : "Editor"}: ${relative(process.cwd(), r.file) || r.file}`);
    console.log(vi ? "Mở bằng trình duyệt (file:// là đủ, không cần mạng), chỉnh, bấm “Sao chép thay đổi”, dán dòng lệnh vào chat." : "Open it in a browser (file:// is enough, no network), adjust, press “Copy changes”, paste the line into the chat.");
    console.log(`${vi ? "Font xem trước được" : "Fonts that preview"}: ${r.embedded.join(", ") || "—"}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
