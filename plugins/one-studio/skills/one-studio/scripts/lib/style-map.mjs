// Metrics -> draft style card. Every table here is documented in skills/style-extract/references/mapping.md;
// keep the two in step. Pure and deterministic: the same metrics.json gives the same draft.
import { BUILTIN_BEDS, PRESETS } from "./music.mjs";
import { assignColorRoles } from "./style-color-roles.mjs";

// ASL (average shot length, s) -> motion durations (s). Lower bound inclusive, first match wins.
export const ASL_MOTION = [
  { below: 1.2, duration: { fast: 0.15, base: 0.3, slow: 0.6 } },
  { below: 3.01, duration: { fast: 0.25, base: 0.5, slow: 1.0 } },
  { below: Infinity, duration: { fast: 0.4, base: 0.8, slow: 1.6 } },
];
// With fewer than 2 shots ASL says nothing (animated in place), so the motion class decides.
export const CLASS_MOTION = { kinetic: ASL_MOTION[0].duration, drift: ASL_MOTION[1].duration, static: ASL_MOTION[2].duration };
export const EASE_BY_PROFILE = {
  "front-loaded": { in: "power2.in", out: "expo.out", inOut: "power3.inOut" },
  even: { in: "sine.in", out: "sine.out", inOut: "sine.inOut" },
  "back-loaded": { in: "power3.in", out: "power2.out", inOut: "power2.inOut" },
};
export const STAGGER_BY_CLASS = { static: 0.12, drift: 0.08, kinetic: 0.04 };
// cuts per minute -> sfx density. Lower bound inclusive.
export const SFX_BY_CUT_RATE = [
  { below: 3, density: "none" },
  { below: 12, density: "low" },
  { below: 30, density: "medium" },
  { below: Infinity, density: "high" },
];
export const SHORT_VERTICAL_MAX_SECONDS = 90;
export const FALLBACK_SHOT_SECONDS = 4;

const pick = (table, value) => table.find((r) => value < r.below);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const round = (n, d = 2) => +n.toFixed(d);

// Nearest built-in bed (name from music.mjs BUILTIN_BEDS) from energy and brightness.
// energy 0-4 = motion class (0-2) + cut rate tier (0-2); lofi (100 bpm) from 2, ambient below.
export function pickBed({ motionClass, cutsPerMin, lumaMean }) {
  const energy = ({ static: 0, drift: 1, kinetic: 2 }[motionClass] ?? 1) + (cutsPerMin < 6 ? 0 : cutsPerMin < 20 ? 1 : 2);
  const bright = lumaMean >= 0.6;
  const dark = lumaMean < 0.35;
  const name = energy >= 2 ? (dark ? "lofi-dark" : "lofi") : bright ? "ambient-bright" : "ambient";
  const bed = BUILTIN_BEDS[name];
  return { name, music: { preset: bed.preset, mood: bed.mood, bpm: PRESETS[bed.preset].bpm } };
}

