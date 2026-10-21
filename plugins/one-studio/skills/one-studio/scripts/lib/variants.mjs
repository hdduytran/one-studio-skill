// Other aspect ratios of a finished video: per-scene variant clips rendered from the same sources.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASPECTS, sha256 } from "./project.mjs";
import { sceneHash } from "./hash.mjs";
import { run } from "./ffmpeg.mjs";

export const ratioTag = (aspect) => aspect.replace(":", "x");

// Rewrite the composition size inside a HyperFrames scene file.
export function resizeHtml(html, from, to) {
  return html
    .replace(new RegExp(`data-width="${from.width}"`, "g"), `data-width="${to.width}"`)
    .replace(new RegExp(`data-height="${from.height}"`, "g"), `data-height="${to.height}"`)
    .replace(new RegExp(`width=${from.width}, height=${from.height}`, "g"), `width=${to.width}, height=${to.height}`)
    .replace(new RegExp(`--w:\\s*${from.width}px`, "g"), `--w: ${to.width}px`)
    .replace(new RegExp(`--h:\\s*${from.height}px`, "g"), `--h: ${to.height}px`)
    .replace(new RegExp(`(<canvas[^>]*?)width="${from.width}"([^>]*?)height="${from.height}"`, "g"), `$1width="${to.width}"$2height="${to.height}"`);
}

// Folder that mirrors the project for one aspect ratio: scenes/ rewritten, assets/ linked.
export function variantRoot(project, aspect) {
  const root = join(project.root, ".one-studio", "variants", ratioTag(aspect));
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "scenes"), { recursive: true });
  symlinkSync(join(project.root, "assets"), join(root, "assets"), "dir");
  const hfJson = join(project.root, "hyperframes.json");
  if (existsSync(hfJson)) writeFileSync(join(root, "hyperframes.json"), readFileSync(hfJson));
  const from = { width: project.studio.format.width, height: project.studio.format.height };
  const to = ASPECTS[aspect];
  for (const s of project.storyboard?.scenes ?? []) {
    const file = join(project.root, "scenes", `${s.id}.html`);
    if (existsSync(file)) writeFileSync(join(root, "scenes", `${s.id}.html`), resizeHtml(readFileSync(file, "utf8"), from, to));
  }
  writeFileSync(join(root, "index.html"), `<!doctype html><html><body><div data-composition-id="main" data-start="0" data-duration="1" data-width="${to.width}" data-height="${to.height}"></div></body></html>`);
  return root;
}

export const variantHash = (project, scene, aspect) => sha256(`${sceneHash(project, scene)}|${aspect}`).slice(0, 12);

// Fallback for engines that cannot re-layout (Remotion): fit the main clip into the new frame
// over a blurred, darkened copy of itself.
export function fitClip(src, dest, { width, height, fps }) {
  run("ffmpeg", ["-y", "-v", "error", "-i", src, "-an", "-filter_complex",
    `[0:v]split=2[a][b];[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:2,eq=brightness=-0.15[bg];[b]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p[v]`,
    "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "fast", dest]);
  return dest;
}
