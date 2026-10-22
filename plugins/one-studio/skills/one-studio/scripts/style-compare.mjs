#!/usr/bin/env node
// Three sample scenes (title, chart, caption) rendered in an extracted style, under the reference's own frames.
//   node style-compare.mjs <project-dir> <slug> [--variant v] [--ratio 9:16] [--offline]
//        → review/style-<slug>-compare.jpg: row 1 reference frames · row 2 samples · row 3 colour tokens
// The style is merged over the project's brand in a staging copy (.one-studio/styles/<slug>/); brand.json, the
// project's assets, scenes and approvals stay untouched. No video is rendered. Use before style-apply.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, TEMPLATE_DIR, isMain, loadProject, parseArgs, readJson } from "./lib/project.mjs";
import { mergeBrandPatch, resolveStyle, styleDir } from "./lib/style-refs.mjs";
import { buildIndex } from "./lib/scenes.mjs";
import { run } from "./lib/ffmpeg.mjs";
import { hexToRgb, rgbToHex } from "./lib/color.mjs";
import { snapshotStills, stageBrand } from "./lib/stage-brand.mjs";
import { contactSheet } from "./keyframe-stills.mjs";

const SAMPLES = [{ id: "title", label: "title" }, { id: "data", label: "chart" }, { id: "caption", label: "caption" }];
const SAMPLE_SECONDS = 3.5;
const SAMPLE_DIR = join(TEMPLATE_DIR, "..", "..", "style-extract", "templates", "samples");
const TOKENS = ["bg", "fg", "primary", "secondary", "accent", "muted"];

// _head.html opens the scene root; the sample file is the rest of the document.
function sampleHtml(name, { id, width, height, lang, brand }) {
  const tr = brand.transitions ?? {};
  const vars = { id, type: "text", lang, width, height, duration: SAMPLE_SECONDS, extra_head: "", transition_in: tr.default ?? "fade", transition_out: tr.default ?? "fade", transition_duration: tr.duration ?? 0.4 };
  const html = readFileSync(join(TEMPLATE_DIR, "scenes", "_head.html"), "utf8") + readFileSync(join(SAMPLE_DIR, `${name}.html`), "utf8");
  return html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Aspect of the reference: --ratio, else the analysed video's (when it is one we can lay out), else the project's.
function pickRatio(project, sd, requested) {
  if (requested) {
    if (!ASPECTS[requested]) throw new Error(`unknown ratio ${requested}; use ${Object.keys(ASPECTS).join(", ")}`);
    return requested;
  }
  const file = join(sd, "metrics.json");
  const fromMetrics = existsSync(file) ? readJson(file).format?.aspect : null;
  return ASPECTS[fromMetrics] ? fromMetrics : project.studio.format.aspect;
}

// One PNG per pair of tokens, as wide as a sample still, so the colours sit under the scenes.
function tokenStrips(colors, ratio, dir) {
  const { width } = ASPECTS[ratio];
  const present = TOKENS.filter((t) => colors[t]);
  const strips = [];
  for (let i = 0; i < present.length; i += 2) {
    const pair = present.slice(i, i + 2);
    const half = Math.round(width / pair.length);
    const out = join(dir, `tokens-${i / 2}.png`);
    const inputs = pair.flatMap((t) => ["-f", "lavfi", "-i", `color=c=${rgbToHex(hexToRgb(colors[t])).replace("#", "0x")}:s=${half}x${Math.round(width / 6)}:d=1`]);
    run("ffmpeg", ["-nostdin", "-y", "-v", "error", ...inputs, "-filter_complex", pair.length > 1 ? "hstack=inputs=2" : "null", "-frames:v", "1", out]);
    strips.push({ file: out, label: pair.join(" + ") });
  }
  return strips;
}

// Up to three reference frames spread over frames/ (kept only until style-apply cleans up).
function referenceFrames(sd) {
  const dir = join(sd, "frames");
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => /^frame-\d+\.jpg$/.test(f)).sort() : [];
  if (all.length <= 3) return all.map((f) => join(dir, f));
  return [0, Math.floor((all.length - 1) / 2), all.length - 1].map((i) => join(dir, all[i]));
}

