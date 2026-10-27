// Draft preview: every scene in draft quality, outside the gates. Nothing is approved or recorded in studio.json;
// clips are cached in out/draft/<id>-<hash>.mp4 (labelled: <id>-<hash>-l<label>.mp4) so a second draft only renders
// what changed. --labels renders from a staged copy of each HyperFrames scene with a review label injected before
// S.done(): "scene · title │ VO line │ +seconds in scene │ ▶ time in the video", above the transition veil and
// driven by the scene timeline (deterministic). Scene source files are never touched.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sceneEngine, sha256 } from "./project.mjs";
import { sceneHash, sceneSourceExists } from "./hash.mjs";
import { engineFor } from "./engines.mjs";
import { encodeSettings, normalize } from "./ffmpeg.mjs";
import { readAudioManifest } from "./gates.mjs";
import { effectiveDuration, sceneFile } from "./scenes.mjs";
import { variantRoot } from "./variants.mjs";

const r3 = (n) => Math.round(n * 1000) / 1000;

export const draftDir = (project) => join(project.studio.render?.out_dir ?? "out", "draft");

// Where each scene sits in the whole video and when its VO lines run: audio manifest first, storyboard lengths before it.
export function sceneTimeline(project, manifest = readAudioManifest(project)) {
  const fromManifest = new Map((manifest?.scenes ?? []).map((s) => [s.id, s]));
  let t = 0;
  return (project.storyboard?.scenes ?? []).map((scene) => {
    const m = fromManifest.get(scene.id);
    const start = m?.start ?? t;
    const duration = m?.duration ?? effectiveDuration(project, scene);
    t = start + duration;
    const lines = (m?.lines ?? []).map((l) => ({ id: l.id, start: l.start, end: r3(l.start + l.duration) }));
    return { id: scene.id, title: scene.title ?? "", start: r3(start), duration: r3(duration), lines };
  });
}

// Review label code for one scene (runs inside the scene's script, `handle` = its OS.scene(...) variable).
// info: { id, title, start, duration, lines: [{ id, start, end }] }.
export function reviewLabelCode(info, { height = 1080, handle = "S" } = {}) {
  const size = Math.max(12, Math.round(height * 0.02));
  const data = JSON.stringify({ id: info.id, title: info.title, start: info.start, lines: info.lines });
  return `;/* one-studio draft review label (staged copy only) */
(function (S) {
  var D = ${data.replace(/</g, "\\u003c")};
  var el = document.createElement("div");
  el.className = "os-review-label";
  el.style.cssText = "position:absolute;left:${Math.round(size * 0.8)}px;top:${Math.round(size * 0.8)}px;z-index:2147483000;padding:${Math.round(size * 0.3)}px ${Math.round(size * 0.6)}px;border-radius:${Math.round(size * 0.3)}px;background:rgba(0,0,0,.72);color:#fff;font:600 ${size}px/1.25 var(--font-body, system-ui, sans-serif);font-variant-numeric:tabular-nums;white-space:pre;pointer-events:none;";
  S.root.appendChild(el);
  function clock(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  function show(t) {
    var line = "—";
    for (var i = 0; i < D.lines.length; i++) if (t >= D.lines[i].start && t < D.lines[i].end) line = D.lines[i].id;
    el.textContent = D.id + (D.title ? " · " + D.title : "") + "  │  " + line + "  │  +" + t.toFixed(1) + "s  │  ▶ " + clock(D.start + t);
  }
  var p = { t: 0 };
  show(0);
  S.tl.to(p, { t: S.dur, duration: S.dur, ease: "none", onUpdate: function () { show(p.t); } }, 0);
})(${handle});
`;
}

