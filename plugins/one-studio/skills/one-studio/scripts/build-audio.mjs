#!/usr/bin/env node
// Gate 7: sentence-level voice-over, scene durations fitted to the VO, VO track and captions.
//   node build-audio.mjs <project-dir> [--allow-tts] [--dry-run]
//   node build-audio.mjs <project-dir> --tighten [--pad 1.2] [--apply]   shorter storyboard durations from the real VO
// - One TTS call per storyboard line (cached by text+model+voice+speed in audio/cache/).
// - Scene duration = max(storyboard duration, lead-in + sentences + pauses + padding).
//   HyperFrames scene files get the new data-duration and, when they tag elements with data-line,
//   the VO line timings (<script id="os-lines">); keyframe approvals carry over (VO-driven changes only).
// - Writes audio/vo.wav, captions.srt (unless captions are "none"), audio/manifest.json, and the voice's measured
//   speaking rate (studio.json → audio.tts.<lang>.words_per_second) used to plan scripts and durations.
// - Never shortens a scene: --tighten proposes durations (VO + pad + scripted silence), --apply writes them to
//   storyboard.json (re-opens the storyboard approval) and refits the scenes from the cached VO.
// Refuses to call TTS until the user agreed (studio.json → services.tts, or --allow-tts after asking).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, now, parseArgs, sceneEngine, writeJson } from "./lib/project.mjs";
import { audioHash, sceneHash, sceneSourceExists } from "./lib/hash.mjs";
import { buildIndex, sceneFile, writeLineTimes } from "./lib/scenes.mjs";
import { cacheKey, endpointFor, SAMPLE_RATE, synthLine, voiceFor } from "./lib/tts.mjs";
import { buildSrt, captionSetting } from "./lib/captions.mjs";
import { writeAudioCues } from "./lib/sfx.mjs";
import { run } from "./lib/ffmpeg.mjs";
import { measureRate, recordRate } from "./lib/speech-rate.mjs";
import { formatTighten, tightenPlan } from "./lib/tighten.mjs";

const r3 = (n) => Math.round(n * 1000) / 1000;

// Rewrite the scene's own duration in its HTML (root + any element spanning the whole scene).
export function setSceneDuration(project, scene, seconds) {
  const engine = sceneEngine(scene, project.studio);
  if (engine === "lemo") {
    const page = join(project.root, "scenes", scene.id, "index.html");
    if (!existsSync(page)) return false;
    const html = readFileSync(page, "utf8");
    const next = html.replace(/window\.DUR\s*=\s*[\d.]+/, `window.DUR = ${seconds}`);
    if (next === html) return false;
    writeFileSync(page, next);
    return true;
  }
  if (engine !== "hyperframes") return false;
  const file = sceneFile(project, scene.id);
  if (!existsSync(file)) return false;
  const html = readFileSync(file, "utf8");
  const root = new RegExp(`data-composition-id="${scene.id}"[^>]*?data-duration="([\\d.]+)"`).exec(html);
  if (!root || Number(root[1]) === seconds) return false;
  const old = root[1].replace(".", "\\.");
  writeFileSync(file, html.replace(new RegExp(`data-duration="${old}"`, "g"), `data-duration="${seconds}"`));
  return true;
}

