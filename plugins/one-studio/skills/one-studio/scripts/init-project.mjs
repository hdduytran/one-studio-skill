#!/usr/bin/env node
// Create a one-studio project (gate 0 output).
//   node init-project.mjs <dir> [--title "…"] [--lang vi] [--dimension 2d|3d|mixed]
//        [--aspect 16:9|9:16|1:1|4:5] [--fps 30] [--duration 45]
//        [--series <name>] [--series-root <dir>]   (default series root: <dir>/../series)
//        [--preset <brand preset: plugin or <library>/presets/>] [--captions none|sidecar|mux|burn] [--exports 16:9,9:16]
//        [--platform shorts,tiktok,reels,youtube,facebook,linkedin]
//        [--tts-url <base_url>] [--voice <id>] [--probe-tts]
// With --series, the brand kit lives at <series-root>/<name>/brand/brand.json and is reused
// as-is when it already exists (no brand questions for later episodes).
// --probe-tts lists the TTS server's voices (GET only, no synthesis) so the user can pick one;
// burned captions need FFmpeg with libass: without it the caption mode falls back to mux.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { ASPECTS, ENGINE_VERSIONS, TEMPLATE_DIR, now, parseArgs, readJson, writeJson } from "./lib/project.mjs";
import { CAPTION_MODES } from "./lib/captions.mjs";
import { RATIO_STAGE_VERSION } from "./lib/hash.mjs";
import { hasDrawtext, hasLibass } from "./lib/ffmpeg.mjs";
import { PRESET_NAMES, applyPreset } from "./lib/presets.mjs";
import { PLATFORMS, missingRatios, parsePlatforms, platformWarnings } from "./lib/platforms.mjs";
import { listVoices } from "./lib/tts.mjs";

const usage = (from) => `usage: init-project.mjs <dir> [--title "…"] [--lang vi] [--dimension 2d|3d|mixed]
       [--aspect 16:9|9:16|1:1|4:5] [--fps 30] [--duration 45] [--series <name>] [--series-root <dir>]
       [--preset ${PRESET_NAMES({ from }).join("|")}] [--captions ${CAPTION_MODES.join("|")}] [--exports 16:9,9:16]
       [--platform ${Object.keys(PLATFORMS).join(",")}]  (shorts/tiktok/reels add a 9:16 export)
       [--tts-url <base_url>] [--voice <id>] [--probe-tts]`;

const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

function slug(text) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "video"
  );
}

function defaultTts(lang) {
  // vi → ZeroTTS, everything else → OmniVoice. Both speak OpenAI-compatible /v1/audio/speech.
  // URLs and voices are placeholders confirmed with the user at gate 0; keys come from env only.
  // The project's own language comes first so it is the entry readers see.
  const omnivoice = { base_url: "http://localhost:8001", model: "omnivoice", voice: "default", format: "wav", key_env: "ONE_STUDIO_TTS_KEY" };
  if (lang !== "vi") return { default: omnivoice };
  return {
    vi: { base_url: "http://localhost:8000", model: "zerotts", voice: "default", format: "wav", key_env: "ONE_STUDIO_TTS_KEY_VI" },
    default: omnivoice,
  };
}

// A fresh brand kit from the template, optionally starting from a preset.
function writeNewBrand(brandPath, name, preset, from) {
  mkdirSync(dirname(brandPath), { recursive: true });
  let brand = JSON.parse(fill(readFileSync(join(TEMPLATE_DIR, "brand.json"), "utf8"), { name }));
  if (preset) brand = applyPreset(brand, preset, { from });
  writeJson(brandPath, brand);
}

