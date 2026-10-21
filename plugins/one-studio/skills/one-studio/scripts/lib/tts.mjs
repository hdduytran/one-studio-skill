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
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    let hint = "";
    // A wrong voice id is the usual first-run failure (init writes a placeholder): name the real ones.
    if (res.status >= 400 && res.status < 500) {
      const v = await listVoices(ep).catch(() => null);
      if (v?.voices.length && !v.voices.includes(ep.voice)) hint = `\n  voice "${ep.voice}" is not on this server. Available: ${v.voices.join(", ")}\n  Listen: tts-openai-compatible.mjs <dir> --samples all --allow-tts · set: --use-voice <id>`;
    }
    throw new Error(`TTS ${ep.model} @ ${ep.base_url}: HTTP ${res.status} ${body}${hint}`);
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "" };
}

// Voice ids a server offers. ZeroTTS: GET /v1/audio/voices; others use /v1/voices or /voices.
// Accepts ["id", …], [{ id | voice_id | name }], { voices: […] } or { data: […] }. No synthesis, no consent needed.
export async function listVoices(ep, { timeoutMs = 8000 } = {}) {
  const key = ep.key_env ? process.env[ep.key_env] : undefined;
  const tried = [];
  for (const path of ["/v1/audio/voices", "/v1/voices", "/voices"]) {
    const url = `${baseUrl(ep.base_url)}${path}`;
    try {
      const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        tried.push(`${path} HTTP ${res.status}`);
        continue;
      }
      const j = await res.json();
      const arr = Array.isArray(j) ? j : j.voices ?? j.data ?? (typeof j === "object" ? Object.keys(j) : []);
      const voices = arr.map((v) => (typeof v === "string" ? v : v?.id ?? v?.voice_id ?? v?.name)).filter(Boolean);
      return { url, voices: [...new Set(voices)] };
    } catch (err) {
      tried.push(`${path} ${err.cause?.code ?? err.name}`);
      if (err.cause?.code === "ECONNREFUSED") break;
    }
  }
  const e = new Error(`no voice list at ${ep.base_url} (${tried.join("; ")})`);
  e.tried = tried;
  throw e;
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
