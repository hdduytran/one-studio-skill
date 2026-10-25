#!/usr/bin/env node
// Render only scenes whose hash changed, and only if their keyframes were approved for that hash.
// Each clip is normalised to the project's canonical encode so concat is a stream copy.
//   node render-changed-scenes.mjs <project-dir> [scene-id…] [--preview] [--dry-run] [--json]
// Clips: out/scenes/<id>-<hash>.mp4 (final) or out/preview/<id>-<hash>.mp4 (--preview, low-res).
// Exit code 2 when some scenes are blocked (not approved): ask the user to review them first.
//   node render-changed-scenes.mjs <project-dir> [scene-id…] --draft [--labels] [--dry-run]
// --draft: every scene in draft quality whether approved or not → out/draft/ (outside the gates: studio.json is not
// written). --labels: rendered from staged copies with a review label (scene · line · time); sources untouched.
// Assemble a draft with concat-and-mix.mjs --draft [--labels].
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { engineFor } from "./lib/engines.mjs";
import { encodeSettings, normalize, probe } from "./lib/ffmpeg.mjs";
import { planDraft, renderDraft } from "./lib/draft.mjs";

export function clipPath(project, id, hash, mode) {
  const out = project.studio.render?.out_dir ?? "out";
  return join(out, mode === "preview" ? "preview" : "scenes", `${id}-${hash}.mp4`);
}

export function planRender(project, { ids = [], mode = "final" } = {}) {
  const states = new Map(project.studio.scenes.map((s) => [s.id, s]));
  return (project.storyboard?.scenes ?? [])
    .filter((s) => !ids.length || ids.includes(s.id))
    .map((scene) => {
      if (!sceneSourceExists(project, scene)) return { scene, action: "blocked", reason: "no source file" };
      const hash = sceneHash(project, scene);
      const clip = clipPath(project, scene.id, hash, mode);
      if (existsSync(join(project.root, clip))) return { scene, hash, clip, action: "cached" };
      if (states.get(scene.id)?.approved_hash !== hash) return { scene, hash, clip, action: "blocked", reason: "keyframes not approved for this version" };
      return { scene, hash, clip, action: "render" };
    });
}

export function renderChanged(dir, { ids = [], mode = "final", dryRun = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  const plan = planRender(project, { ids, mode });
  if (dryRun) return { project, plan };
  const settings = encodeSettings(project.studio, mode);
  const tmpDir = join(project.root, ".one-studio", "tmp");
  mkdirSync(tmpDir, { recursive: true });

  for (const item of plan) {
    const state = project.studio.scenes.find((s) => s.id === item.scene.id);
    if (item.action === "render") {
      const t0 = Date.now();
      const raw = join(tmpDir, `${item.scene.id}-${item.hash}.raw.mp4`);
      engineFor(project, item.scene).render(project, item.scene, raw, { mode });
      normalize(raw, join(project.root, item.clip), settings);
      rmSync(raw, { force: true });
      item.seconds = Math.round((Date.now() - t0) / 100) / 10;
      log(`✓ rendered ${item.scene.id} (${item.hash}) in ${item.seconds}s`);
      // Drop this scene's older clips in the same folder: they can never be used again.
      const folder = join(project.root, item.clip, "..");
      for (const f of readdirSync(folder)) {
        if (f.startsWith(`${item.scene.id}-`) && f.endsWith(".mp4") && f !== `${item.scene.id}-${item.hash}.mp4`) rmSync(join(folder, f));
      }
    } else if (item.action === "cached") log(`· cached   ${item.scene.id} (${item.hash})`);
    else log(`✗ blocked  ${item.scene.id}: ${item.reason}`);

    if (state && item.action !== "blocked") {
      state.hash = item.hash;
      if (mode === "preview") state.preview_clip = item.clip;
      else {
        state.clip = item.clip;
        state.status = "rendered";
        state.duration = Math.round(probe(join(project.root, item.clip)).duration * 1000) / 1000;
      }
    }
  }
  project.save();
  rmSync(tmpDir, { recursive: true, force: true });
  return { project, plan };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["preview", "draft", "labels", "dry-run", "json", "help"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir) {
      console.log("usage: render-changed-scenes.mjs <project-dir> [scene-id…] [--preview] [--dry-run] [--json]\n       render-changed-scenes.mjs <project-dir> [scene-id…] --draft [--labels] [--dry-run]");
      process.exit(dir ? 0 : 1);
    }
    if (args.labels && !args.draft) throw new Error("--labels needs --draft");
    if (args.draft) {
      const project = loadProject(dir);
      const plan = args["dry-run"] ? planDraft(project, { ids, labels: args.labels }) : renderDraft(project, { ids, labels: args.labels, log: console.log });
      if (args["dry-run"]) for (const p of plan) console.log(`${p.action.padEnd(8)} ${p.scene.id}${p.reason ? ` (${p.reason})` : ""}`);
      console.log(`draft: ${plan.filter((p) => p.action === "render").length} rendered/to render, ${plan.filter((p) => p.action === "cached").length} cached (nothing recorded in studio.json)`);
      process.exit(0);
    }
    const { plan } = renderChanged(dir, { ids, mode: args.preview ? "preview" : "final", dryRun: args["dry-run"], log: args.json ? () => {} : console.log });
    const count = (a) => plan.filter((p) => p.action === a).length;
    if (args.json) console.log(JSON.stringify(plan.map((p) => ({ id: p.scene.id, action: p.action, hash: p.hash ?? null, clip: p.clip ?? null, reason: p.reason ?? null, seconds: p.seconds ?? null }))));
    else if (args["dry-run"]) for (const p of plan) console.log(`${p.action.padEnd(8)} ${p.scene.id}${p.reason ? ` (${p.reason})` : ""}`);
    if (!args.json) console.log(`${count("render")} rendered/to render, ${count("cached")} cached, ${count("blocked")} blocked`);
    if (count("blocked")) process.exit(2);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

