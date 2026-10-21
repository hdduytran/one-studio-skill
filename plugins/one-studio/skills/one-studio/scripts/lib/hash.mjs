// Content hashes that decide what must re-render.
// A scene hash covers: the scene source, every local file it references (recursively through CSS),
// brand version, engine + version, and the output format. Captions/VO are not part of it:
// they are muxed after concat, so a text change never re-renders pictures.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileHash, sceneEngine, sha256 } from "./project.mjs";
import { effectiveDuration } from "./scenes.mjs";

export const HASH_VERSION = 1;
const short = (h) => h.slice(0, 12);

const REF_RE = /\b(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']|url\(\s*["']?([^"')#?]+)[^"')]*["']?\s*\)|\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

// Local files referenced by an HTML/CSS/JS file, resolved and followed through CSS.
export function collectRefs(file, root, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  if (!/\.(html?|css|m?js)$/.test(file) || /\/vendor\//.test(file)) return seen;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(REF_RE)) {
    const ref = (m[1] ?? m[2] ?? m[3]).trim();
    if (!ref || /^(?:[a-z]+:|\/\/|data:)/i.test(ref) || ref.includes("{{")) continue;
    const abs = resolve(dirname(file), decodeURI(ref));
    if (!abs.startsWith(root)) continue;
    collectRefs(abs, root, seen);
  }
  return seen;
}

function dirFiles(dir, skip = new Set(["out", "stills", "node_modules", ".cache"])) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!skip.has(name)) out.push(...dirFiles(p, skip));
    } else out.push(p);
  }
  return out;
}

// Source files that make up one scene, by engine.
export function sceneSources(project, scene) {
  const engine = sceneEngine(scene, project.studio);
  if (engine === "hyperframes") {
    const file = join(project.root, "scenes", `${scene.id}.html`);
    return [...collectRefs(file, project.root)];
  }
  if (engine === "lemo") return dirFiles(join(project.root, "scenes", scene.id));
  if (engine === "remotion") return dirFiles(join(project.root, "remotion", "src"));
  return [];
}

export function sceneHash(project, scene) {
  const engine = sceneEngine(scene, project.studio);
  const { width, height, fps } = project.studio.format;
  const files = {};
  for (const f of sceneSources(project, scene)) files[relative(project.root, f)] = fileHash(f) ?? "missing";
  const parts = {
    v: HASH_VERSION,
    engine,
    engineVersion: project.studio.engine.versions?.[engine] ?? null,
    format: { width, height, fps },
    brand: project.brand?.version ?? null,
    files,
    // Type-specific inputs that live in the storyboard rather than in files.
    extra: engine === "hyperframes" ? null : { type: scene.type, character: scene.character ?? null, three: scene.three ?? null, duration: effectiveDuration(project, scene) },
  };
  return short(sha256(JSON.stringify(parts)));
}

export const sceneSourceExists = (project, scene) => sceneSources(project, scene).some((f) => existsSync(f));

// Combined hash over every scene's hash, in storyboard order.
export function scenesHash(project) {
  const list = (project.storyboard?.scenes ?? []).map((s) => `${s.id}:${sceneHash(project, s)}`);
  return short(sha256(list.join("|")));
}

// Everything that changes the audio track: sentences, voices, TTS endpoints, music, pacing.
export function audioHash(project) {
  const lines = (project.storyboard?.scenes ?? []).flatMap((s) =>
    (s.lines ?? []).map((l) => [s.id, l.id, l.say ?? l.text, l.lang ?? null, l.voice ?? null, l.pause_after ?? null]),
  );
  const a = project.studio.audio ?? {};
  const music = a.music ? fileHash(resolve(project.root, a.music)) : null;
  const tts = Object.fromEntries(Object.entries(a.tts ?? {}).map(([k, v]) => [k, { model: v.model, voice: v.voice, speed: v.speed ?? 1 }]));
  const durations = (project.storyboard?.scenes ?? []).map((s) => [s.id, s.duration]);
  return short(sha256(JSON.stringify({ lines, durations, tts, preset: project.brand?.voice ?? null, music, sfx: a.sfx ?? false, pause: a.sentence_pause, pad: a.scene_padding, lead: a.lead_in, trim: a.trim, loud: a.loudness })));
}
