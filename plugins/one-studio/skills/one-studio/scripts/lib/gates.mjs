// Gate state: what each gate depends on (its input hash) and what must be true to close it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GATES, TODO_RE, crossCheck, fileHash, sha256, validateKind } from "./project.mjs";
import { audioHash, sceneHash, sceneSourceExists, scenesHash } from "./hash.mjs";

const short = (h) => h.slice(0, 12);

export const outputPath = (project, kind) => {
  const out = join(project.root, project.studio.render?.out_dir ?? "out");
  const name = project.studio.meta.name;
  return { preview: join(out, `${name}-preview.mp4`), final: join(out, `${name}.mp4`), manifest: join(out, "manifest.json") }[kind];
};

export function gateInputHash(project, gate) {
  switch (gate.id) {
    case "setup":
      return null;
    case "brief":
    case "script":
    case "storyboard":
    case "estimate":
      return fileHash(join(project.root, gate.input));
    case "keyframes":
    case "build":
      // Layout only: build-audio stretching a scene or re-timing its data-line reveals keeps the
      // per-scene approvals, so it must not re-open these gates either (clips are still re-rendered:
      // preview/render/publish hash the full scenes).
      return scenesHash(project, { layoutOnly: true });
    case "audio":
      return audioHash(project);
    case "preview":
    case "render":
      return short(sha256(`${scenesHash(project)}|${audioHash(project)}`));
    case "publish":
      return short(sha256(`${scenesHash(project)}|${audioHash(project)}|${JSON.stringify(project.studio.format.exports ?? [])}`));
    default:
      return null;
  }
}

// Conditions checked on --approve (beyond "previous gates done").
export function gateProblems(project, gate) {
  const p = [];
  const scenes = project.storyboard?.scenes ?? [];
  const states = new Map((project.studio.scenes ?? []).map((s) => [s.id, s]));
  if (gate.input?.endsWith(".md")) {
    const path = join(project.root, gate.input);
    if (!existsSync(path)) p.push(`missing ${gate.input}`);
    else if (TODO_RE.test(readFileSync(path, "utf8"))) p.push(`${gate.input} still has TODO placeholders`);
  }
  if (["storyboard", "estimate"].includes(gate.id)) {
    p.push(...validateKind("storyboard", project.storyboard ?? {}), ...crossCheck(project));
    if (!scenes.length) p.push("storyboard has no scenes");
  }
  if (gate.id === "keyframes" || gate.id === "build") {
    for (const s of scenes) {
      if (!sceneSourceExists(project, s)) p.push(`scene ${s.id}: no source file yet`);
      else if (states.get(s.id)?.approved_hash !== sceneHash(project, s)) p.push(`scene ${s.id}: keyframes not approved for its current version`);
      else if (gate.id === "build") {
        const clip = states.get(s.id)?.preview_clip;
        if (!clip || !clip.includes(sceneHash(project, s)) || !existsSync(join(project.root, clip))) p.push(`scene ${s.id}: not rendered yet (render-changed-scenes.mjs --preview)`);
      }
    }
  }
  if (gate.id === "audio") {
    const m = readAudioManifest(project);
    const needsVo = scenes.some((s) => s.lines?.length);
    if (project.studio.audio?.music == null) p.push("music not chosen yet: make-music.mjs --samples → audio-picker.mjs → ask → make-music.mjs --use <bed|file|none>");
    if (needsVo && !m) p.push("no audio yet: run build-audio.mjs");
    else if (m && m.hash !== audioHash(project)) p.push("audio is out of date: run build-audio.mjs");
  }
  if (gate.id === "preview" || gate.id === "render") {
    const kind = gate.id === "preview" ? "preview" : "final";
    const rec = project.studio.outputs?.[kind];
    if (!rec || !existsSync(join(project.root, rec.path))) p.push(`no ${kind} video yet: run render-changed-scenes.mjs${kind === "preview" ? " --preview" : ""} and concat-and-mix.mjs${kind === "preview" ? " --preview" : ""}`);
    else if (rec.hash !== gateInputHash(project, gate)) p.push(`${kind} video is out of date: re-run the render steps`);
  }
  if (gate.id === "publish" && !existsSync(outputPath(project, "manifest"))) p.push("no out/manifest.json yet: run publish.mjs");
  return p;
}

export function readAudioManifest(project) {
  const path = join(project.root, "audio", "manifest.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

// Gates approved by one-studio ≤ 0.2 stored the full scenes hash for keyframes/build; still accept it.
const legacyHash = (project, gate) => (["keyframes", "build"].includes(gate.id) ? scenesHash(project) : null);

export function gateState(project, gate) {
  const record = project.studio.gates?.[gate.id] ?? {};
  const current = gateInputHash(project, gate);
  const stale = Boolean(record.done && record.hash && current && record.hash !== current && record.hash !== legacyHash(project, gate));
  return { ...gate, done: Boolean(record.done), stale, at: record.at ?? null, currentHash: current };
}

export function currentGate(project) {
  for (const gate of GATES) {
    const s = gateState(project, gate);
    if (!s.done || s.stale) return s;
  }
  return null;
}

export { GATES };
