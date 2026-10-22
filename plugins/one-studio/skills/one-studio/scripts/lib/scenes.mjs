// Scene files: paths, effective durations, template filling, preview index.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR, sceneEngine } from "./project.mjs";
import { worldNeighbours } from "./visual-refs.mjs";
import { markSpan, readEvents } from "./flow.mjs";
import { loadResearch, sourceIds } from "./research.mjs";

export const sceneFile = (project, id) => join(project.root, "scenes", `${id}.html`);

// Storyboard duration, extended by the audio step (studio.scenes[].fit_duration) when the VO is longer.
export function effectiveDuration(project, scene) {
  const state = project.studio.scenes?.find((s) => s.id === scene.id);
  return Math.max(scene.duration, state?.fit_duration ?? 0);
}

const TEMPLATE_BY_TYPE = { text: "text", diagram: "diagram", explainer: "explainer", data: "data", lottie: "lottie", rive: "canvas", "3d": "three", screen: "screen" };

export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderSceneTemplate(project, scene) {
  if (sceneEngine(scene, project.studio) !== "hyperframes") {
    throw new Error(`scene ${scene.id} uses engine ${sceneEngine(scene, project.studio)}; scaffold it with that engine's template`);
  }
  const kind = TEMPLATE_BY_TYPE[scene.type];
  const head = readFileSync(join(TEMPLATE_DIR, "scenes", "_head.html"), "utf8");
  const body = readFileSync(join(TEMPLATE_DIR, "scenes", `${kind}.html`), "utf8");
  const brand = project.brand ?? {};
  const tr = scene.transition ?? {};
  const { width, height } = project.studio.format;
  const duration = effectiveDuration(project, scene);
  const screen = scene.type === "screen" ? screenVars(project, scene, duration) : {};
  const lottieName = (scene.assets ?? []).map((a) => /([^/]+)\.(json|lottie)$/.exec(a)?.[1]).find(Boolean) ?? "animation";
  const data = Array.isArray(scene.data) ? scene.data : [];
  const nums = data.flatMap((r) => Object.values(r).filter((v) => typeof v === "number"));
  const wide = nums.length && Math.max(...nums) / Math.max(1, Math.min(...nums.filter((n) => n > 0))) > 50;
  const extraHead = [
    scene.world ? '<script src="../assets/camera.js"></script>\n' : "",
    scene.type === "screen" ? '<script src="../assets/camera.js"></script>\n<script src="../assets/screen.js"></script>\n' : "",
    scene.type === "lottie" ?'<script src="../assets/vendor/lottie.min.js"></script>\n' : "",
  ].join("");
  // Scenes that continue in the same world cut into and out of each other; fades would hide the continuity.
  const near = worldNeighbours(project.storyboard, scene.id);
  const vars = {
    id: scene.id,
    type: scene.type,
    lang: project.studio.meta.language,
    width,
    height,
    duration,
    ...screen,
    transition_in: near.prev ? "cut" : tr.kind ?? brand.transitions?.default ?? "fade",
    transition_out: near.next ? "cut" : tr.kind ?? brand.transitions?.default ?? "fade",
    transition_duration: tr.duration ?? brand.transitions?.duration ?? 0.4,
    headline: escapeHtml(scene.title ?? scene.id),
    subline: escapeHtml(scene.lines?.[0]?.text ?? ""),
    data_json: JSON.stringify(data),
    data_scale: wide ? "log" : "linear",
    lottie_name: lottieName,
    extra_head: extraHead,
  };
  const html = (head + body).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return scene.world ? withWorld(html, project, scene, near) : html;
}

// Screen scene: the recording's span between the two marks. The video plays from `media_start` for `video_duration`.
function screenVars(project, scene, duration) {
  const cfg = scene.screen;
  const span = markSpan(readEvents(project, cfg.flow), cfg.from_mark, cfg.to_mark);
  const options = { frame: cfg.frame ?? "window", zoom: cfg.zoom ?? "auto", cursor: { size: cfg.cursor?.size ?? 30, smooth: cfg.cursor?.smooth ?? 0.5 }, from: span.from, to: span.to };
  return {
    flow_id: cfg.flow,
    media_start: span.from,
    video_duration: Math.round(Math.min(duration, span.to - span.from) * 1000) / 1000,
    screen_options: escapeHtml(JSON.stringify(options)),
  };
}

// World layer as the first child of the scene root. The <link> makes the scene hash cover the world file;
// os.js reads it and fills the layer. Start state follows the previous scene's exit_state.
function withWorld(html, project, scene, near) {
  const world = project.storyboard.worlds[scene.world];
  const attr = (v) => escapeHtml(JSON.stringify(v));
  const enter = scene.enter_state ?? near.prevExit;
  const data = [
    `data-world="${escapeHtml(scene.world)}"`,
    `data-world-w="${world.size.w}"`,
    `data-world-h="${world.size.h}"`,
    scene.camera ? `data-camera="${attr(scene.camera)}"` : "",
    enter ? `data-enter-state="${attr(enter)}"` : "",
    scene.exit_state ? `data-exit-state="${attr(scene.exit_state)}"` : "",
  ].filter(Boolean).join(" ");
  const block = `  <link rel="x-world" href="../${world.file.replace(/^\.?\//, "")}" />\n  <div class="os-world" ${data}></div>\n`;
  return html.replace(/(<div id="root"[^>]*>\n)/, `$1${block}`);
}