// The scene html with the label inserted just before its last `<var>.done()` (var = the OS.scene(...) handle).
// Returns null when the scene has no OS.scene(...) / done() pair to hook into.
export function injectReviewLabel(html, info, opts = {}) {
  const handle = /\b([A-Za-z_$][\w$]*)\s*=\s*OS\.scene\(/.exec(html)?.[1];
  if (!handle) return null;
  const done = [...html.matchAll(new RegExp(`(?<![\\w$.])${handle.replace(/\$/g, "\\$")}\\s*\\.\\s*done\\s*\\(`, "g"))].pop();
  if (!done) return null;
  // Leading ";" so a previous statement without a semicolon is not called with the IIFE.
  return html.slice(0, done.index) + reviewLabelCode(info, { ...opts, handle }) + html.slice(done.index);
}

const labelKey = (info, height) => sha256(reviewLabelCode(info, { height })).slice(0, 8);

// -> [{ scene, action: render | cached | missing, hash, clip, labelled }]
export function planDraft(project, { ids = [], labels = false } = {}) {
  const times = new Map(sceneTimeline(project).map((t) => [t.id, t]));
  return (project.storyboard?.scenes ?? [])
    .filter((s) => !ids.length || ids.includes(s.id))
    .map((scene) => {
      if (!sceneSourceExists(project, scene)) return { scene, action: "missing", reason: "no source file" };
      const hash = sceneHash(project, scene);
      const labelled = labels && sceneEngine(scene, project.studio) === "hyperframes";
      const info = times.get(scene.id);
      const suffix = labelled ? `-l${labelKey(info, project.studio.format.height)}` : "";
      const clip = join(draftDir(project), `${scene.id}-${hash}${suffix}.mp4`);
      return { scene, hash, clip, labelled, info, action: existsSync(join(project.root, clip)) ? "cached" : "render" };
    });
}

// Stage one HyperFrames scene for a draft render (a folder of its own, ratio blocks stripped), with the label
// when asked. Returns the staged root; the caller removes it.
export function stageDraftScene(project, scene, { info = null } = {}) {
  const root = variantRoot(project, project.studio.format.aspect, { ids: [scene.id], name: `draft-${scene.id}` });
  if (info) {
    const file = join(root, "scenes", `${scene.id}.html`);
    const html = injectReviewLabel(readFileSync(file, "utf8"), info, { height: project.studio.format.height });
    if (html) writeFileSync(file, html);
    else return { root, labelled: false };
  }
  return { root, labelled: Boolean(info) };
}

// Render every draft clip that is missing. renderer(project, scene, rawOut, { mode, root }) defaults to the engine's.
// Never writes studio.json.
export function renderDraft(project, { ids = [], labels = false, log = () => {}, renderer = null } = {}) {
  const plan = planDraft(project, { ids, labels });
  const missing = plan.filter((p) => p.action === "missing");
  if (missing.length) throw new Error(`Scenes without a source file: ${missing.map((p) => p.scene.id).join(", ")} (write them first; render-changed-scenes.mjs <dir> <ids> --draft renders only some scenes)`);
  const settings = encodeSettings(project.studio, "preview");
  const tmpDir = join(project.root, ".one-studio", "tmp-draft");
  mkdirSync(tmpDir, { recursive: true });
  try {
    for (const item of plan) {
      if (item.action === "cached") {
        log(`· cached   ${item.scene.id}`);
        continue;
      }
      const raw = join(tmpDir, `${item.scene.id}.raw.mp4`);
      const render = renderer ?? ((p, s, out, o) => engineFor(p, s).render(p, s, out, o));
      const t0 = Date.now();
      if (sceneEngine(item.scene, project.studio) === "hyperframes") {
        const staged = stageDraftScene(project, item.scene, { info: item.labelled ? item.info : null });
        try {
          if (item.labelled && !staged.labelled) log(`⚠ ${item.scene.id}: no OS.scene(…)…done() in the scene, rendered without a label`);
          render(project, item.scene, raw, { mode: "preview", root: staged.root });
        } finally {
          rmSync(staged.root, { recursive: true, force: true });
        }
      } else {
        if (labels) log(`· ${item.scene.id}: ${sceneEngine(item.scene, project.studio)} scene, no review label`);
        render(project, item.scene, raw, { mode: "preview" });
      }
      normalize(raw, join(project.root, item.clip), settings);
      rmSync(raw, { force: true });
      log(`✓ draft    ${item.scene.id} in ${Math.round((Date.now() - t0) / 100) / 10}s`);
      // Older draft clips of this scene of the same kind (labelled or not) can never be used again.
      const folder = join(project.root, draftDir(project));
      const kind = new RegExp(`^${item.scene.id}-[0-9a-f]{12}${item.labelled ? "-l[0-9a-f]{8}" : ""}\\.mp4$`);
      const mine = item.clip.split(/[\\/]/).pop();
      for (const f of readdirSync(folder)) if (kind.test(f) && f !== mine) rmSync(join(folder, f));
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  return plan;
}

// One chapter per scene (ffmetadata), clamped to the video length.
export function chapterMetadata(chapters, duration) {
  const esc = (s) => String(s).replace(/[=;#\\\n]/g, (c) => `\\${c}`);
  const body = chapters
    .filter((c) => c.start < duration)
    .map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(Math.min(duration, c.start + c.duration) * 1000)}\ntitle=${esc(c.title)}\n`);
  return `;FFMETADATA1\n${body.join("")}`;
}

export const sceneChapters = (project, manifest) =>
  sceneTimeline(project, manifest).map((t) => ({ start: t.start, duration: t.duration, title: t.title ? `${t.id} · ${t.title}` : t.id }));
