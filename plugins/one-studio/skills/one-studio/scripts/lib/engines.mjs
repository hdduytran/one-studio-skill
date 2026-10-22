// Engine adapters: render one scene to a raw clip, and capture review stills.
// Raw clips are normalised afterwards (lib/ffmpeg.mjs), so adapters only care about pixels and timing.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_VERSIONS, linkSharedDirs, sceneEngine } from "./project.mjs";
import { run } from "./ffmpeg.mjs";
import { effectiveDuration } from "./scenes.mjs";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function runIn(cwd, bin, args) {
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    return run(bin, args);
  } finally {
    process.chdir(prev);
  }
}

// ---------- HyperFrames ----------
const hfVersion = (project) => project.studio.engine.versions?.hyperframes ?? ENGINE_VERSIONS.hyperframes;
const hf = (project, args) => run(npx, ["--yes", `hyperframes@${hfVersion(project)}`, ...args]);

// snapshot only accepts a project folder, so each scene is staged as its own index.html
// with assets/ linked back to the project.
// `root` may be an aspect-ratio variant folder (lib/variants.mjs) with resized scenes.
function stageScene(project, id, { root = project.root, tag = id } = {}) {
  const stage = join(project.root, ".one-studio", "stage", tag);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  symlinkSync(join(root, "assets"), join(stage, "assets"), "dir");
  linkSharedDirs(root, stage);
  const html = readFileSync(join(root, "scenes", `${id}.html`), "utf8").replace(/(["'(])\.\.\/(assets|worlds|capture|flows)\//g, "$1./$2/");
  writeFileSync(join(stage, "index.html"), html);
  return stage;
}

const hyperframes = {
  render(project, scene, rawOut, { mode, root = project.root }) {
    hf(project, ["render", root, "-c", `scenes/${scene.id}.html`, "-o", rawOut, "--quality", mode === "preview" ? "draft" : "delivery", "--fps", String(project.studio.format.fps), "--quiet"]);
  },
  stills(project, scene, times, outDir, { root, tag } = {}) {
    const stage = stageScene(project, scene.id, { root, tag });
    rmSync(outDir, { recursive: true, force: true });
    hf(project, ["snapshot", stage, "--at", times.join(","), "--no-end", "-o", outDir, "--describe", "false"]);
    return readdirSync(outDir).filter((f) => f.endsWith(".png")).sort().map((f) => join(outDir, f));
  },
};

// ---------- lemo-opuscar (character scenes) ----------
export const lemoLib = () => process.env.ONE_STUDIO_LEMO_LIB ?? process.env.LEMO_LIB ?? join(homedir(), "lemo-opuscar");

function requireLemo() {
  const lib = lemoLib();
  if (!existsSync(join(lib, "core", "render", "video.mjs"))) {
    throw new Error(`lemo-opuscar library not found at ${lib}. Install it (check-external.mjs lemo) or set ONE_STUDIO_LEMO_LIB.`);
  }
  return lib;
}

const lemo = {
  render(project, scene, rawOut, { size } = {}) {
    const lib = requireLemo();
    const { fps } = project.studio.format;
    const { width, height } = size ?? project.studio.format;
    runIn(lib, "node", ["core/render/video.mjs", join(project.root, "scenes", scene.id), "--fps", String(fps), "--size", `${width}x${height}`, "--out", rawOut]);
  },
  stills(project, scene, times, outDir, { size } = {}) {
    const lib = requireLemo();
    const { width, height } = size ?? project.studio.format;
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    runIn(lib, "node", ["core/render/still.mjs", join(project.root, "scenes", scene.id), ...times.map(String), "--size", `${width}x${height}`, "--out", outDir]);
    return readdirSync(outDir).filter((f) => /\.(jpe?g|png)$/.test(f)).sort().map((f) => join(outDir, f));
  },
};

// ---------- Remotion (3D scenes) ----------
function remotionDir(project) {
  const dir = join(project.root, "remotion");
  if (!existsSync(join(dir, "package.json"))) throw new Error(`No Remotion project at ${dir}. Create it with new-remotion.mjs.`);
  if (!existsSync(join(dir, "node_modules"))) throw new Error(`Remotion dependencies missing: run npm install in ${dir} (ask the user first).`);
  return dir;
}

// WebGL backend for headless 3D: GPU-backed ANGLE on macOS, software ANGLE elsewhere (override with env).
const remotionFlags = () => {
  const gl = process.env.ONE_STUDIO_REMOTION_GL ?? (process.platform === "darwin" ? "angle" : "swangle");
  const chrome = process.env.ONE_STUDIO_CHROME ?? process.env.REMOTION_BROWSER_EXECUTABLE;
  return [`--gl=${gl}`, ...(chrome ? [`--browser-executable=${chrome}`] : []), "--log=error"];
};

const remotion = {
  render(project, scene, rawOut, { mode }) {
    const dir = remotionDir(project);
    const frames = Math.round(effectiveDuration(project, scene) * project.studio.format.fps);
    const props = JSON.stringify({ durationInFrames: frames });
    runIn(dir, npx, ["remotion", "render", "src/index.ts", scene.id, rawOut, "--codec=h264", `--props=${props}`, mode === "preview" ? "--crf=28" : "--crf=16", ...remotionFlags()]);
  },
  stills(project, scene, times, outDir) {
    const dir = remotionDir(project);
    const fps = project.studio.format.fps;
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const frames = Math.round(effectiveDuration(project, scene) * fps);
    const props = JSON.stringify({ durationInFrames: frames });
    return times.map((t, i) => {
      const out = join(outDir, `frame-${String(i).padStart(2, "0")}-at-${t}s.png`);
      runIn(dir, npx, ["remotion", "still", "src/index.ts", scene.id, out, `--frame=${Math.min(frames - 1, Math.round(t * fps))}`, `--props=${props}`, ...remotionFlags()]);
      return out;
    });
  },
};

export const ENGINES = { hyperframes, lemo, remotion };
export const engineFor = (project, scene) => ENGINES[sceneEngine(scene, project.studio)];

// Review times: start, middle and end of the scene, clear of the transition veils.
export function reviewTimes(project, scene, count = 3) {
  const d = effectiveDuration(project, scene);
  const fr = count === 1 ? [0.5] : count === 2 ? [0.3, 0.75] : [0.15, 0.5, 0.85];
  return fr.map((f) => Math.round(d * f * 10) / 10);
}

