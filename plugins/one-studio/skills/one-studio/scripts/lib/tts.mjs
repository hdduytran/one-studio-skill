// OpenAI-compatible text-to-speech client (POST {base_url}/v1/audio/speech).
// vi → ZeroTTS, other languages → OmniVoice (configured in studio.json → audio.tts).
// Every sentence is cached by hash(text + model + voice + speed) so editing one sentence
// re-generates only that sentence.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./project.mjs";
import { duration, run } from "./ffmpeg.mjs";

export const SAMPLE_RATE = 48000;

export function endpointFor(studio, lang) {
  const tts = studio.audio?.tts ?? {};
  const ep = tts[lang] ?? tts[lang?.split("-")[0]] ?? tts.default;
  if (!ep) throw new Error(`No TTS endpoint for language "${lang}" in studio.json → audio.tts`);
  return ep;
}

export function voiceFor(project, line, lang) {
  const ep = endpointFor(project.studio, lang);
  const preset = project.brand?.voice?.[lang] ?? project.brand?.voice?.default;
  return {
    ...ep,
    voice: line.voice ?? preset?.voice ?? ep.voice,
    speed: preset?.speed ?? ep.speed ?? 1,
  };
}

export const cacheKey = (text, v) => sha256(JSON.stringify([text, v.model, v.voice, v.speed ?? 1])).slice(0, 16);

const baseUrl = (url) => url.replace(/\/+$/, "").replace(/\/v1$/, "");

export async function speech(ep, text, { timeoutMs = 120000 } = {}) {
  const key = ep.key_env ? process.env[ep.key_env] : undefined;
  const res = await fetch(`${baseUrl(ep.base_url)}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) },
    body: JSON.stringify({ model: ep.model, input: text, voice: ep.voice, response_format: ep.format ?? "wav", speed: ep.speed ?? 1 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`TTS ${ep.model} @ ${ep.base_url}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "" };
}

// Raw TTS bytes → mono 48 kHz PCM WAV, leading/trailing silence trimmed (if enabled).
export function toWav(src, dest, { trim = true } = {}) {
  const trimF = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse";
  run("ffmpeg", ["-y", "-v", "error", "-i", src, "-ac", "1", "-ar", String(SAMPLE_RATE), ...(trim ? ["-af", trimF] : []), "-c:a", "pcm_s16le", dest]);
  return dest;
}

// Generate (or reuse) one sentence. Returns { file, duration, cached }.
export async function synthLine(cacheDir, text, v, { trim = true } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const key = cacheKey(text, v);
  const file = join(cacheDir, `${key}.wav`);
  if (existsSync(file)) return { file, key, duration: duration(file), cached: true };
  const { bytes } = await speech(v, text);
  const raw = join(cacheDir, `${key}.raw`);
  writeFileSync(raw, bytes);
  try {
    toWav(raw, `${file}.part.wav`, { trim });
    renameSync(`${file}.part.wav`, file);
  } finally {
    rmSync(raw, { force: true });
  }
  return { file, key, duration: duration(file), cached: false };
}

// One-call health check for the user's local servers.
export async function probeEndpoint(ep, text = "Xin chào, đây là thử nghiệm giọng đọc.") {
  const out = { base_url: ep.base_url, model: ep.model, voice: ep.voice };
  try {
    const r = await fetch(`${baseUrl(ep.base_url)}/v1/models`, { signal: AbortSignal.timeout(10000) });
    out.models = r.ok ? ((await r.json()).data ?? []).map((m) => m.id) : `HTTP ${r.status}`;
  } catch (err) {
    out.models = `unreachable: ${err.cause?.code ?? err.message}`;
  }
  const t0 = Date.now();
  const { bytes, contentType } = await speech(ep, text);
  out.latency_ms = Date.now() - t0;
  out.content_type = contentType;
  out.bytes = bytes.length;
  return { out, bytes };
}
