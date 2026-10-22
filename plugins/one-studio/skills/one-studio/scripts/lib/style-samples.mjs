// Sample scenes rendered under a brand that is not the project's own: shared by style-compare (the look of a
// style), style-enhance (before/after of a proposal) and style-editor (the preview scenes).
// A scene is a template fragment (style-extract/templates/samples/<name>.html or a scene template) placed after
// templates/scenes/_head.html. Nothing in the project is touched: stageBrand builds a staging copy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASPECTS, TEMPLATE_DIR } from "./project.mjs";
import { buildIndex } from "./scenes.mjs";
import { snapshotStills, stageBrand } from "./stage-brand.mjs";

export const SAMPLES = [{ id: "title", label: "title" }, { id: "data", label: "chart" }, { id: "caption", label: "caption" }];
export const SAMPLE_SECONDS = 3.5;
export const SAMPLE_DIR = join(TEMPLATE_DIR, "..", "..", "style-extract", "templates", "samples");

// _head.html opens the scene root; the fragment is the rest of the document. {{name}} placeholders not in
// `vars` stay as they are (the caller's fragment may fill its own).
export function fillScene(fragment, { id, width, height, lang, brand, duration = SAMPLE_SECONDS, vars = {} }) {
  const tr = brand.transitions ?? {};
  const all = { id, type: "text", lang, width, height, duration, extra_head: "", transition_in: tr.default ?? "fade", transition_out: tr.default ?? "fade", transition_duration: tr.duration ?? 0.4, ...vars };
  const html = readFileSync(join(TEMPLATE_DIR, "scenes", "_head.html"), "utf8") + fragment;
  return html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in all ? String(all[k]) : m));
}
export const sampleHtml = (name, opts) => fillScene(readFileSync(join(SAMPLE_DIR, `${name}.html`), "utf8"), { ...opts, id: opts.id ?? name });

// Renders stills of `scenes` ([{ id, html }]) under `brand`; returns { stills: {id: png}, times, warning }.
// The staging folder is its own tiny project: only its format, language and scene list matter to the index.
export function renderScenes(project, brand, scenes, { root, ratio, offline = false, label }) {
  const { width, height } = ASPECTS[ratio];
  const lang = project.studio.meta.language;
  const { warning } = stageBrand(project, { root, brand, scenes, offline, label });
  const mini = { root, studio: { format: { width, height, fps: 30 }, meta: { language: lang } }, storyboard: { scenes: scenes.map((s) => ({ id: s.id, type: "text", duration: SAMPLE_SECONDS })) } };
  const index = buildIndex(mini, { outDir: root });
  const times = scenes.map((s) => Math.round((index.starts[s.id].start + SAMPLE_SECONDS * 0.75) * 100) / 100);
  const files = snapshotStills(project, root, times);
  if (files.length !== scenes.length) throw new Error(`expected ${scenes.length} stills, got ${files.length}`);
  return { stills: Object.fromEntries(scenes.map((s, i) => [s.id, files[i]])), times, warning };
}

// The named sample scenes (all three by default) at a ratio.
export function renderSamples(project, brand, { root, ratio, offline = false, only, label }) {
  const { width, height } = ASPECTS[ratio];
  const lang = project.studio.meta.language;
  const picked = SAMPLES.filter((s) => !only || only.includes(s.id));
  const scenes = picked.map((s) => ({ id: s.id, html: sampleHtml(s.id, { width, height, lang, brand }) }));
  return renderScenes(project, brand, scenes, { root, ratio, offline, label });
}
