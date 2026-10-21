#!/usr/bin/env node
// Show where a one-studio project stands, so the skill always resumes at the right gate.
//   node status.mjs <dir>                    gates + scenes + next step
//   node status.mjs <dir> --estimate         credit / render-time table (gates 4, 5, 6, 9)
//   node status.mjs <dir> --approve <gate>   record the user's approval (stores the input's hash)
//   add --json for machine-readable output
import { existsSync, readFileSync } from "node:fs";
import {
  GATES,
  TODO_RE,
  crossCheck,
  currentGate,
  gateState,
  loadProject,
  now,
  parseArgs,
  validateKind,
} from "./lib/project.mjs";
import { estimate, formatEstimate } from "./lib/estimate.mjs";

const USAGE = "usage: status.mjs <dir> [--estimate] [--approve <gate>] [--note \"…\"] [--json]";

const NEXT = {
  setup: "Gate 0: confirm brand kit, 2D/3D, VO language, allowed services; then init-project.mjs.",
  brief: "Gate 1: ask the minimum questions, fill brief.md, then --approve brief.",
  script: "Gate 2: write script.md (one bullet = one sentence), show it, wait for the user's OK, then --approve script.",
  storyboard: "Gate 3: write storyboard.json from the approved script, show the scene table, wait for OK, then --approve storyboard.",
  estimate: "Gate 4: run --estimate, show the table, wait for the user to accept the cost, then --approve estimate.",
  keyframes: "Gate 5: render 1–3 stills per scene, show the contact sheet, record approvals (phase 4 tooling).",
  build: "Gate 6: build approved scenes, loading only the references of their types.",
  audio: "Gate 7: TTS per sentence, music, SFX; fit scene durations (phase 5 tooling).",
  preview: "Gate 8: low-res preview, wait for the user's OK.",
  render: "Gate 9: render changed scenes, concat, captions, loudnorm.",
  publish: "Gate 10: export ratios, thumbnail, manifest.",
};

function syncScenes(project) {
  const old = new Map(project.studio.scenes.map((s) => [s.id, s]));
  const ids = project.storyboard.scenes.map((s) => s.id);
  project.studio.scenes = ids.map(
    (id) => old.get(id) ?? { id, hash: null, approved_hash: null, clip: null, duration: null, status: "planned" },
  );
  return { added: ids.filter((id) => !old.has(id)), removed: [...old.keys()].filter((id) => !ids.includes(id)) };
}

function approve(project, gateId, note) {
  const gate = GATES.find((g) => g.id === gateId);
  if (!gate) throw new Error(`Unknown gate "${gateId}". Gates: ${GATES.map((g) => g.id).join(", ")}`);
  for (const prev of GATES.slice(0, gate.n)) {
    const s = gateState(project, prev);
    if (!s.done) throw new Error(`Gate ${prev.n} (${prev.id}) is not done yet. Finish it first.`);
    if (s.stale) throw new Error(`${prev.input} changed after gate ${prev.n} (${prev.id}) was approved. Re-approve ${prev.id} first.`);
  }
  const state = gateState(project, gate);
  if (state.inputPath) {
    if (!existsSync(state.inputPath)) throw new Error(`Missing ${gate.input}`);
    if (gate.input.endsWith(".md") && TODO_RE.test(readFileSync(state.inputPath, "utf8"))) {
      throw new Error(`${gate.input} still has TODO placeholders. Fill or delete them first.`);
    }
  }
  let sync = null;
  if (["storyboard", "estimate"].includes(gate.id)) {
    const errors = [...validateKind("storyboard", project.storyboard ?? {}), ...crossCheck(project)];
    if (!project.storyboard?.scenes?.length) errors.push("storyboard has no scenes");
    if (errors.length) throw new Error(`storyboard.json is not valid:\n  ${errors.join("\n  ")}`);
    sync = syncScenes(project);
  }
  project.studio.gates ??= {};
  project.studio.gates[gate.id] = { done: true, at: now(), ...(state.currentHash && { hash: state.currentHash }), ...(note && { note }) };
  project.save();
  return { gate: gate.id, sync };
}

function summary(project) {
  const { studio, brand, storyboard } = project;
  const gates = GATES.map((g) => gateState(project, g));
  const cur = currentGate(project);
  const scenes = storyboard?.scenes ?? [];
  const byType = {};
  for (const s of scenes) byType[s.type] = (byType[s.type] ?? 0) + 1;
  return {
    title: studio.meta.title ?? studio.meta.name,
    format: studio.format,
    engine: studio.engine,
    language: studio.meta.language,
    tts: studio.audio?.tts?.[studio.meta.language] ?? studio.audio?.tts?.default ?? null,
    ttsAllowed: Boolean(studio.services?.tts),
    series: studio.meta.series,
    episode: studio.meta.episode,
    brand: brand ? { name: brand.name, version: brand.version, path: project.brandPath } : null,
    brandStale: Boolean(brand && studio.brand.version != null && studio.brand.version !== brand.version),
    gates: gates.map(({ id, n, title, done, stale, at }) => ({ id, n, title, done, stale, at })),
    current: cur ? cur.id : null,
    next: cur ? (cur.stale ? `${cur.input} changed since approval: show the change to the user and re-approve ${cur.id}.` : NEXT[cur.id]) : "All gates done.",
    scenes: { count: scenes.length, byType, duration: scenes.reduce((n, s) => n + s.duration, 0) },
  };
}

function printSummary(s) {
  const f = s.format;
  console.log(`one-studio · ${s.title}`);
  console.log(`  ${f.aspect} ${f.width}x${f.height} @ ${f.fps}fps · ${s.engine.default} (${s.engine.dimension}) · VO ${s.language}`);
  if (s.brand) console.log(`  brand ${s.brand.name} v${s.brand.version}${s.series ? ` · series ${s.series} ep ${s.episode}` : ""}`);
  else console.log("  brand: MISSING");
  if (s.tts) {
    console.log(`  voice ${s.tts.model} @ ${s.tts.base_url}, voice "${s.tts.voice}"${s.ttsAllowed ? "" : " (not confirmed: ask before the first TTS call)"}`);
  }
  if (s.brandStale) console.log("  ⚠ brand version changed since last render: every scene will re-render (ask the user)");
  console.log("Gates:");
  for (const g of s.gates) {
    const mark = g.stale ? "!" : g.done ? "✓" : g.id === s.current ? "→" : "·";
    console.log(`  ${mark} ${String(g.n).padStart(2)} ${g.title}${g.stale ? "  (changed since approval)" : ""}`);
  }
  const types = Object.entries(s.scenes.byType).map(([t, n]) => `${t}×${n}`).join(", ");
  console.log(`Scenes: ${s.scenes.count}${types ? ` (${types})` : ""}, ${s.scenes.duration.toFixed(1)}s`);
  console.log(`Next: ${s.next}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["estimate", "json", "help"], options: ["approve", "note"] });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log(USAGE);
    process.exit(dir ? 0 : 1);
  }
  const project = loadProject(dir);

  if (args.approve) {
    const result = approve(project, args.approve, args.note);
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

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
