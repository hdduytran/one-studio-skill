// FFmpeg / FFprobe helpers. Every scene clip is normalised to one canonical encode so the final
// concat is a pure stream copy (no re-encode of unchanged scenes).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const TIMESCALE = 15360;

export function run(bin, args, { quiet = true } = {}) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${bin} not found or failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${bin} ${args.slice(0, 6).join(" ")} … failed:\n${(r.stderr || r.stdout).trim().split("\n").slice(-8).join("\n")}`);
  if (!quiet) process.stdout.write(r.stdout);
  return r;
}

export function probe(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,time_base,sample_rate,channels:format=duration", "-of", "json", path], { encoding: "utf8" });
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const [n, d] = (v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    duration: Number(j.format?.duration ?? 0),
    video: v ? { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, pix_fmt: v.pix_fmt, fps: d ? n / d : 0, time_base: v.time_base } : null,
    audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels } : null,
  };
}

export const duration = (path) => probe(path).duration;

// Canonical encode. mode "final": full size, CRF from studio.render.crf. mode "preview": scaled down, fast.
export function encodeSettings(studio, mode = "final") {
  const { width, height, fps } = studio.format;
  if (mode === "preview") {
    const ph = studio.render?.preview_height ?? 540;
    const pw = Math.round((width * ph) / height / 2) * 2;
    return { width: pw, height: ph, fps, crf: 28, preset: "veryfast" };
  }
  const crf = studio.render?.crf ?? ({ draft: 26, looks: 18, delivery: 16 }[studio.render?.quality ?? "looks"] ?? 18);
  return { width, height, fps, crf, preset: "medium" };
}

export function normalize(src, dest, s) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part.mp4`;
  run("ffmpeg", [
    "-y", "-v", "error", "-i", src, "-an",
    "-vf", `scale=${s.width}:${s.height}:flags=lanczos,setsar=1,fps=${s.fps},format=yuv420p`,
    "-c:v", "libx264", "-profile:v", "high", "-preset", s.preset, "-crf", String(s.crf),
    "-g", String(s.fps * 2), "-video_track_timescale", String(TIMESCALE), "-movflags", "+faststart", tmp,
  ]);
  renameSync(tmp, dest);
  return dest;
}

// QA: every clip must match the canonical stream exactly before a stream-copy concat.
export function checkClips(paths, s) {
  const problems = [];
  for (const p of paths) {
    const v = probe(p).video;
    if (!v) {
      problems.push(`${p}: no video stream`);
      continue;
    }
    const want = { codec: "h264", width: s.width, height: s.height, pix_fmt: "yuv420p", time_base: `1/${TIMESCALE}` };
    for (const [k, val] of Object.entries(want)) if (v[k] !== val) problems.push(`${p}: ${k} ${v[k]} ≠ ${val}`);
    if (Math.abs(v.fps - s.fps) > 0.01) problems.push(`${p}: fps ${v.fps} ≠ ${s.fps}`);
  }
  return problems;
}

export function concatCopy(paths, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const list = `${dest}.txt`;
  writeFileSync(list, paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const tmp = `${dest}.part.mp4`;
  run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", tmp]);
  renameSync(tmp, dest);
  return dest;
}
