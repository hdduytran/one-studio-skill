#!/usr/bin/env node
// Show where a one-studio project stands, so the skill always resumes at the right gate.
//   node status.mjs <dir>                          gates + scenes + next step
//   node status.mjs <dir> --estimate               credit / render-time table (gates 4, 5, 6, 9)
//   node status.mjs <dir> --approve <gate>         record the user's approval (stores the gate's input hash)
//                                                  script: runs script-lint.mjs first; lint errors refuse unless --force-lint
//   node status.mjs <dir> --approve-scenes <ids|all>   keyframe approval per scene (gate 5)
//   node status.mjs <dir> --captions none|sidecar|mux|burn   record the caption choice for this project (gate 0 / 7)
//   add --json for machine-readable output
import { GATES, isMain, loadProject, now, parseArgs, validateKind } from "./lib/project.mjs";
import { CAPTION_MODES, captionMode, captionSetting } from "./lib/captions.mjs";
import { hasLibass } from "./lib/ffmpeg.mjs";
import { currentGate, gateProblems, gateState } from "./lib/gates.mjs";
import { sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { estimate, formatEstimate } from "./lib/estimate.mjs";
import { formatViolation, lintProject } from "./script-lint.mjs";

const USAGE = 'usage: status.mjs <dir> [--estimate] [--approve <gate>] [--force-lint] [--approve-scenes <ids|all>] [--captions none|sidecar|mux|burn] [--note "…"] [--json]';

const NEXT = {
  setup: "Gate 0: confirm brand kit (preset?), 2D/3D, VO language + voice, captions (none/sidecar/mux/burn), allowed services; then init-project.mjs.",
  brief: "Gate 1: ask the minimum questions, fill brief.md, then --approve brief.",
  script: "Gate 2: write script.md (one bullet = one sentence), show it, wait for the user's OK, then --approve script.",
  storyboard: "Gate 3: write storyboard.json from the approved script, show the scene table, wait for OK, then --approve storyboard.",
  estimate: "Gate 4: run --estimate, show the table, wait for the user to accept the cost, then --approve estimate.",
  keyframes: "Gate 5: prepare-project.mjs, new-scene.mjs, write each scene, keyframe-stills.mjs, show review/sheet.jpg, then --approve-scenes <ids> and --approve keyframes.",
  build: "Gate 6: render-changed-scenes.mjs --preview (only approved, changed scenes render), then --approve build.",
  audio: "Gate 7: music (make-music.mjs --samples → audio-picker.mjs → --use <bed|none>) if not chosen, re-ask captions if needed, build-audio.mjs (asks before the first TTS call), then --approve audio.",
  preview: "Gate 8: concat-and-mix.mjs --preview, show out/<name>-preview.mp4, wait for OK, then --approve preview.",
  render: "Gate 9: --estimate, render-changed-scenes.mjs, concat-and-mix.mjs, then --approve render.",
  publish: "Gate 10: publish.mjs (extra ratios, thumbnail, manifest), then --approve publish.",
};

function syncScenes(project) {
  const old = new Map(project.studio.scenes.map((s) => [s.id, s]));
  const ids = project.storyboard.scenes.map((s) => s.id);
  project.studio.scenes = ids.map((id) => old.get(id) ?? { id, hash: null, approved_hash: null, clip: null, duration: null, status: "planned" });
  return { added: ids.filter((id) => !old.has(id)), removed: [...old.keys()].filter((id) => !ids.includes(id)) };
}

export function approve(project, gateId, note, { forceLint = false } = {}) {
  const gate = GATES.find((g) => g.id === gateId);
  if (!gate) throw new Error(`Unknown gate "${gateId}". Gates: ${GATES.map((g) => g.id).join(", ")}`);
  for (const prev of GATES.slice(0, gate.n)) {
    const s = gateState(project, prev);
    if (!s.done) throw new Error(`Gate ${prev.n} (${prev.id}) is not done yet. Finish it first.`);
    if (s.stale) throw new Error(`Inputs of gate ${prev.n} (${prev.id}) changed after it was approved. Re-approve ${prev.id} first.`);
  }
  const problems = gateProblems(project, gate);
  if (problems.length) throw new Error(`Cannot approve ${gate.id}:\n  ${problems.join("\n  ")}`);
  if (gate.id === "script" && !forceLint) {
    const errors = lintProject(project).filter((v) => v.severity === "error");
    if (errors.length) {
      throw new Error(`Cannot approve script: script-lint found ${errors.length} error(s). Fix them, or pass --force-lint if the user accepts them.\n  ${errors.map(formatViolation).join("\n  ")}`);
    }
  }
  let sync = null;
  if (["storyboard", "estimate"].includes(gate.id)) sync = syncScenes(project);
  const state = gateState(project, gate);
  project.studio.gates ??= {};
  project.studio.gates[gate.id] = { done: true, at: now(), ...(state.currentHash && { hash: state.currentHash }), ...(note && { note }) };
  project.save();
  return { gate: gate.id, sync };
}

export function approveScenes(project, which) {
  const scenes = project.storyboard?.scenes ?? [];
  const ids = which === "all" ? scenes.map((s) => s.id) : which.split(",").map((s) => s.trim()).filter(Boolean);
  const done = [];
  for (const id of ids) {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) throw new Error(`scene ${id} is not in storyboard.json`);
    if (!sceneSourceExists(project, scene)) throw new Error(`scene ${id} has no source file yet`);
    let state = project.studio.scenes.find((s) => s.id === id);
    if (!state) project.studio.scenes.push((state = { id, hash: null, approved_hash: null, clip: null, duration: null, status: "planned" }));
    const h = sceneHash(project, scene);
    Object.assign(state, { hash: h, approved_hash: h, status: state.status === "rendered" && state.clip?.includes(h) ? "rendered" : "reviewed" });
    done.push(`${id}@${h}`);
  }
  project.save();
  return done;
}

