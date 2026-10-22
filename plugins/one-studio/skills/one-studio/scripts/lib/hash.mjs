// Content hashes that decide what must re-render.
// A scene hash covers: the scene source, every local file it references (recursively through CSS),
// brand version, engine + version, and the output format. Captions/VO are not part of it:
// they are muxed after concat, so a text change never re-renders pictures.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileHash, sceneEngine, sha256 } from "./project.mjs";
import { effectiveDuration } from "./scenes.mjs";
import { captionSetting } from "./captions.mjs";
import { SFX_VERSION, sfxCues } from "./sfx.mjs";

export const HASH_VERSION = 1;
const short = (h) => h.slice(0, 12);

const REF_RE = /\b(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']|url\(\s*["']?([^"')#?]+)[^"')]*["']?\s*\)|\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

// Sound for the studio preview only (the delivered mix is FFmpeg's): never part of a picture hash.
const NON_VISUAL = /[\\/]assets[\\/](?:audio-cues\.js$|sfx[\\/]|music[\\/])/;

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
    if (!abs.startsWith(root) || NON_VISUAL.test(abs)) continue;
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

// <style data-ratio="9:16,4:5"> blocks apply only to those aspect ratios, so they are hashed only for those
// ratios: tuning the portrait layout never re-opens the 16:9 scene.
// The block's own line goes with it (indent + newline), so adding one leaves other ratios' text identical.
const RATIO_STYLE_RE = /[ \t]*<style\b[^>]*\bdata-ratio\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/style>[ \t]*\n?/gi;

// HyperFrames merges adjacent <style> blocks when it loads a composition, which drops data-ratio, so os.js
// cannot switch the block off at runtime. Every snapshot/render input is therefore staged per ratio with the
// other ratios' blocks removed (stripRatioStyles).
// Projects created before that fix (no studio.json → render.ratio_stage) may hold stills and clips that show the
// leak: there, scenes with ratio blocks carry RATIO_STAGE_VERSION in their hash so they are made again. Projects
// created after it never get the key, so adding a ratio block keeps the main ratio's approval and clips.
export const RATIO_STAGE_VERSION = 1;
const stagedProject = (project) => (project.studio.render?.ratio_stage ?? 0) >= RATIO_STAGE_VERSION;
export const hasRatioStyles = (html) => html.search(RATIO_STYLE_RE) >= 0;
export const stripRatioStyles = (html, aspect) =>
  html.replace(RATIO_STYLE_RE, (m, list) => (list.split(",").map((r) => r.trim()).includes(aspect) ? m : ""));
// Written by build-audio / sync-lines from the VO timings.
export const LINES_BLOCK_RE = /<script\b[^>]*\bid\s*=\s*["']os-lines["'][^>]*>[\s\S]*?<\/script>\n?/i;

// The scene source as it matters for one aspect ratio. layoutOnly also drops what the audio step owns
// (scene length, VO line timings): used by the keyframe/build gates, which must not re-open when the
// VO stretches a scene (build-audio keeps the per-scene approvals for exactly that change).
export function sceneText(html, { aspect, layoutOnly = false } = {}) {
  let t = stripRatioStyles(html, aspect);
  if (layoutOnly) {
    t = t
      .replace(/data-duration="[\d.]+"/g, 'data-duration=""')
      .replace(LINES_BLOCK_RE, "")
      .replace(/window\.DUR\s*=\s*[\d.]+/g, "window.DUR = 0");
  }
  return t;
}

// The scene's own entry file (whose text is filtered before hashing).
const mainFile = (project, scene, engine) =>
  engine === "hyperframes" ? join(project.root, "scenes", `${scene.id}.html`) : engine === "lemo" ? join(project.root, "scenes", scene.id, "index.html") : null;

// opts.aspect: hash as seen by that aspect ratio (default: the project's own); opts.layoutOnly: see sceneText.
export function sceneHash(project, scene, { aspect = project.studio.format.aspect, layoutOnly = false } = {}) {
  const engine = sceneEngine(scene, project.studio);
  const { width, height, fps } = project.studio.format;
  const entry = mainFile(project, scene, engine);
  const files = {};
  let ratioStage;
  for (const f of sceneSources(project, scene)) {
    let h = fileHash(f);
    if (h && f === entry) {
      const html = readFileSync(f, "utf8");
      if (!stagedProject(project) && hasRatioStyles(html)) ratioStage = RATIO_STAGE_VERSION;
      const text = sceneText(html, { aspect, layoutOnly });
      // Unchanged text keeps the plain file hash, so projects hashed by older versions stay valid.
      if (text !== html) h = sha256(text);
    }
    files[relative(project.root, f)] = h ?? "missing";
  }
  const parts = {
    v: HASH_VERSION,
    engine,
    engineVersion: project.studio.engine.versions?.[engine] ?? null,
    format: { width, height, fps },
    brand: project.brand?.version ?? null,
    files,
    // Only for scenes with ratio blocks in older projects (undefined is dropped by JSON.stringify).
    ratioStage,
    // Type-specific inputs that live in the storyboard rather than in files.
    extra: engine === "hyperframes" ? null : { type: scene.type, character: scene.character ?? null, three: scene.three ?? null, duration: layoutOnly ? null : effectiveDuration(project, scene) },
  };
  return short(sha256(JSON.stringify(parts)));
}

export const sceneSourceExists = (project, scene) => sceneSources(project, scene).some((f) => existsSync(f));

// Combined hash over every scene's hash, in storyboard order.
export function scenesHash(project, opts = {}) {
  const list = (project.storyboard?.scenes ?? []).map((s) => `${s.id}:${sceneHash(project, s, opts)}`);
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
  // Keys added after 0.2.0 are left out (undefined) at their old default, so older hashes stay valid.
  const cues = sfxCues(project).map((c) => [c.scene, c.at, c.line ?? null, c.gain, c.name ?? null, c.src ? fileHash(resolve(project.root, c.src)) : null]);
  const capMode = captionSetting(project);
  return short(sha256(JSON.stringify({
    lines, durations, tts, preset: project.brand?.voice ?? null, music, sfx: a.sfx ?? false, pause: a.sentence_pause, pad: a.scene_padding, lead: a.lead_in, trim: a.trim, loud: a.loudness,
    cues: cues.length ? { v: SFX_VERSION, cues } : undefined,
    captions: capMode === "burn" ? undefined : capMode,
  })));
}
