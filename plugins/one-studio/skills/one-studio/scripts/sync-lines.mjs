#!/usr/bin/env node
// Write VO line timings (audio/manifest.json → scenes[].lines[].start) into scenes that tag elements with
// data-line="<line-id>"; S.lines() in the scene then reveals each element when its sentence starts.
// build-audio does this automatically; run it by hand after adding data-line attributes to a scene.
//   node sync-lines.mjs <project-dir> [scene-id…]
// Only the timing block changes, so a scene's keyframe approval is kept (like a VO-driven length change).
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { readAudioManifest } from "./lib/gates.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { lineSyncWarning, writeLineTimes } from "./lib/scenes.mjs";

// -> { changed: [scene ids], warnings: [scenes with VO lines but no data-line element] }
export function syncLines(dir, ids = []) {
  const project = loadProject(dir);
  const manifest = readAudioManifest(project);
  if (!manifest) throw new Error("no audio/manifest.json yet: run build-audio.mjs first");
  const timing = new Map(manifest.scenes.map((s) => [s.id, s.lines ?? []]));
  const changed = [];
  const warnings = [];
  for (const scene of project.storyboard?.scenes ?? []) {
    if (ids.length && !ids.includes(scene.id)) continue;
    if (!sceneSourceExists(project, scene) || !timing.has(scene.id)) continue;
    const warning = lineSyncWarning(project, scene);
    if (warning) warnings.push(warning);
    const before = sceneHash(project, scene);
    if (!writeLineTimes(project, scene, timing.get(scene.id))) continue;
    const after = sceneHash(project, scene);
    const state = project.studio.scenes.find((x) => x.id === scene.id);
    if (state?.approved_hash === before) state.approved_hash = after;
    changed.push(scene.id);
  }
  project.save();
  return { changed, warnings };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"] });
    const [dir, ...ids] = args._;
    if (args.help || !dir) {
      console.log("usage: sync-lines.mjs <project-dir> [scene-id…]");
      process.exit(dir ? 0 : 1);
    }
    const { changed, warnings } = syncLines(dir, ids);
    for (const w of warnings) console.log(`⚠ ${w}`);
    console.log(changed.length ? `✓ line timings written: ${changed.join(", ")} (approvals kept; re-render these scenes)` : "· nothing to sync (no data-line elements, or timings unchanged)");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