// Per-project caption choice (studio.json → captions), overriding the brand kit.
export function setCaptions(project, mode) {
  if (!CAPTION_MODES.includes(mode)) throw new Error(`--captions must be one of ${CAPTION_MODES.join(", ")}`);
  project.studio.captions = { enabled: mode !== "none", mode };
  project.save();
  return { mode, effective: captionMode(project, { libass: hasLibass() }) };
}

function sceneRows(project) {
  const states = new Map((project.studio.scenes ?? []).map((s) => [s.id, s]));
  return (project.storyboard?.scenes ?? []).map((s) => {
    const st = states.get(s.id) ?? {};
    const exists = sceneSourceExists(project, s);
    const h = exists ? sceneHash(project, s) : null;
    let state = "planned";
    if (exists) state = "built";
    if (h && st.approved_hash === h) state = "approved";
    else if (h && st.approved_hash) state = "changed";
    if (h && st.clip?.includes(h)) state = "rendered";
    return { id: s.id, type: s.type, duration: s.duration, state, hash: h };
  });
}

function summary(project) {
  const { studio, brand } = project;
  const gates = GATES.map((g) => gateState(project, g));
  const cur = currentGate(project);
  const scenes = sceneRows(project);
  return {
    title: studio.meta.title ?? studio.meta.name,
    format: studio.format,
    engine: studio.engine,
    language: studio.meta.language,
    tts: studio.audio?.tts?.[studio.meta.language] ?? studio.audio?.tts?.default ?? null,
    ttsAllowed: Boolean(studio.services?.tts),
    captions: { chosen: captionSetting(project), effective: captionMode(project, { libass: hasLibass() }) },
    music: studio.audio?.music ?? null,
    series: studio.meta.series,
    episode: studio.meta.episode,
    brand: brand ? { name: brand.name, version: brand.version, path: project.brandPath } : null,
    brandStale: Boolean(brand && studio.brand.version != null && studio.brand.version !== brand.version),
    gates: gates.map(({ id, n, title, done, stale, at }) => ({ id, n, title, done, stale, at })),
    current: cur ? cur.id : null,
    next: cur ? (cur.stale ? `Inputs of gate ${cur.n} (${cur.id}) changed since approval: show the change to the user and re-approve ${cur.id}.` : NEXT[cur.id]) : "All gates done.",
    scenes,
    duration: scenes.reduce((n, s) => n + s.duration, 0),
  };
}

