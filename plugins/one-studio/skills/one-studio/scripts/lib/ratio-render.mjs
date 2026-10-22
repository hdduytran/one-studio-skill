// Clips of every scene at another aspect ratio, rendered from the same sources (HyperFrames, lemo re-layout;
// Remotion is fitted from its main clip). Cached per scene and ratio by variantHash:
//   final   → out/<ratio>/scenes/<id>-<hash>.mp4 (publish)
//   preview → out/<ratio>/preview/<id>-<hash>.mp4 (concat-and-mix --preview --ratio, low resolution)
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ASPECTS, sceneEngine } from "./project.mjs";
import { encodeSettings, normalize } from "./ffmpeg.mjs";
import { ENGINES } from "./engines.mjs";
import { fitClip, ratioTag, variantHash, variantRoot } from "./variants.mjs";
import { planRender } from "../render-changed-scenes.mjs";

// Encode settings at that ratio; preview keeps the short side at render.preview_height (540 by default).
export function ratioSettings(studio, aspect, mode) {
  const size = ASPECTS[aspect];
  const base = encodeSettings(studio, mode);
  if (mode !== "preview") return { ...base, ...size };
  const k = (studio.render?.preview_height ?? 540) / Math.min(size.width, size.height);
  const even = (n) => Math.round((n * k) / 2) * 2;
  return { ...base, width: even(size.width), height: even(size.height) };
}

// -> { clips, settings, dir }. Needs every scene's main clip of that mode (Remotion scenes are fitted from it).
export function renderRatioClips(project, aspect, { mode = "final", log = () => {} } = {}) {
  const tag = ratioTag(aspect);
  const settings = ratioSettings(project.studio, aspect, mode);
  const plan = planRender(project, { mode });
  const missing = plan.filter((p) => p.action !== "cached");
  if (missing.length) throw new Error(`Scenes without a ${mode} clip for their current version: ${missing.map((p) => p.scene.id).join(", ")}.\nRun render-changed-scenes.mjs${mode === "preview" ? " --preview" : ""} first.`);
  const dir = join(project.root, project.studio.render?.out_dir ?? "out", tag, mode === "preview" ? "preview" : "scenes");
  mkdirSync(dir, { recursive: true });
  let root = null;
  const clips = [];
  try {
    for (const item of plan) {
      const scene = item.scene;
      const clip = join(dir, `${scene.id}-${variantHash(project, scene, aspect)}.mp4`);
      if (!existsSync(clip)) {
        const raw = clip.replace(/\.mp4$/, ".raw.mp4");
        const engine = sceneEngine(scene, project.studio);
        if (engine === "hyperframes") ENGINES.hyperframes.render(project, scene, raw, { mode, root: (root ??= variantRoot(project, aspect)) });
        else if (engine === "lemo") ENGINES.lemo.render(project, scene, raw, { size: ASPECTS[aspect] });
        else fitClip(join(project.root, item.clip), raw, { ...ASPECTS[aspect], fps: settings.fps });
        normalize(raw, clip, settings);
        rmSync(raw, { force: true });
        log(`✓ ${tag} ${scene.id} rendered`);
      } else log(`· ${tag} ${scene.id} cached`);
      clips.push(clip);
    }
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
  return { clips, settings, dir };
}
