#!/usr/bin/env node
// Screen the voice-over for misread words with a speech-to-text model (after build-audio).
//   node check-pronunciation.mjs <project-dir> [line-id…] [--allow-stt] [--dry-run] [--all] [--json]
// Each sentence wav (audio/manifest.json) goes to the OpenAI-compatible endpoint in studio.json → audio.stt.<lang>
// (POST /v1/audio/transcriptions). The transcript is compared with the line: missing / changed words, every
// pronunciation-dictionary entry (heard written or spelled), acronyms without an entry, and a duration check
// (each spelled letter adds ~0.16–0.48 s of speech; ASR often merges spelled letters, e.g. "xi vi i" → "CV").
// Screening only: a flagged line is one to listen to, the user's ear decides. Report: review/pronunciation.json.
// Refuses to call STT until the user agreed (studio.json → services.stt, or --allow-stt after asking).
// Transcripts are cached per audio + model (audio/stt-cache/), so a re-check only sends changed sentences.
// Exit 0 = nothing flagged, 2 = lines to listen to, 3 = consent needed.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { readAudioManifest } from "./lib/gates.mjs";
import { pronunciationsFor, spokenText } from "./lib/pronounce.mjs";
import { sttCached, sttEndpointFor, transcribeFile } from "./lib/stt.mjs";
import { checkLine } from "./lib/pron-check.mjs";
import { speechRate } from "./lib/speech-rate.mjs";

export async function checkPronunciation(dir, { ids = [], allowStt = false, dryRun = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  const { studio } = project;
  const manifest = readAudioManifest(project);
  if (!manifest) throw new Error("no audio/manifest.json yet: run build-audio.mjs first");
  const lang0 = studio.meta.language;
  const byId = new Map((project.storyboard?.scenes ?? []).flatMap((s) => (s.lines ?? []).map((l) => [l.id, { scene: s, line: l }])));
  const cacheDir = join(project.root, "audio", "stt-cache");

  const jobs = manifest.scenes.flatMap((s) => s.lines ?? []).filter((m) => !ids.length || ids.includes(m.id) || ids.includes(byId.get(m.id)?.scene.id)).map((m) => {
    const src = byId.get(m.id);
    const line = src?.line ?? { id: m.id, text: m.text };
    const lang = line.lang ?? lang0;
    const ep = sttEndpointFor(studio, lang);
    const language = ep.language ?? lang.split("-")[0];
    const file = join(project.root, m.file);
    if (!existsSync(file)) throw new Error(`${m.id}: ${m.file} is missing: run build-audio.mjs again`);
    return { m, line, lang, ep, language, file, cached: sttCached(cacheDir, file, ep, language) };
  });
  const missing = ids.filter((id) => !jobs.some((j) => j.m.id === id || byId.get(j.m.id)?.scene.id === id));
  if (missing.length) throw new Error(`not in audio/manifest.json: ${missing.join(", ")}`);
  const calls = jobs.filter((j) => !j.cached);
  if (dryRun) return { project, jobs, calls, rows: [] };
  if (calls.length && !studio.services?.stt) {
    if (!allowStt) {
      const ep = calls[0].ep;
      const err = new Error(`${calls.length} speech-to-text call(s) needed (${ep.model} @ ${ep.base_url}). Ask the user, then re-run with --allow-stt.`);
      err.code = 3;
      throw err;
    }
    studio.services = { ...(studio.services ?? {}), stt: true };
    project.save();
  }

  const rows = [];
  for (const j of jobs) {
    const { text: transcript, cached } = await transcribeFile(cacheDir, j.file, j.ep, { language: j.language });
    const dict = pronunciationsFor(project, j.lang);
    const spoken = spokenText(project, j.line, j.lang);
    const r = checkLine({ text: j.line.text, say: j.line.say ?? null, spoken: spoken.text, hits: spoken.hits, dict, transcript, duration: j.m.duration, wps: speechRate(project, j.lang).wps });
    rows.push({ id: j.m.id, scene: byId.get(j.m.id)?.scene.id ?? null, file: j.m.file, text: j.line.text, spoken: spoken.text, transcript, duration: j.m.duration, cached, ...r });
    log(`${cached ? "· cached" : "✓ stt   "} ${j.m.id}`);
  }
  const report = { model: jobs[0]?.ep.model ?? null, audio: manifest.hash, lines: rows.map(({ ok, id, scene, file, text, spoken, transcript, duration, similarity, issues, timing }) => ({ id, scene, ok, file, text, spoken, transcript, duration, similarity, timing, issues })) };
  mkdirSync(join(project.root, "review"), { recursive: true });
  const out = join(project.root, "review", "pronunciation.json");
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  return { project, jobs, calls, rows, report: out };
}

export function formatReport(rows, { all = false } = {}) {
  const lines = [];
  for (const r of rows) {
    if (r.ok && !all) continue;
    lines.push(`${r.ok ? "✓" : "✗"} ${r.id}  ${r.duration}s${r.timing ? ` (${r.timing.letters} spelled letter(s): ${r.timing.residual}s, expected ${r.timing.min}–${r.timing.max}s)` : ""}`);
    lines.push(`    text:  ${r.text}`);
    if (r.spoken !== r.text) lines.push(`    said:  ${r.spoken}`);
    lines.push(`    heard: ${r.transcript}`);
    if (!r.ok) lines.push(`    play:  ${r.file}`);
    for (const i of r.issues) lines.push(`    ! ${i}`);
  }
  return lines.join("\n");
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2), { flags: ["allow-stt", "dry-run", "all", "json", "help"] });
  const [dir, ...ids] = args._;
  if (args.help || !dir) {
    console.log("usage: check-pronunciation.mjs <project-dir> [line-id|scene-id…] [--allow-stt] [--dry-run] [--all] [--json]");
    process.exit(dir ? 0 : 1);
  }
  checkPronunciation(dir, { ids, allowStt: args["allow-stt"], dryRun: args["dry-run"], log: args.json ? () => {} : console.log })
    .then((r) => {
      if (args["dry-run"]) {
        console.log(`${r.jobs.length} sentence(s), ${r.calls.length} speech-to-text call(s) needed, ${r.jobs.length - r.calls.length} cached`);
        return;
      }
      const flagged = r.rows.filter((x) => !x.ok);
      if (args.json) console.log(JSON.stringify(r.rows.map(({ id, ok, transcript, issues, timing }) => ({ id, ok, transcript, issues, timing }))));
      else {
        const text = formatReport(r.rows, { all: args.all });
        if (text) console.log(text);
        console.log(`${r.rows.length} sentence(s) checked, ${flagged.length} to listen to → ${r.report}`);
        if (flagged.length) console.log("ASR is screening only (it merges spelled letters): play the flagged sentences to the user before changing anything. Fix with pronunciations (brand.json / studio.json) or the line's say, then build-audio.mjs.");
      }
      if (flagged.length) process.exitCode = 2;
    })
    .catch((err) => {
      console.error(err.cause ? `${err.message}: ${err.cause.code ?? err.cause.message}` : err.message);
      process.exit(err.code === 3 ? 3 : 1);
    });
}