export function compareStyle(dir, slug, { variant, ratio, offline = false } = {}) {
  const project = loadProject(dir);
  if (!project.brand) throw new Error("brand.json not found; run init-project.mjs first");
  const style = resolveStyle(project, slug, { variant });
  const sd = styleDir(project, slug);
  const aspect = pickRatio(project, sd, ratio);
  const { width, height } = ASPECTS[aspect];
  const brand = { ...mergeBrandPatch(project.brand, style.brand), name: `${project.brand.name} · ${slug}` };
  const lang = project.studio.meta.language;
  const root = join(project.root, ".one-studio", "styles", slug);
  try {
    const scenes = SAMPLES.map((s) => ({ id: s.id, html: sampleHtml(s.id, { id: s.id, width, height, lang, brand }) }));
    const { warning } = stageBrand(project, { root, brand, scenes, offline, label: slug });
    // The staged folder is its own tiny project: only its format, language and scene list matter to the index.
    const mini = { root, studio: { format: { width, height, fps: 30 }, meta: { language: lang } }, storyboard: { scenes: SAMPLES.map((s) => ({ id: s.id, type: "text", duration: SAMPLE_SECONDS })) } };
    const index = buildIndex(mini, { outDir: root });
    const times = SAMPLES.map((s) => Math.round((index.starts[s.id].start + SAMPLE_SECONDS * 0.75) * 100) / 100);
    const stills = snapshotStills(project, root, times);
    if (stills.length !== SAMPLES.length) throw new Error(`expected ${SAMPLES.length} stills, got ${stills.length}`);
    const refs = referenceFrames(sd);
    const strips = tokenStrips(brand.colors, aspect, root);
    const rows = [];
    if (refs.length) rows.push({ id: "reference", times: refs.map(() => ""), stills: refs, labels: refs.map((_, i) => `reference ${i + 1}`) });
    rows.push({ id: "samples", times: times, stills, labels: SAMPLES.map((s) => s.label) });
    rows.push({ id: "tokens", times: strips.map(() => ""), stills: strips.map((s) => s.file), labels: strips.map((s) => s.label) });
    mkdirSync(join(project.root, "review"), { recursive: true });
    const sheet = contactSheet(rows, join(project.root, "review", `style-${slug}-compare.jpg`), { tileWidth: width >= height ? 400 : 240 });
    const fonts = Object.fromEntries(["heading", "body", "mono"].filter((k) => brand.typography[k]).map((k) => [k, brand.typography[k].family]));
    return { sheet, ratio: aspect, rows: rows.map((r) => ({ id: r.id, tiles: r.labels })), fonts, hasReference: refs.length > 0, warning };
  } finally {
    rmSync(join(project.root, ".one-studio", "styles"), { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["offline", "help"], options: ["variant", "ratio"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-compare.mjs <project-dir> <slug> [--variant v] [--ratio 16:9|9:16|1:1|4:5] [--offline]");
      process.exit(dir && slug ? 0 : 1);
    }
    const r = compareStyle(dir, slug, { variant: args.variant, ratio: args.ratio, offline: args.offline });
    if (r.warning) console.log(`⚠ ${r.warning}`);
    console.log(`Sheet: ${relative(process.cwd(), r.sheet) || r.sheet}  (${r.ratio})`);
    r.rows.forEach((row, i) => console.log(`  row ${i + 1} ${row.id.padEnd(9)} left to right: ${row.tiles.join(" | ")}`));
    if (!r.hasReference) console.log("  (no reference frames on disk: they were removed after apply; run style-analyze again to get them)");
    console.log(`Fonts: ${Object.entries(r.fonts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    console.log("Show the sheet to the user and wait for an explicit OK before style-apply.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