function ensureBrand(root, name, args) {
  if (!args.series) {
    const brandPath = join(root, "brand", "brand.json");
    writeNewBrand(brandPath, name, args.preset, root);
    return { brandPath, reused: false, series: null };
  }
  const series = slug(args.series);
  const seriesRoot = resolve(args["series-root"] ?? join(dirname(root), "series"));
  const seriesDir = join(seriesRoot, series);
  const brandPath = join(seriesDir, "brand", "brand.json");
  const reused = existsSync(brandPath);
  if (!reused) writeNewBrand(brandPath, series, args.preset, root);
  const seriesFile = join(seriesDir, "series.json");
  const info = existsSync(seriesFile) ? readJson(seriesFile) : { name: series, brand: "brand/brand.json", episodes: [] };
  const projectRel = relative(seriesDir, root);
  if (!info.episodes.some((e) => e.path === projectRel)) {
    info.episodes.push({ name, path: projectRel, episode: info.episodes.length + 1, created: now() });
  }
  writeJson(seriesFile, info);
  const episode = info.episodes.find((e) => e.path === projectRel).episode;
  // Settings of the latest earlier episode (voice endpoints, consent, format) are inherited.
  const prev = info.episodes.filter((e) => e.path !== projectRel && existsSync(join(seriesDir, e.path, "studio.json"))).pop();
  const previous = prev ? readJson(join(seriesDir, prev.path, "studio.json")) : null;
  return { brandPath, reused, series, episode, previous, previousName: prev?.name };
}