// index.html mounts every HyperFrames scene in order, for Studio preview and full-cut snapshots.
// opts.outDir: write the index elsewhere (a staging copy with its own scenes/ and assets/); opts.ids: subset.
export function buildIndex(project, { outDir = project.root, ids = null } = {}) {
  const { width, height, fps } = project.studio.format;
  let t = 0;
  const mounts = [];
  const starts = {};
  for (const scene of project.storyboard?.scenes ?? []) {
    if (ids && !ids.includes(scene.id)) continue;
    if (sceneEngine(scene, project.studio) !== "hyperframes" || !existsSync(sceneFile(project, scene.id))) continue;
    const d = effectiveDuration(project, scene);
    starts[scene.id] = { start: t, duration: d };
    mounts.push(`    <div id="mount-${scene.id}" data-composition-id="${scene.id}" data-composition-src="scenes/${scene.id}.html" data-start="${+t.toFixed(3)}" data-duration="${d}" data-track-index="0"></div>`);
    t += d;
  }
  const html = `<!doctype html>
<html lang="${project.studio.meta.language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<!-- Generated by one-studio prepare-project: preview of all HyperFrames scenes in order. Do not edit. -->
<link rel="stylesheet" href="assets/brand.css" />
<script src="assets/vendor/gsap.min.js"></script>
<style>html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: var(--c-bg); }</style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${+t.toFixed(3) || 1}" data-width="${width}" data-height="${height}" data-fps="${fps}">
${mounts.join("\n")}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = gsap.timeline({ paused: true });
  </script>
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), html);
  return { scenes: mounts.length, duration: t, starts };
}

export const listSceneFiles = (project) =>
  existsSync(join(project.root, "scenes")) ? readdirSync(join(project.root, "scenes")).filter((f) => f.endsWith(".html")) : [];

// ---------- VO sync: <script type="application/json" id="os-lines"> ----------
// Scenes tag elements with data-line="s02-2"; S.lines() in os.js reveals each one when its sentence starts.
// The timings (scene-relative, from build-audio) live in a JSON block inside the scene, so only the scenes
// whose timings changed re-render. The keyframe gate ignores this block (see sceneText in hash.mjs).
const LINES_RE = /<script\b[^>]*\bid\s*=\s*["']os-lines["'][^>]*>[\s\S]*?<\/script>\n?/i;
// Opinion and quote lines carry an on-screen label while they are spoken (see S.done in os.js).
const labelled = (scene) => (scene.lines ?? []).some((l) => l.kind === "opinion" || l.kind === "quote");
export const usesLineSync = (html) => /\bdata-line\s*=/.test(html) || LINES_RE.test(html);

// Text of the chip shown while a line is spoken: "Ý KIẾN" / "OPINION", or "speaker · source name" for quotes.
export function lineLabel(line, language, research = []) {
  if (line?.kind === "opinion") return language === "vi" ? "Ý KIẾN" : "OPINION";
  if (line?.kind !== "quote") return null;
  const names = sourceIds(line.source).map((id) => research.find((r) => r.id === id)?.source).filter(Boolean);
  return [line.speaker, names[0]].filter(Boolean).join(" · ") || null;
}

// lines: [{ id, start, duration }] → true when the file changed.
export function writeLineTimes(project, scene, lines) {
  if (sceneEngine(scene, project.studio) !== "hyperframes") return false;
  const file = sceneFile(project, scene.id);
  if (!existsSync(file)) return false;
  const html = readFileSync(file, "utf8");
  if (!usesLineSync(html) && !labelled(scene)) return false;
  const byId = new Map((scene.lines ?? []).map((l) => [l.id, l]));
  const research = labelled(scene) ? loadResearch(project) : [];
  const times = Object.fromEntries(
    lines.map((l) => {
      const label = lineLabel(byId.get(l.id), project.studio.meta?.language, research);
      return [l.id, { start: l.start, end: Math.round((l.start + l.duration) * 1000) / 1000, ...(label && { kind: byId.get(l.id).kind, label }) }];
    }),
  );
  const block = `<script type="application/json" id="os-lines">${JSON.stringify(times)}</script>\n`;
  let next;
  if (LINES_RE.test(html)) next = html.replace(LINES_RE, block);
  else {
    // Before the scene's own script, so it is parsed when S.lines() runs.
    const at = html.search(/<script>(?=[\s\S]*?OS\.scene\()/);
    next = at >= 0 ? html.slice(0, at) + block + html.slice(at) : /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${block}</body>`) : html + (html.endsWith("\n") ? "" : "\n") + block;
  }
  if (next === html) return false;
  writeFileSync(file, next);
  return true;
}
