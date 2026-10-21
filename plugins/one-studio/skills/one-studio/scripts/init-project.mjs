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
  return { brandPath, reused, series, episode };
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

  const aspect = args.aspect ?? "16:9";
  if (!ASPECTS[aspect]) throw new Error(`--aspect must be one of ${Object.keys(ASPECTS).join(", ")}`);
  const dimension = args.dimension ?? "2d";
  if (!["2d", "3d", "mixed"].includes(dimension)) throw new Error("--dimension must be 2d, 3d or mixed");
  const fps = Number(args.fps ?? 30);
  const duration = Number(args.duration ?? 45);
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error("--fps must be an integer 1–120");
  if (!(duration > 0)) throw new Error("--duration must be a positive number of seconds");
  const language = args.lang ?? "vi";
  const title = args.title ?? basename(root);
  const name = slug(basename(root));

  for (const sub of ["assets", "scenes", "audio", "review", "out/scenes"]) mkdirSync(join(root, sub), { recursive: true });

  const brand = ensureBrand(root, name, args);
  const vars = { title, aspect, language, dimension, duration };
  for (const file of ["brief.md", "script.md"]) {
    writeFileSync(join(root, file), fill(readFileSync(join(TEMPLATE_DIR, file), "utf8"), vars));
  }
  writeFileSync(join(root, "storyboard.json"), readFileSync(join(TEMPLATE_DIR, "storyboard.json")));

  const studio = {
    version: 1,
    meta: { name, title, language, series: brand.series, episode: brand.episode ?? null, created: now() },
    brand: { ref: relative(root, brand.brandPath), version: null },
    format: { aspect, ...ASPECTS[aspect], fps, target_duration: duration, exports: [aspect] },
    engine: { default: dimension === "3d" ? "remotion" : "hyperframes", dimension, versions: { ...ENGINE_VERSIONS } },
    services: { tts: false, lemo: false, anatomy: false, remotion: false },
    gates: { setup: { done: true, at: now() } },
    scenes: [],
    audio: { tts: defaultTts(language), music: null, sfx: false, loudness: -14, sentence_pause: 0.25, scene_padding: 0.5 },
    render: { quality: "looks", preview_height: 540, out_dir: "out", codec: "h264", pix_fmt: "yuv420p" },
    credit: { warn_scenes: 8, warn_types: ["3d", "character", "explainer"] },
  };
  writeJson(join(root, "studio.json"), studio);

  console.log(`Created one-studio project: ${root}`);
  console.log(`  format    ${aspect} ${studio.format.width}x${studio.format.height} @ ${fps} fps, ~${duration}s`);
  console.log(`  engine    ${studio.engine.default} (${dimension})`);
  const tts = studio.audio.tts[language] ?? studio.audio.tts.default;
  console.log(`  voice     ${language} → ${tts.model} @ ${tts.base_url}, voice "${tts.voice}" (placeholder: confirm before first call)`);
  if (brand.series) {
    console.log(`  series    ${brand.series}, episode ${brand.episode}`);
    console.log(`  brand     ${brand.reused ? "reused" : "created"} ${brand.brandPath}`);
  } else console.log(`  brand     created ${brand.brandPath} (defaults; customise at gate 0)`);
  console.log("Next: gate 1 — fill brief.md, then: node status.mjs <dir> --approve brief");
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
