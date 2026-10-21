// Shared helpers for one-studio scripts: paths, JSON IO, hashing, gates, scene routing.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate } from "./schema.mjs";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SCHEMA_DIR = join(SKILL_DIR, "schemas");
export const TEMPLATE_DIR = join(SKILL_DIR, "templates");

export const ENGINE_VERSIONS = { hyperframes: "0.8.181" };

export const ASPECTS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

// Gate order. `input` = file whose sha256 is stored on approval; editing it re-opens the gate.
export const GATES = [
  { id: "setup", n: 0, input: null, title: "Setup (brand, 2D/3D, language, services)" },
  { id: "brief", n: 1, input: "brief.md", title: "Brief" },
  { id: "script", n: 2, input: "script.md", title: "Script — user approval" },
  { id: "storyboard", n: 3, input: "storyboard.json", title: "Storyboard — user approval" },
  { id: "estimate", n: 4, input: "storyboard.json", title: "Credit estimate — user acknowledges" },
  { id: "keyframes", n: 5, input: null, title: "Keyframe review — user approval" },
  { id: "build", n: 6, input: null, title: "Build scenes" },
  { id: "audio", n: 7, input: null, title: "Audio (TTS, music, SFX)" },
  { id: "preview", n: 8, input: null, title: "Low-res preview — user approval" },
  { id: "render", n: 9, input: null, title: "Final render" },
  { id: "publish", n: 10, input: null, title: "Publish (ratios, thumbnail)" },
];

// scene.type → default engine, token cost level, reference files to lazy-load, external deps.
export const SCENE_TYPES = {
  text: { engine: "hyperframes", level: "low", refs: ["references/scene-types/_common.md", "references/scene-types/text.md"], deps: [] },
  diagram: { engine: "hyperframes", level: "medium", refs: ["references/scene-types/_common.md", "references/scene-types/diagram.md"], deps: ["archify or ak:diagram skill (optional)"] },
  data: { engine: "hyperframes", level: "medium", refs: ["references/scene-types/_common.md", "references/scene-types/data.md"], deps: [] },
  lottie: { engine: "hyperframes", level: "medium", refs: ["references/scene-types/_common.md", "references/scene-types/lottie-rive.md"], deps: [] },
  rive: { engine: "hyperframes", level: "medium", refs: ["references/scene-types/_common.md", "references/scene-types/lottie-rive.md"], deps: ["@rive-app/canvas"] },
  explainer: { engine: "hyperframes", level: "high", refs: ["references/scene-types/_common.md", "references/scene-types/explainer-anatomy.md"], deps: ["anatomy skill (wheresryan22/anatomy)"] },
  character: { engine: "lemo", level: "high", refs: ["references/scene-types/character-lemo.md"], deps: ["lemo-opuscar library (~350 MB deps)"] },
  "3d": { engine: "hyperframes", level: "high", refs: ["references/scene-types/_common.md", "references/scene-types/3d.md"], deps: ["three (vendored)"] },
};

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const fileHash = (path) => (existsSync(path) ? sha256(readFileSync(path)) : null);

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read JSON ${path}: ${err.message}`);
  }
}

export const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

export const schemaFor = (kind) => readJson(join(SCHEMA_DIR, `${kind}.schema.json`));

export function validateKind(kind, data) {
  return validate(schemaFor(kind), data);
}

export function sceneEngine(scene, studio) {
  if (scene.engine) return scene.engine;
  // 3D runs as plain three.js inside HyperFrames; Remotion (R3F) only for physics / post-processing.
  if (scene.type === "3d" && (scene.three?.physics || scene.three?.postfx)) return "remotion";
  const byType = SCENE_TYPES[scene.type]?.engine ?? "hyperframes";
  // A whole-3D project defaults to Remotion for its 2D scenes as well.
  if (byType === "hyperframes" && studio?.engine?.default === "remotion") return "remotion";
  return byType;
}

export function loadProject(dir) {
  const root = resolve(dir);
  const studioPath = join(root, "studio.json");
  if (!existsSync(studioPath)) throw new Error(`No studio.json in ${root}. Run init-project.mjs first.`);
  const studio = readJson(studioPath);
  const brandPath = resolve(root, studio.brand?.ref ?? "brand/brand.json");
  const storyboardPath = join(root, "storyboard.json");
  return {
    root,
    studioPath,
    studio,
    brandPath,
    brand: existsSync(brandPath) ? readJson(brandPath) : null,
    storyboardPath,
    storyboard: existsSync(storyboardPath) ? readJson(storyboardPath) : null,
    save() {
      writeJson(studioPath, this.studio);
    },
  };
}

// Placeholders left by templates. A gate input that still has one is not ready.
export const TODO_RE = /<!--\s*TODO|\bTODO:/;

// Cross-file checks the schemas cannot express.
export function crossCheck(project) {
  const errors = [];
  const sb = project.storyboard;
  if (sb) {
    const ids = sb.scenes.map((s) => s.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) errors.push(`storyboard: duplicate scene ids ${[...new Set(dup)].join(", ")}`);
    const lineIds = sb.scenes.flatMap((s) => (s.lines ?? []).map((l) => l.id));
    const dupLines = lineIds.filter((id, i) => lineIds.indexOf(id) !== i);
    if (dupLines.length) errors.push(`storyboard: duplicate line ids ${[...new Set(dupLines)].join(", ")}`);
    for (const s of sb.scenes) {
      if (s.type === "character" && !s.character?.style) errors.push(`storyboard ${s.id}: character scene needs character.style`);
      if (s.engine === "lemo" && s.type !== "character") errors.push(`storyboard ${s.id}: engine lemo is only for character scenes`);
      for (const a of s.assets ?? []) {
        if (!existsSync(join(project.root, a))) errors.push(`storyboard ${s.id}: missing asset ${a}`);
      }
    }
  }
  if (!project.brand) errors.push(`brand: not found at ${project.brandPath}`);
  const { width, height, aspect } = project.studio.format ?? {};
  const want = ASPECTS[aspect];
  if (want && width && height && width * want.height !== height * want.width) {
    errors.push(`studio.format: ${width}x${height} does not match aspect ${aspect}`);
  }
  return errors;
}

export function parseArgs(argv, { flags = [], options = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=", 2);
    if (flags.includes(key)) out[key] = true;
    else if (options.includes(key)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      out[key] = value;
    } else throw new Error(`Unknown option --${key}`);
  }
  return out;
}

export const now = () => new Date().toISOString();

// True when the module is the script node was started with (so scripts can also be imported).
export const isMain = (url) => {
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === url;
  } catch {
    return false;
  }
};