// Series intro/outro: brand.intro / brand.outro { enabled, template, duration } where template is a
// scene HTML file next to brand.json (saved with series-bumper.mjs). Copied into each new episode.
function seriesBumpers(root, brand, { title, language, format, episode }) {
  const b = existsSync(brand.brandPath) ? readJson(brand.brandPath) : {};
  const out = [];
  for (const kind of ["intro", "outro"]) {
    const cfg = b[kind];
    if (!cfg?.enabled || !cfg.template) continue;
    const src = resolve(dirname(brand.brandPath), cfg.template);
    if (!existsSync(src)) continue;
    const dur = cfg.duration ?? 3;
    const vars = { id: kind, duration: dur, width: format.width, height: format.height, lang: language, title, episode: episode ?? "" };
    writeFileSync(join(root, "scenes", `${kind}.html`), fill(readFileSync(src, "utf8"), vars));
    out.push({ id: kind, title: kind === "intro" ? "Intro" : "Outro", type: "text", duration: dur, notes: `Series ${kind} from the brand kit; edit the template with series-bumper.mjs, not here.` });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["help", "probe-tts"],
    options: ["title", "lang", "dimension", "aspect", "fps", "duration", "series", "series-root", "preset", "captions", "exports", "tts-url", "voice", "platform"],
  });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log(usage(dir ? resolve(dir) : process.cwd()));
    process.exit(dir ? 0 : 1);
  }
  const root = resolve(dir);
  if (existsSync(join(root, "studio.json"))) {
    console.error(`${root} is already a one-studio project. Run: node status.mjs "${root}"`);
    process.exit(1);
  }

  if (args.aspect && !ASPECTS[args.aspect]) throw new Error(`--aspect must be one of ${Object.keys(ASPECTS).join(", ")}`);
  if (args.dimension && !["2d", "3d", "mixed"].includes(args.dimension)) throw new Error("--dimension must be 2d, 3d or mixed");
  if (args.fps && !(Number.isInteger(Number(args.fps)) && args.fps >= 1 && args.fps <= 120)) throw new Error("--fps must be an integer 1–120");
  if (args.duration && !(Number(args.duration) > 0)) throw new Error("--duration must be a positive number of seconds");
  const presetNames = PRESET_NAMES({ from: root });
  if (args.preset && !presetNames.includes(args.preset)) throw new Error(`--preset must be one of ${presetNames.join(", ")} (your own presets: <library>/presets/, see library.mjs)`);
  if (args.captions && !CAPTION_MODES.includes(args.captions)) throw new Error(`--captions must be one of ${CAPTION_MODES.join(", ")}`);
  const exportsArg = args.exports ? args.exports.split(",").map((r) => r.trim()) : null;
  for (const r of exportsArg ?? []) if (!ASPECTS[r]) throw new Error(`--exports: unknown aspect ${r}`);
  const platforms = args.platform ? parsePlatforms(args.platform) : null;

  const name = slug(basename(root));
  for (const sub of ["assets", "scenes", "audio", "review", "out/scenes"]) mkdirSync(join(root, sub), { recursive: true });
  const brand = ensureBrand(root, name, args);
  const prev = brand.previous; // earlier episode of the same series, if any

  const aspect = args.aspect ?? prev?.format?.aspect ?? "16:9";
  const dimension = args.dimension ?? prev?.engine?.dimension ?? "2d";
  const fps = Number(args.fps ?? prev?.format?.fps ?? 30);
  const duration = Number(args.duration ?? prev?.format?.target_duration ?? 45);
  const language = args.lang ?? prev?.meta?.language ?? "vi";
  const title = args.title ?? basename(root);
  const sameLang = prev && prev.meta?.language === language;

  const vars = { title, aspect, language, dimension, duration };
  for (const file of ["brief.md", "script.md"]) {
    writeFileSync(join(root, file), fill(readFileSync(join(TEMPLATE_DIR, file), "utf8"), vars));
  }

  const exportsList = exportsArg ? [aspect, ...exportsArg.filter((r) => r !== aspect)] : prev?.format?.aspect === aspect ? prev.format.exports ?? [aspect] : [aspect];
  const format = { aspect, ...ASPECTS[aspect], fps, target_duration: duration, exports: exportsList };
  const platformList = platforms ?? prev?.format?.platforms ?? null;
  if (platformList?.length) format.platforms = platformList;
  // Shorts / TikTok / Reels are 9:16: add the export the platform needs (gate 0 told the user so).
  const added = missingRatios(format);
  format.exports.push(...added);
  const bumpers = seriesBumpers(root, brand, { title, language, format, episode: brand.episode });
  writeJson(join(root, "storyboard.json"), { version: 1, scenes: bumpers });

  // Captions (gate 0 question): a new brand kit stores the choice; a reused series kit is not touched,
  // the episode gets its own override instead. burn needs libass: fall back to mux when it is missing.
  const libass = hasLibass();
  const notes = [];
  let capMode = args.captions ?? null;
  const brandNow = readJson(brand.brandPath);
  const brandMode = brandNow.captions?.enabled === false ? "none" : brandNow.captions?.mode ?? "burn";
  if ((capMode ?? (brand.reused ? null : brandMode)) === "burn" && !libass) {
    capMode = "mux";
    notes.push("FFmpeg has no libass (no `subtitles` filter): captions cannot be burned in → mux (soft track + .srt). Install FFmpeg with libass to burn them.");
  }
  let studioCaptions = null;
  if (capMode && !brand.reused) {
    brandNow.captions = { ...(brandNow.captions ?? {}), enabled: capMode !== "none", mode: capMode === "none" ? brandNow.captions?.mode ?? "burn" : capMode };
    writeJson(brand.brandPath, brandNow);
  } else if (capMode && capMode !== brandMode) studioCaptions = { enabled: capMode !== "none", mode: capMode };

  const tts = sameLang ? prev.audio.tts : defaultTts(language);
  const ttsKey = tts[language] ? language : "default";
  if (args["tts-url"]) tts[ttsKey] = { ...tts[ttsKey], base_url: args["tts-url"] };
  if (args.voice) tts[ttsKey] = { ...tts[ttsKey], voice: args.voice };
  let voices = null;
  if (args["probe-tts"]) {
    try {
      voices = await listVoices(tts[ttsKey]);
    } catch (err) {
      notes.push(`TTS voices: ${err.message}. Start the server, then: tts-openai-compatible.mjs --voices <dir>`);
    }
  }

  const studio = {
    version: 1,
    meta: { name, title, language, series: brand.series, episode: brand.episode ?? null, created: now() },
    brand: { ref: relative(root, brand.brandPath), version: null },
    format,
    engine: { default: "hyperframes", dimension, versions: { ...ENGINE_VERSIONS } },
    services: sameLang ? { ...prev.services } : { tts: false, lemo: false, anatomy: false, remotion: false },
    gates: { setup: { done: true, at: now() } },
    ...(studioCaptions && { captions: studioCaptions }),
    scenes: [],
    audio: {
      tts,
      music: null,
      sfx: true,
      loudness: prev?.audio?.loudness ?? -14,
      sentence_pause: prev?.audio?.sentence_pause ?? 0.25,
      scene_padding: prev?.audio?.scene_padding ?? 0.5,
    },
    // A new project has no stills or clips made before ratio blocks were staged (lib/hash.mjs).
    render: { ...(prev?.render ?? { quality: "looks", preview_height: 540, out_dir: "out", codec: "h264", pix_fmt: "yuv420p" }), ratio_stage: RATIO_STAGE_VERSION },
    credit: prev?.credit ?? { warn_scenes: 8, warn_types: ["3d", "character", "explainer"] },
  };
  writeJson(join(root, "studio.json"), studio);

  console.log(`Created one-studio project: ${root}`);
  console.log(`  format    ${aspect} ${studio.format.width}x${studio.format.height} @ ${fps} fps, ~${duration}s`);
  console.log(`  engine    ${studio.engine.default} (${dimension})`);
  const ep = studio.audio.tts[ttsKey];
  const confirmed = sameLang || args.voice;
  console.log(`  voice     ${language} → ${ep.model} @ ${ep.base_url}, voice "${ep.voice}"${sameLang ? ` (from ${brand.previousName})` : args.voice ? "" : " (placeholder: pick one by ear before the first call)"}`);
  if (voices) {
    const ok = voices.voices.includes(ep.voice);
    console.log(`  voices    ${voices.voices.length} on the server: ${voices.voices.join(", ")}${ok ? "" : `  ← "${ep.voice}" is not one of them`}`);
    if (!ok || !confirmed) console.log(`            samples: tts-openai-compatible.mjs <dir> --samples all --allow-tts (ask first) → audio-picker.mjs → --use-voice <id>`);
  }
  const finalBrand = readJson(brand.brandPath);
  console.log(`  look      ${finalBrand.preset ?? "default"}${finalBrand.surface === "glass" ? " · glass surface" : ""}  (compare: compare-presets.mjs <dir>)`);
  console.log(`  captions  ${studioCaptions?.enabled === false || (!studioCaptions && finalBrand.captions?.enabled === false) ? "none" : studioCaptions?.mode ?? finalBrand.captions?.mode ?? "burn"}${libass ? "" : " (no libass here: burn → mux)"}${hasDrawtext() ? "" : " · no drawtext: contact sheets unlabelled"}`);
  if (format.exports.length > 1) console.log(`  exports   ${format.exports.join(", ")} (keyframe-stills shows every ratio at gate 5)`);
  if (format.platforms) {
    console.log(`  platform  ${format.platforms.map((p) => PLATFORMS[p].label).join(", ")}${added.length ? ` → added export ${added.join(", ")}` : ""}`);
    if (format.platforms.some((p) => PLATFORMS[p].vertical)) console.log("            9:16 captions stay out of the bottom 20% / right 12% UI; check it at gate 8: concat-and-mix.mjs <dir> --preview --ratio 9:16");
    for (const w of platformWarnings({ format })) notes.push(w);
  }
  for (const n of notes) console.log(`  ⚠ ${n}`);
  if (brand.series) {
    console.log(`  series    ${brand.series}, episode ${brand.episode}`);
    console.log(`  brand     ${brand.reused ? "reused" : "created"} ${brand.brandPath}`);
  } else console.log(`  brand     created ${brand.brandPath} (${args.preset ? `preset ${args.preset}` : "defaults"}; customise at gate 0)`);
  if (bumpers.length) console.log(`  bumpers   ${bumpers.map((b) => b.id).join(", ")} from the series brand (keep them first/last in the storyboard)`);
  console.log("Next: gate 1 — fill brief.md, then: node status.mjs <dir> --approve brief");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
