#!/usr/bin/env node
// Create a one-studio project (gate 0 output).
//   node init-project.mjs <dir> [--title "…"] [--lang vi] [--dimension 2d|3d|mixed]
//        [--aspect 16:9|9:16|1:1|4:5] [--fps 30] [--duration 45]
//        [--series <name>] [--series-root <dir>]   (default series root: <dir>/../series)
// With --series, the brand kit lives at <series-root>/<name>/brand/brand.json and is reused
// as-is when it already exists (no brand questions for later episodes).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { ASPECTS, ENGINE_VERSIONS, TEMPLATE_DIR, now, parseArgs, readJson, writeJson } from "./lib/project.mjs";

const USAGE = `usage: init-project.mjs <dir> [--title "…"] [--lang vi] [--dimension 2d|3d|mixed]
       [--aspect 16:9|9:16|1:1|4:5] [--fps 30] [--duration 45] [--series <name>] [--series-root <dir>]`;

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

function ensureBrand(root, name, args) {
  if (!args.series) {
    const brandPath = join(root, "brand", "brand.json");
    mkdirSync(dirname(brandPath), { recursive: true });
    writeFileSync(brandPath, fill(readFileSync(join(TEMPLATE_DIR, "brand.json"), "utf8"), { name }));
    return { brandPath, reused: false, series: null };
  }
  const series = slug(args.series);
  const seriesRoot = resolve(args["series-root"] ?? join(dirname(root), "series"));
  const seriesDir = join(seriesRoot, series);
  const brandPath = join(seriesDir, "brand", "brand.json");
  const reused = existsSync(brandPath);
  if (!reused) {
    mkdirSync(dirname(brandPath), { recursive: true });
    writeFileSync(brandPath, fill(readFileSync(join(TEMPLATE_DIR, "brand.json"), "utf8"), { name: series }));
  }
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

function main() {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["help"],
    options: ["title", "lang", "dimension", "aspect", "fps", "duration", "series", "series-root"],
  });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log(USAGE);
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

  const format = { aspect, ...ASPECTS[aspect], fps, target_duration: duration, exports: prev?.format?.aspect === aspect ? prev.format.exports ?? [aspect] : [aspect] };
  const bumpers = seriesBumpers(root, brand, { title, language, format, episode: brand.episode });
  writeJson(join(root, "storyboard.json"), { version: 1, scenes: bumpers });

  const studio = {
    version: 1,
    meta: { name, title, language, series: brand.series, episode: brand.episode ?? null, created: now() },
    brand: { ref: relative(root, brand.brandPath), version: null },
    format,
    engine: { default: "hyperframes", dimension, versions: { ...ENGINE_VERSIONS } },
    services: sameLang ? { ...prev.services } : { tts: false, lemo: false, anatomy: false, remotion: false },
    gates: { setup: { done: true, at: now() } },
    scenes: [],
    audio: {
      tts: sameLang ? prev.audio.tts : defaultTts(language),
      music: null,
      sfx: false,
      loudness: prev?.audio?.loudness ?? -14,
      sentence_pause: prev?.audio?.sentence_pause ?? 0.25,
      scene_padding: prev?.audio?.scene_padding ?? 0.5,
    },
    render: prev?.render ?? { quality: "looks", preview_height: 540, out_dir: "out", codec: "h264", pix_fmt: "yuv420p" },
    credit: prev?.credit ?? { warn_scenes: 8, warn_types: ["3d", "character", "explainer"] },
  };
  writeJson(join(root, "studio.json"), studio);

  console.log(`Created one-studio project: ${root}`);
  console.log(`  format    ${aspect} ${studio.format.width}x${studio.format.height} @ ${fps} fps, ~${duration}s`);
  console.log(`  engine    ${studio.engine.default} (${dimension})`);
  const tts = studio.audio.tts[language] ?? studio.audio.tts.default;
  console.log(`  voice     ${language} → ${tts.model} @ ${tts.base_url}, voice "${tts.voice}"${sameLang ? ` (from ${brand.previousName})` : " (placeholder: confirm before first call)"}`);
  if (brand.series) {
    console.log(`  series    ${brand.series}, episode ${brand.episode}`);
    console.log(`  brand     ${brand.reused ? "reused" : "created"} ${brand.brandPath}`);
  } else console.log(`  brand     created ${brand.brandPath} (defaults; customise at gate 0)`);
  if (bumpers.length) console.log(`  bumpers   ${bumpers.map((b) => b.id).join(", ")} from the series brand (keep them first/last in the storyboard)`);
  console.log("Next: gate 1 — fill brief.md, then: node status.mjs <dir> --approve brief");
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