function printSummary(s) {
  const f = s.format;
  console.log(`one-studio · ${s.title}`);
  console.log(`  ${f.aspect} ${f.width}x${f.height} @ ${f.fps}fps · ${s.engine.default} (${s.engine.dimension}) · VO ${s.language}`);
  if (s.brand) console.log(`  brand ${s.brand.name} v${s.brand.version}${s.series ? ` · series ${s.series} ep ${s.episode}` : ""}`);
  else console.log("  brand: MISSING");
  if (s.tts) console.log(`  voice ${s.tts.model} @ ${s.tts.base_url}, voice "${s.tts.voice}"${s.ttsAllowed ? "" : " (not confirmed: ask before the first TTS call)"}`);
  console.log(`  captions ${s.captions.chosen}${s.captions.effective !== s.captions.chosen ? ` → ${s.captions.effective} on this machine (no libass)` : ""} · music ${s.music === false ? "none (user choice)" : s.music ?? "not chosen yet (gate 7 asks)"}`);
  if (s.brandStale) console.log("  ⚠ brand version changed since last render: every scene will re-render (ask the user)");
  console.log("Gates:");
  for (const g of s.gates) {
    const mark = g.stale ? "!" : g.done ? "✓" : g.id === s.current ? "→" : "·";
    console.log(`  ${mark} ${String(g.n).padStart(2)} ${g.title}${g.stale ? "  (inputs changed since approval)" : ""}`);
  }
  console.log(`Scenes: ${s.scenes.length}, ${s.duration.toFixed(1)}s`);
  for (const r of s.scenes) console.log(`  ${r.id.padEnd(6)} ${r.type.padEnd(9)} ${String(r.duration).padStart(5)}s  ${r.state}`);
  console.log(`Next: ${s.next}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["estimate", "json", "help", "force-lint"], options: ["approve", "approve-scenes", "note", "captions"] });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log(USAGE);
    process.exit(dir ? 0 : 1);
  }
  const project = loadProject(dir);

  if (args.captions) {
    const r = setCaptions(project, args.captions);
    console.log(args.json ? JSON.stringify(r) : `✓ captions: ${r.mode}${r.effective !== r.mode ? ` (this FFmpeg has no libass: delivered as ${r.effective})` : ""}. Re-run build-audio.mjs, then the preview/render steps.`);
    return;
  }
  if (args["approve-scenes"]) {
    const done = approveScenes(project, args["approve-scenes"]);
    console.log(args.json ? JSON.stringify({ approved: done }) : `✓ keyframes approved: ${done.join(", ")}`);
    return;
  }
  if (args.approve) {
    const result = approve(project, args.approve, args.note, { forceLint: Boolean(args["force-lint"]) });
    if (args.json) console.log(JSON.stringify(result));
    else {
      console.log(`✓ gate "${result.gate}" approved`);
      if (result.sync?.added.length) console.log(`  scenes added: ${result.sync.added.join(", ")}`);
      if (result.sync?.removed.length) console.log(`  scenes removed: ${result.sync.removed.join(", ")}`);
    }
    return;
  }
  if (args.estimate) {
    if (!project.storyboard?.scenes?.length) throw new Error("storyboard.json has no scenes yet (gate 3).");
    const errors = validateKind("storyboard", project.storyboard);
    if (errors.length) throw new Error(`storyboard.json is not valid:\n  ${errors.join("\n  ")}`);
    const e = estimate(project);
    console.log(args.json ? JSON.stringify(e, null, 2) : formatEstimate(e));
    return;
  }
  const s = summary(project);
  if (args.json) console.log(JSON.stringify(s, null, 2));
  else printSummary(s);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
