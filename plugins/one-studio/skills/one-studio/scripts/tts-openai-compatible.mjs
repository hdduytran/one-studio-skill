#!/usr/bin/env node
// Talk to an OpenAI-compatible TTS server directly.
//   node tts-openai-compatible.mjs --probe <project-dir> [--lang vi]      check the configured endpoint (1 call)
//   node tts-openai-compatible.mjs --probe-url <base_url> --model zerotts --voice <id> [--text "…"]
//   node tts-openai-compatible.mjs --voices <project-dir> [--lang vi]     list the server's voices (no synthesis)
//   node tts-openai-compatible.mjs <project-dir> --samples <ids|all> [--text "…"] --allow-tts
//        one sample per voice → review/voices/<id>.wav, so the user picks by ear (audio-picker.mjs)
//   node tts-openai-compatible.mjs <project-dir> --use-voice <id> [--lang vi]   record the pick in studio.json
//   node tts-openai-compatible.mjs --say "text" --out file.wav <project-dir> [--lang vi] [--voice id]
// API key: env named in studio.json → audio.tts.<lang>.key_env (ONE_STUDIO_TTS_KEY_VI / ONE_STUDIO_TTS_KEY).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { isMain, loadProject, parseArgs, writeJson } from "./lib/project.mjs";
import { probe } from "./lib/ffmpeg.mjs";
import { endpointFor, listVoices, probeEndpoint, speech, toWav } from "./lib/tts.mjs";
import { measureRate, recordRate, ttsKey } from "./lib/speech-rate.mjs";

const SAMPLE_TEXT = { vi: "Xin chào, đây là giọng đọc thử cho video của bạn.", en: "Hello, this is a sample voice for your video." };

