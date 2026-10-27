// OpenAI-compatible speech-to-text client (POST {base_url}/v1/audio/transcriptions, multipart).
// Configured in studio.json → audio.stt.<lang> (or .default): { base_url, model, language?, key_env? }.
// Used only to screen the voice-over for misread words; the user's ear decides. Transcripts are cached by
// hash(wav + model + language) in audio/stt-cache/, so re-checking unchanged lines costs no call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./project.mjs";

export function sttEndpointFor(studio, lang) {
  const stt = studio.audio?.stt ?? {};
  const ep = stt[lang] ?? stt[lang?.split("-")[0]] ?? stt.default;
  if (!ep) throw new Error(`No speech-to-text endpoint for "${lang}" in studio.json → audio.stt (e.g. { "${lang?.split("-")[0] ?? "vi"}": { "base_url": "http://localhost:8001", "model": "…" } })`);
  return ep;
}

const baseUrl = (url) => url.replace(/\/+$/, "").replace(/\/v1$/, "");

export const sttCacheKey = (bytes, ep, language) => sha256(Buffer.concat([Buffer.from(JSON.stringify([ep.model, language ?? null])), bytes])).slice(0, 16);

export const sttCached = (cacheDir, file, ep, language) => existsSync(join(cacheDir, `${sttCacheKey(readFileSync(file), ep, language)}.json`));

export async function transcribe(ep, bytes, { language, timeoutMs = 120000 } = {}) {
  const key = ep.key_env ? process.env[ep.key_env] : undefined;
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "line.wav");
  form.append("model", ep.model);
  if (language) form.append("language", language);
  form.append("response_format", "json");
  const res = await fetch(`${baseUrl(ep.base_url)}/v1/audio/transcriptions`, {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`STT ${ep.model} @ ${ep.base_url}: HTTP ${res.status} ${body.slice(0, 300)}`);
  try {
    const j = JSON.parse(body);
    return String(j.text ?? "").trim();
  } catch {
    return body.trim();
  }
}

// Transcript of one wav, from the cache when the same audio was already transcribed by the same model.
export async function transcribeFile(cacheDir, file, ep, { language } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const bytes = readFileSync(file);
  const cache = join(cacheDir, `${sttCacheKey(bytes, ep, language)}.json`);
  if (existsSync(cache)) return { text: JSON.parse(readFileSync(cache, "utf8")).text, cached: true };
  const text = await transcribe(ep, bytes, { language });
  writeFileSync(cache, JSON.stringify({ model: ep.model, language: language ?? null, text }) + "\n");
  return { text, cached: false };
}