// metrics.json (+ optional info.json) -> a style card that passes styleErrors. Fields that need eyes are absent:
// see EXPECTED_FIELDS and remainingFields().
export function buildDraft(metrics, info = {}, { slug }) {
  const provenance = {};
  const prov = (path, source, note) => (provenance[path] = note ? { source, note } : { source });
  // Provenance is kept per leaf: an object field two levels deep (transitions, music) is accounted for key by key.
  const provKeys = (path, obj, source, note) => Object.keys(obj).forEach((k) => prov(`${path}.${k}`, source, note));
  const { pacing, motion, audio, speech, format } = metrics;
  const multiShot = pacing.shots.length >= 2;

  const reference = { file: info.file ?? metrics.source?.file ?? "source.mp4", accessed: info.accessed ?? metrics.generated_at, range: info.range ?? { from: 0, to: format.duration } };
  for (const k of ["url", "title", "channel"]) if (info[k]) reference[k] = info[k];

  // Colour
  const roles = assignColorRoles(metrics.color?.palette);
  for (const [role, s] of Object.entries(roles.sources)) prov(`brand.colors.${role}`, s.source, s.note);
  const brand = { colors: roles.colors };

  // Motion: ASL picks durations, profile the easing, class the stagger.
  const lowAsl = pacing.asl_confidence === "low" ? "low-confidence ASL (cuts near the threshold)" : undefined;
  brand.motion = { ease: EASE_BY_PROFILE[motion.profile] ?? EASE_BY_PROFILE.even, stagger: STAGGER_BY_CLASS[motion.class] ?? STAGGER_BY_CLASS.drift };
  prov("brand.motion.ease", "measured", `motion profile ${motion.profile}`);
  prov("brand.motion.stagger", "measured", `motion class ${motion.class}`);
  if (multiShot) {
    brand.motion.duration = pick(ASL_MOTION, pacing.asl).duration;
    prov("brand.motion.duration", "measured", lowAsl ?? `ASL ${pacing.asl}s`);
  } else {
    brand.motion.duration = CLASS_MOTION[motion.class] ?? CLASS_MOTION.drift;
    prov("brand.motion.duration", "guessed", "no cuts found (one long shot): durations come from the motion class, check by eye");
  }

  // Transitions
  const fadeLens = pacing.fades.map((f) => f.end - f.start).filter((d) => d > 0);
  if (pacing.fades.length) {
    brand.transitions = { default: "fade" };
    if (fadeLens.length) brand.transitions.duration = round(median(fadeLens));
    provKeys("brand.transitions", brand.transitions, "measured", `${pacing.fades.length} fade(s) found; refine the kind from the cuts sheet`);
  } else if (multiShot) {
    brand.transitions = { default: "cut" };
    provKeys("brand.transitions", brand.transitions, "measured", "hard cuts, no fades");
  } else {
    brand.transitions = { default: "fade" };
    provKeys("brand.transitions", brand.transitions, "guessed", "one long shot: probably crossfades or in-place animation; check the frames sheet");
  }

  // Storyboard
  const storyboard = {};
  const shotLens = pacing.shots.map((s) => s.end - s.start);
  storyboard.target_shot_seconds = multiShot ? round(median(shotLens)) : FALLBACK_SHOT_SECONDS;
  prov("storyboard.target_shot_seconds", multiShot ? "measured" : "guessed", multiShot ? (lowAsl ?? "median shot length") : "no cuts found: default shot length");
  const cutRate = pacing.cuts_per_min ?? 0;
  storyboard.sfx_density = audio.has_audio ? pick(SFX_BY_CUT_RATE, cutRate).density : "none";
  prov("storyboard.sfx_density", "measured", audio.has_audio ? `${cutRate} cuts/min` : "reference has no audio track");

  // Audio
  const outAudio = {};
  if (audio.lufs !== null && audio.lufs !== undefined) {
    outAudio.lufs = Math.min(0, audio.lufs);
    prov("audio.lufs", "measured");
  }
  outAudio.silence_ratio = audio.silence_ratio;
  prov("audio.silence_ratio", "measured");
  outAudio.has_voice = Boolean(speech.has_voice);
  prov("audio.has_voice", "measured", speech.has_voice_source === "subs" ? "from subtitles" : "heuristic from loudness range and silence");
  const bed = pickBed({ motionClass: motion.class, cutsPerMin: cutRate, lumaMean: metrics.tone?.luma_mean ?? 0.5 });
  outAudio.music = bed.music;
  provKeys("audio.music", bed.music, "measured", `nearest built-in bed "${bed.name}" by energy and brightness; the reference track is never reused`);

  // Writing
  const writing = {};
  if (speech.words_per_minute > 0) {
    writing.words_per_minute = speech.words_per_minute;
    prov("writing.words_per_minute", "measured", speech.has_voice_source === "subs" ? "from subtitles" : undefined);
  }
  if (format.aspect === "9:16" && format.duration < SHORT_VERTICAL_MAX_SECONDS) {
    writing.format = "short-vertical";
    prov("writing.format", "measured", "9:16 and under 90 s");
  }

  const style = { version: 1, slug, reference, brand, storyboard, audio: outAudio, provenance, do_not_copy: [] };
  if (Object.keys(writing).length) style.writing = writing;
  return { style, notes: roles.notes };
}

// Paths a person must still look at, with where to find the answer. A path is "open" when the card lacks it
// or its provenance is `guessed`.
export const EXPECTED_FIELDS = [
  ["brand.colors.bg", "palette"], ["brand.colors.fg", "palette"], ["brand.colors.primary", "palette"],
  ["brand.colors.secondary", "palette"], ["brand.colors.accent", "palette"], ["brand.colors.muted", "palette"],
  ["brand.surface", "frames: flat or glass"],
  ["brand.typography.heading", "frames + references/font-map.md"], ["brand.typography.body", "frames + references/font-map.md"],
  ["brand.captions.position", "frames sheet"], ["brand.captions.size", "frames sheet"], ["brand.captions.background", "frames sheet"],
  ["storyboard.visual_modes", "writers-room/visual-modes/index.md"], ["storyboard.camera", "frames + motion class"],
  ["writing.tone", "writers-room/tones.md + hook text"], ["writing.hook", "hook text + first frames"],
  ["writing.format", "references/mapping.md"], ["writing.words_per_minute", "no subtitles: leave out if there is no voice"],
];
const has = (obj, dotted) => dotted.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj) !== undefined;

// -> [{path, state: "missing"|"guessed", hint, note?}] sorted as EXPECTED_FIELDS, then other guessed paths.
export function remainingFields(style) {
  const out = [];
  for (const [path, hint] of EXPECTED_FIELDS) {
    const p = style.provenance?.[path];
    if (!has(style, path)) out.push({ path, state: "missing", hint });
    else if (p?.source === "guessed") out.push({ path, state: "guessed", hint, note: p.note });
  }
  const listed = new Set(out.map((o) => o.path));
  for (const [path, p] of Object.entries(style.provenance ?? {})) {
    if (p.source === "guessed" && !listed.has(path)) out.push({ path, state: "guessed", hint: "look at the frames", note: p.note });
  }
  return out;
}