export async function voiceSamples(dir, { ids = "all", text, lang, allowTts = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  lang ??= project.studio.meta.language;
  const ep = endpointFor(project.studio, lang);
  let wanted = ids === "all" ? null : ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (!wanted) wanted = (await listVoices(ep)).voices;
  if (!wanted.length) throw new Error("the server lists no voices; pass --samples <id,id>");
  if (!project.studio.services?.tts && !allowTts) {
    const err = new Error(`${wanted.length} TTS call(s) for voice samples (${ep.model} @ ${ep.base_url}). Ask the user, then re-run with --allow-tts.`);
    err.code = 3;
    throw err;
  }
  const say = text ?? SAMPLE_TEXT[lang.split("-")[0]] ?? SAMPLE_TEXT.en;
  const outDir = join(project.root, "review", "voices");
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "tts-samples-"));
  const out = [];
  try {
    for (const voice of wanted) {
      const { bytes } = await speech({ ...ep, voice }, say);
      writeFileSync(join(tmp, "raw"), bytes);
      const file = join(outDir, `${voice.replace(/[^\w.-]+/g, "_")}.wav`);
      toWav(join(tmp, "raw"), file);
      const seconds = Math.round(probe(file).duration * 100) / 100;
      // A first rough speaking rate per voice; the first build-audio replaces it with the real sentences.
      const wps = measureRate([{ text: say, seconds }], { minSeconds: 1 });
      recordRate(project.studio, lang, voice, ep.speed ?? 1, wps, { keepExisting: true });
      out.push({ voice, file: relative(project.root, file), seconds, wps });
      log(`✓ ${voice}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  project.save();
  return out;
}

export function useVoice(dir, voice, { lang } = {}) {
  const project = loadProject(dir);
  lang ??= project.studio.meta.language;
  const key = ttsKey(project.studio, lang);
  if (!project.studio.audio?.tts?.[key]) throw new Error(`No TTS endpoint for "${lang}" in studio.json → audio.tts`);
  project.studio.audio.tts[key].voice = voice;
  project.save();
  // A brand voice preset wins over the endpoint voice, so keep it in step (series share it: say so).
  const notes = [];
  const preset = project.brand?.voice?.[lang] ?? project.brand?.voice?.default ?? null;
  if (preset && preset.voice !== voice) {
    preset.voice = voice;
    writeJson(project.brandPath, project.brand);
    notes.push(`brand voice preset updated too (${project.brandPath})${project.studio.meta.series ? ": every later episode of the series uses it" : ""}`);
  }
  return { key, voice, notes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["probe", "voices", "allow-tts", "help"],
    options: ["probe-url", "model", "voice", "text", "lang", "say", "out", "key-env", "samples", "use-voice"],
  });
  const modes = ["probe", "probe-url", "say", "voices", "samples", "use-voice"];
  if (args.help || !modes.some((m) => args[m])) {
    console.log(`usage: tts-openai-compatible.mjs --probe <project-dir> [--lang vi]
       tts-openai-compatible.mjs --probe-url <url> --model m --voice v [--text "…"]
       tts-openai-compatible.mjs --voices <project-dir> [--lang vi]          (or --probe-url <url> --voices)
       tts-openai-compatible.mjs <project-dir> --samples <ids|all> [--text "…"] [--allow-tts]
       tts-openai-compatible.mjs <project-dir> --use-voice <id> [--lang vi]
       tts-openai-compatible.mjs --say "…" --out f.wav <project-dir> [--voice id]`);
    process.exit(args.help ? 0 : 1);
  }
  if (args["use-voice"]) {
    const r = useVoice(args._[0] ?? ".", args["use-voice"], { lang: args.lang });
    console.log(`✓ studio.json → audio.tts.${r.key}.voice = ${r.voice}`);
    for (const n of r.notes) console.log(`  ${n}`);
    return;
  }
  if (args.samples) {
    const r = await voiceSamples(args._[0] ?? ".", { ids: args.samples, text: args.text, lang: args.lang, allowTts: args["allow-tts"], log: console.log });
    for (const x of r) console.log(`  ${x.voice.padEnd(16)} ${x.file} (${x.seconds}s${x.wps ? `, ~${x.wps} words/s` : ""})`);
    console.log("Next: audio-picker.mjs <dir> → review/audio-picker.html; ask which voice, then --use-voice <id>.");
    return;
  }
  let ep;
  if (args["probe-url"]) ep = { base_url: args["probe-url"], model: args.model ?? "tts-1", voice: args.voice ?? "default", format: "wav", key_env: args["key-env"] };
  else {
    const project = loadProject(args._[0] ?? ".");
    const lang = args.lang ?? project.studio.meta.language;
    ep = { ...endpointFor(project.studio, lang), ...(args.voice && { voice: args.voice }) };
  }
  if (args.voices) {
    const v = await listVoices(ep);
    console.log(`${v.voices.length} voice(s) at ${v.url}${v.voices.includes(ep.voice) ? "" : ` — configured voice "${ep.voice}" is NOT one of them`}`);
    for (const id of v.voices) console.log(`  ${id === ep.voice ? "→" : " "} ${id}`);
    return;
  }

  if (args.say) {
    const { bytes } = await speech(ep, args.say);
    const tmp = mkdtempSync(join(tmpdir(), "tts-"));
    writeFileSync(join(tmp, "raw"), bytes);
    toWav(join(tmp, "raw"), args.out ?? "speech.wav");
    rmSync(tmp, { recursive: true, force: true });
    console.log(`✓ ${args.out ?? "speech.wav"} (${probe(args.out ?? "speech.wav").duration.toFixed(2)}s)`);
    return;
  }

  const { out, bytes } = await probeEndpoint(ep, args.text);
  const tmp = mkdtempSync(join(tmpdir(), "tts-probe-"));
  const raw = join(tmp, "raw");
  writeFileSync(raw, bytes);
  const p = probe(raw);
  rmSync(tmp, { recursive: true, force: true });
  Object.assign(out, { codec: p.audio?.codec, sample_rate: p.audio?.sample_rate, channels: p.audio?.channels, duration_s: Math.round(p.duration * 100) / 100 });
  console.log(JSON.stringify(out, null, 2));
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err.cause ? `${err.message}: ${err.cause.code ?? err.cause.message}` : err.message);
    process.exit(err.code === 3 ? 3 : 1);
  });
}