export async function buildAudio(dir, { allowTts = false, dryRun = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  const { studio } = project;
  const a = studio.audio ?? {};
  const lang0 = studio.meta.language;
  const leadIn = a.lead_in ?? 0.3;
  const pause = a.sentence_pause ?? 0.25;
  const pad = a.scene_padding ?? 0.5;
  const cacheDir = join(project.root, "audio", "cache");
  const scenes = project.storyboard?.scenes ?? [];

  // Plan every line first so we can report the number of TTS calls before making any.
  const jobs = scenes.flatMap((s) =>
    (s.lines ?? []).map((l) => {
      const lang = l.lang ?? lang0;
      const v = voiceFor(project, l, lang);
      const text = l.say ?? l.text;
      return { scene: s, line: l, lang, v, text, cached: existsSync(join(cacheDir, `${cacheKey(text, v)}.wav`)) };
    }),
  );
  const calls = jobs.filter((j) => !j.cached);
  if (dryRun) return { project, jobs, calls };
  if (calls.length && !studio.services?.tts) {
    if (!allowTts) {
      const ep = endpointFor(studio, lang0);
      const err = new Error(`${calls.length} TTS call(s) needed (${ep.model} @ ${ep.base_url}). Ask the user, then re-run with --allow-tts.`);
      err.code = 3;
      throw err;
    }
    studio.services = { ...(studio.services ?? {}), tts: true };
  }

  for (const j of jobs) {
    const r = await synthLine(cacheDir, j.text, j.v, { trim: a.trim !== false });
    Object.assign(j, { file: r.file, duration: r3(r.duration), cached: r.cached });
    log(`${r.cached ? "· cached" : "✓ tts   "} ${j.line.id} (${j.v.model}/${j.v.voice}) ${j.duration}s`);
  }

  // Speaking rate of each language's voice, from every sentence it read (per-line voice overrides left out).
  const rates = [];
  for (const lang of new Set(jobs.map((j) => j.lang))) {
    const main = voiceFor(project, {}, lang);
    const mine = jobs.filter((j) => j.lang === lang && j.v.voice === main.voice);
    const wps = measureRate(mine.map((j) => ({ text: j.text, seconds: j.duration })));
    if (recordRate(studio, lang, main.voice, main.speed, wps)) rates.push({ lang, voice: main.voice, wps });
  }

  // Timeline: lines back to back inside each scene; scenes stretch to fit their VO.
  let t = 0;
  const cues = [];
  const placed = [];
  const manifestScenes = [];
  const changed = [];
  for (const s of scenes) {
    const mine = jobs.filter((j) => j.scene === s);
    let local = mine.length ? leadIn : 0;
    const lines = mine.map((j, i) => {
      const start = local;
      local += j.duration + (i < mine.length - 1 ? j.line.pause_after ?? pause : 0);
      return { id: j.line.id, start: r3(start), duration: j.duration, file: j.file, text: j.line.text };
    });
    const voEnd = mine.length ? local + pad : 0;
    const fit = r3(Math.max(s.duration, voEnd));
    let state = studio.scenes.find((x) => x.id === s.id);
    if (!state) studio.scenes.push((state = { id: s.id, hash: null, approved_hash: null, clip: null, duration: null, status: "planned" }));
    const before = sceneSourceExists(project, s) ? sceneHash(project, s) : null;
    state.fit_duration = fit > s.duration ? fit : null;
    const lengthChanged = setSceneDuration(project, s, fit);
    const timingChanged = writeLineTimes(project, s, lines);
    if (lengthChanged || timingChanged || (sceneEngine(s, studio) !== "hyperframes" && before)) {
      const after = sceneHash(project, s);
      if (after !== before) {
        // Only the length / VO reveal timings changed: the user's keyframe approval still holds.
        if (before && state.approved_hash === before) state.approved_hash = after;
        changed.push(s.id);
      }
    }
    for (const l of lines) {
      cues.push({ start: t + l.start, end: t + l.start + l.duration, text: l.text });
      placed.push({ file: l.file, at: t + l.start });
    }
    manifestScenes.push({ id: s.id, start: r3(t), duration: fit, vo: r3(Math.max(0, voEnd - pad)), lines: lines.map(({ file, ...rest }) => ({ ...rest, file: file.slice(project.root.length + 1) })) });
    t += fit;
  }
  const total = r3(t);

  // VO track: every sentence delayed to its absolute start, summed, padded to the full length.
  // The pad is bounded (whole_dur) and the output capped (-t): an open-ended apad followed by atrim
  // sometimes never reaches EOF on FFmpeg 8 and the process spins forever.
  const vo = join(project.root, "audio", "vo.wav");
  if (placed.length) {
    const inputs = placed.flatMap((p) => ["-i", p.file]);
    const graph = placed.map((p, i) => `[${i}:a]adelay=${Math.round(p.at * 1000)}:all=1[d${i}]`).join(";") +
      `;${placed.map((_, i) => `[d${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total},atrim=0:${total}[vo]`;
    mkdirSync(join(project.root, ".one-studio"), { recursive: true });
    const script = join(project.root, ".one-studio", "vo-graph.txt");
    writeFileSync(script, graph);
    run("ffmpeg", ["-nostdin", "-y", "-v", "error", ...inputs, "-filter_complex_script", script, "-map", "[vo]", "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le", "-t", String(total), vo]);
  }

  // The user may have chosen no captions at all (gate 0 / gate 7): then there is no .srt to keep in sync.
  const withCaptions = captionSetting(project) !== "none";
  const srtPath = join(project.root, "captions.srt");
  if (withCaptions) writeFileSync(srtPath, buildSrt(cues, { maxChars: project.brand?.captions?.max_chars ?? 42 }));
  else rmSync(srtPath, { force: true });
  // Save first: the manifest hash must match what status.mjs will compute.
  project.save();
  const manifest = {
    hash: audioHash(project),
    at: now(),
    duration: total,
    vo: placed.length ? "audio/vo.wav" : null,
    captions: withCaptions ? "captions.srt" : null,
    calls: jobs.filter((j) => !j.cached).length,
    scenes: manifestScenes,
  };
  writeFileSync(join(project.root, "audio", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (changed.length) buildIndex(project);
  // Line-anchored SFX cues follow the new timings in the studio preview too.
  if (existsSync(join(project.root, "assets", "os.js"))) writeAudioCues(project);
  return { project, jobs, manifest, changed, rates };
}

// --tighten: propose (or with apply, write) storyboard durations of VO + pad + scripted silence.
export async function tighten(dir, { pad, apply = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  const plan = tightenPlan(project, { pad });
  const changes = plan.rows.filter((r) => r.change);
  if (!apply || !changes.length) return { plan, applied: false };
  for (const s of project.storyboard.scenes) {
    const r = changes.find((x) => x.id === s.id);
    if (r) s.duration = r.proposed;
  }
  writeJson(project.storyboardPath, project.storyboard);
  // Every sentence is cached, so this only refits scene lengths and line timings (no TTS call).
  const rebuilt = await buildAudio(dir, { log });
  return { plan, applied: true, rebuilt };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2), { flags: ["allow-tts", "dry-run", "tighten", "apply", "help"], options: ["pad"] });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log("usage: build-audio.mjs <project-dir> [--allow-tts] [--dry-run]\n       build-audio.mjs <project-dir> --tighten [--pad 1.2] [--apply]");
    process.exit(dir ? 0 : 1);
  }
  if (args.tighten) {
    tighten(dir, { pad: args.pad == null ? undefined : Number(args.pad), apply: args.apply })
      .then((r) => {
        console.log(formatTighten(r.plan));
        if (!r.plan.rows.some((x) => x.change)) console.log("Nothing to tighten: every scene is within 0.3 s of its voice-over.");
        else if (!r.applied) console.log("Nothing written. Show this table to the user; on their OK run --tighten --apply (storyboard.json changes, so the storyboard gate re-opens).");
        else console.log(`✓ storyboard.json updated, scenes refitted (vo ${r.rebuilt.manifest.duration}s). The storyboard gate is re-opened: show the new durations and ask for approval again (status.mjs --approve storyboard).`);
      })
      .catch((err) => {
        console.error(err.message);
        process.exit(1);
      });
  } else buildAudio(dir, { allowTts: args["allow-tts"], dryRun: args["dry-run"], log: console.log })
    .then((r) => {
      if (args["dry-run"]) {
        console.log(`${r.jobs.length} sentence(s), ${r.calls.length} TTS call(s) needed, ${r.jobs.length - r.calls.length} cached`);
        return;
      }
      console.log(`✓ audio/vo.wav ${r.manifest.duration}s, ${r.manifest.captions ?? "no captions (captions: none)"}, ${r.manifest.calls} TTS call(s)`);
      if (r.changed.length) console.log(`  fitted to the VO (length / line timings): ${r.changed.join(", ")} (these re-render; approvals and gates 5–6 kept)`);
      for (const x of r.rates) console.log(`  speaking rate ${x.lang}/${x.voice}: ${x.wps} words/s (saved in studio.json; script-lint and --estimate use it)`);
      try {
        const plan = tightenPlan(r.project);
        if (plan.saved >= 2) console.log(`  ⚠ ${plan.rows.filter((x) => x.change).length} scene(s) run ${plan.saved}s longer than their voice-over: build-audio.mjs <dir> --tighten shows shorter durations (applying them re-opens the storyboard).`);
      } catch {
        // no manifest / hash mismatch: nothing to suggest
      }
    })
    .catch((err) => {
      console.error(err.cause ? `${err.message}: ${err.cause.code ?? err.cause.message}` : err.message);
      process.exit(err.code === 3 ? 3 : 1);
    });
}
