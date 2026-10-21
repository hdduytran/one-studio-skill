#!/usr/bin/env node
// Talk to an OpenAI-compatible TTS server directly.
//   node tts-openai-compatible.mjs --probe <project-dir> [--lang vi]      check the configured endpoint
//   node tts-openai-compatible.mjs --probe-url <base_url> --model zerotts --voice <id> [--text "…"]
//   node tts-openai-compatible.mjs --say "text" --out file.wav <project-dir> [--lang vi] [--voice id]
// API key: env named in studio.json → audio.tts.<lang>.key_env (ONE_STUDIO_TTS_KEY_VI / ONE_STUDIO_TTS_KEY).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { probe } from "./lib/ffmpeg.mjs";
import { endpointFor, probeEndpoint, speech, toWav } from "./lib/tts.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["probe", "help"],
    options: ["probe-url", "model", "voice", "text", "lang", "say", "out", "key-env"],
  });
  if (args.help || (!args.probe && !args["probe-url"] && !args.say)) {
    console.log("usage: tts-openai-compatible.mjs --probe <project-dir> [--lang vi] | --probe-url <url> --model m --voice v | --say \"…\" --out f.wav <project-dir>");
    process.exit(args.help ? 0 : 1);
  }
  let ep;
  if (args["probe-url"]) ep = { base_url: args["probe-url"], model: args.model ?? "tts-1", voice: args.voice ?? "default", format: "wav", key_env: args["key-env"] };
  else {
    const project = loadProject(args._[0] ?? ".");
    const lang = args.lang ?? project.studio.meta.language;
    ep = { ...endpointFor(project.studio, lang), ...(args.voice && { voice: args.voice }) };
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
    process.exit(1);
  });
}
