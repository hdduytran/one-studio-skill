// Speaking rate used to plan script length and scene durations.
// The planning defaults (vi 2.8, en 2.5 words/s) are replaced by what the chosen voice really does:
// studio.json → audio.tts.<lang>.words_per_second = { "<voice>": 4.5, "<voice>@1.2": 5.1 } (key has @speed
// when speed ≠ 1). build-audio writes it from the real sentences; voice samples fill it when nothing better exists.
import { endpointFor, voiceFor } from "./tts.mjs";

export const DEFAULT_WPS = { vi: 2.8, en: 2.5 };
// Below this much speech a measurement is too noisy to replace the default.
const MIN_SECONDS = 3;

export const wordCount = (s) => String(s ?? "").split(/\s+/).filter(Boolean).length;
const round2 = (n) => Math.round(n * 100) / 100;

// Key of studio.audio.tts that serves `lang` (same lookup as endpointFor).
export function ttsKey(studio, lang) {
  const tts = studio.audio?.tts ?? {};
  return tts[lang] ? lang : tts[lang?.split("-")[0]] ? lang.split("-")[0] : "default";
}

export const rateKey = (voice, speed = 1) => (Number(speed ?? 1) === 1 ? voice : `${voice}@${speed}`);

// -> { wps, source: "measured" | "default", voice } for the voice the project would use for `lang`.
export function speechRate(project, lang = project.studio.meta?.language ?? "vi") {
  const base = DEFAULT_WPS[lang?.split("-")[0]] ?? DEFAULT_WPS.en;
  let v;
  try {
    endpointFor(project.studio, lang);
    v = voiceFor(project, {}, lang);
  } catch {
    return { wps: base, source: "default", voice: null };
  }
  const measured = project.studio.audio?.tts?.[ttsKey(project.studio, lang)]?.words_per_second?.[rateKey(v.voice, v.speed)];
  return measured > 0 ? { wps: measured, source: "measured", voice: v.voice } : { wps: base, source: "default", voice: v.voice };
}

export const formatRate = (r) => `${r.wps} words/s (${r.source === "measured" ? `measured for ${r.voice}` : "planning default"})`;

// samples: [{ text, seconds }] spoken by one voice -> words per second, or null when there is too little speech.
export function measureRate(samples, { minSeconds = MIN_SECONDS } = {}) {
  const seconds = samples.reduce((n, s) => n + s.seconds, 0);
  const words = samples.reduce((n, s) => n + wordCount(s.text), 0);
  return seconds >= minSeconds && words ? round2(words / seconds) : null;
}

// Store a measured rate on the studio object (the caller saves). keepExisting: only fill a missing value.
export function recordRate(studio, lang, voice, speed, wps, { keepExisting = false } = {}) {
  if (!(wps > 0)) return false;
  const ep = studio.audio?.tts?.[ttsKey(studio, lang)];
  if (!ep) return false;
  const key = rateKey(voice, speed);
  ep.words_per_second ??= {};
  if (keepExisting && ep.words_per_second[key] > 0) return false;
  if (ep.words_per_second[key] === wps) return false;
  ep.words_per_second[key] = wps;
  return true;
}
