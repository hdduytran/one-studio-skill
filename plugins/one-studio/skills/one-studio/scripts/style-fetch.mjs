#!/usr/bin/env node
// Bring a reference video into style-refs/<slug>/ : a local file (cut with FFmpeg) or a link (yt-dlp).
//   node style-fetch.mjs <project-dir> <url|file> [--slug s] [--from 0:00] [--to 1:30] [--max 90] [--keep]
// Links need studio.json → services.download = true (ask the user first). No cookies, no installs.
// Result: style-refs/<slug>/source.mp4, info.json {file, title, channel?, url?, platform, duration, range{from,to}, accessed, subs?}
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isMain, loadProject, now, parseArgs, writeJson } from "./lib/project.mjs";
import { probe, run } from "./lib/ffmpeg.mjs";
import { ensureGitignore, newSlug, slugify, styleDir, styleRefsDir } from "./lib/style-refs.mjs";
import { INSTALL_HELP, assertHttpUrl, buildArgs, classifyError, filterInfo, findYtdlp, looksLikeUrl, platformOf, resolveRange } from "./lib/ytdlp.mjs";

export const CONSENT_HELP = 'Downloading a link needs your OK first (the video is only a style reference and is deleted after the style is applied; you are responsible for the platform\'s terms). After the user agrees, set "services": { "download": true } in studio.json and run this again.\nTải video từ link cần được đồng ý trước: video chỉ để tham khảo style và bị xoá sau khi áp dụng. Sau khi người dùng đồng ý, đặt "services": { "download": true } trong studio.json rồi chạy lại.';

const round3 = (n) => Math.round(n * 1000) / 1000;

// Cut [from, to) out of a local file into dir/source.mp4, h264/aac at most 720p high.
// Always re-encoded: stream copy can only cut on keyframes, which would break the requested range.
function cutLocal(file, dir, { from, to }) {
  const total = probe(file).duration;
  if (from >= total) throw new Error(`--from (${from}s) is past the end of the file (${round3(total)}s)`);
  const end = Math.min(to ?? total, total);
  const out = join(dir, "source.mp4");
  run("ffmpeg", ["-nostdin", "-y", "-v", "error", "-ss", String(from), "-i", file, "-t", String(round3(end - from)),
    "-vf", "scale=-2:'min(720,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
  return { out, to: from + probe(out).duration };
}

function downloadLink(bin, url, dir, { from, to }) {
  const r = spawnSync(bin, buildArgs({ url, dir, from, to }), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: process.env });
  if (r.error) throw new Error(`Cannot start yt-dlp: ${r.error.message}`);
  if (r.status !== 0) throw new Error(classifyError(r.stderr || r.stdout).message);
  const files = readdirSync(dir);
  const video = files.find((f) => /^source\.(mp4|mkv|webm|mov|m4v)$/i.test(f));
  if (!video) throw new Error("yt-dlp finished but produced no video file / yt-dlp không tạo ra file video");
  let raw = {};
  const infoFile = files.find((f) => f.endsWith(".info.json"));
  if (infoFile) {
    try {
      raw = JSON.parse(readFileSync(join(dir, infoFile), "utf8"));
    } catch {
      raw = {};
    }
  }
  // yt-dlp's own metadata and any extra sidecar files are dropped; only subtitles are kept.
  const sub = files.filter((f) => /^source\..+\.vtt$/i.test(f)).sort((a, b) => Number(/\.vi/.test(b)) - Number(/\.vi/.test(a)))[0];
  if (sub) renameSync(join(dir, sub), join(dir, "subs.vtt"));
  for (const f of readdirSync(dir)) if (f !== video && f !== "subs.vtt") rmSync(join(dir, f), { recursive: true, force: true });
  return { video, info: filterInfo(raw) };
}

// Fetches one reference; returns { slug, dir, info }.
export function fetchStyleSource(project, input, opts = {}) {
  const range = resolveRange({ from: opts.from, to: opts.to, max: opts.max });
  const isFile = !looksLikeUrl(input);
  const file = isFile ? resolve(input) : null;
  if (isFile && !existsSync(file)) throw new Error(`File not found / không tìm thấy file: ${file}`);
  const url = isFile ? null : assertHttpUrl(input);
  if (url && project.studio.services?.download !== true) throw new Error(CONSENT_HELP);
  const bin = url ? findYtdlp() : null;
  if (url && !bin) throw new Error(`yt-dlp is not installed / chưa cài yt-dlp. Ask the user, then run: ${INSTALL_HELP}\nOr download the video yourself and pass the file path.`);
  if (opts.slug && slugify(opts.slug) !== opts.slug) throw new Error(`--slug must be kebab-case ASCII, e.g. "${slugify(opts.slug)}"`);
  if (opts.slug && existsSync(styleDir(project, opts.slug))) throw new Error(`style-refs/${opts.slug} already exists; pick another --slug`);

  ensureGitignore(project);
  const work = join(styleRefsDir(project), `.fetch-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    let info;
    if (isFile) {
      const cut = cutLocal(file, work, range);
      info = { title: basename(file).replace(/\.[^.]+$/, ""), platform: "other", file: "source.mp4", to: cut.to };
    } else {
      const got = downloadLink(bin, url, work, range);
      info = { ...got.info, url, platform: platformOf(got.info.extractor, url), file: got.video };
      info.to = range.from + probe(join(work, got.video)).duration;
    }
    const slug = opts.slug ?? newSlug(project, info.title ?? basename(file ?? new URL(url).pathname));
    const sourceDuration = probe(join(work, info.file)).duration;
    const record = {
      ...(url && { url }),
      file: info.file,
      title: info.title,
      ...(info.channel && { channel: info.channel }),
      platform: info.platform,
      ...(info.extractor && { extractor: info.extractor }),
      duration: round3(sourceDuration),
      ...(info.width && { width: info.width, height: info.height }),
      range: { from: range.from, to: round3(info.to) },
      accessed: now(),
      subs: existsSync(join(work, "subs.vtt")),
      keep: opts.keep === true,
    };
    writeJson(join(work, "info.json"), record);
    const dir = styleDir(project, slug);
    renameSync(work, dir);
    return { slug, dir, info: record };
  } catch (err) {
    rmSync(work, { recursive: true, force: true });
    throw err;
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["keep", "help"], options: ["slug", "from", "to", "max"] });
    if (args.help || args._.length < 2) {
      console.log("usage: style-fetch.mjs <project-dir> <url|file> [--slug s] [--from 0:00] [--to 1:30] [--max 90] [--keep]");
      process.exit(args.help ? 0 : 1);
    }
    const project = loadProject(args._[0]);
    const { slug, dir, info } = fetchStyleSource(project, args._[1], args);
    console.log(`slug: ${slug}\npath: ${join(dir, info.file)}\nduration: ${info.duration}s (range ${info.range.from}-${info.range.to}s)\nsubs: ${info.subs ? "yes (subs.vtt)" : "no"}\nplatform: ${info.platform}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
