// FFmpeg calls for style analysis. Every call is non-interactive (-nostdin), bounded in input length
// (-t) and in wall-clock time (spawn timeout), so a bad file cannot hang the run.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const ANALYSIS_WIDTH = 320;
export const PALETTE_WIDTH = 160;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
export const scaledSize = (w, h, width) => ({ w: Math.min(width, even(w)), h: even((Math.min(width, w) * h) / w) });

function ff(args, { timeoutMs, raw = false } = {}) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-hide_banner", "-nostats", ...args], { encoding: raw ? "buffer" : "utf8", maxBuffer: 512 * 1024 * 1024, timeout: timeoutMs });
  if (r.error) throw new Error(`ffmpeg ${r.error.code === "ETIMEDOUT" ? `timed out after ${timeoutMs} ms` : `failed to start: ${r.error.message}`}`);
  const err = String(r.stderr ?? "");
  if (r.status !== 0) throw new Error(`ffmpeg ${args.slice(-6).join(" ")} failed:\n${err.trim().split("\n").slice(-6).join("\n")}`);
  return { stdout: r.stdout, stderr: err };
}

export const ffmpegVersion = () => {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return /ffmpeg version (\S+)/.exec(r.stdout ?? "")?.[1] ?? "unknown";
};

// One decode of the video at reduced size: scene score, motion, luma/saturation, black intervals, picture area.
// filters = names of optional filters this build has; missing ones are skipped and their fields stay empty.
export function videoPass(src, { duration, width, height, threshold, has }) {
  const s = scaledSize(width, height, ANALYSIS_WIDTH);
  const chain = [`scale=${s.w}:${s.h}`];
  if (has("scdet")) chain.push(`scdet=t=${threshold}`);
  if (has("signalstats")) chain.push("signalstats");
  if (has("blackdetect")) chain.push("blackdetect=d=0.1:pic_th=0.98");
  if (has("cropdetect")) chain.push("cropdetect");
  chain.push("metadata=print:file=-");
  const r = ff(["-v", "info", "-t", String(duration + 1), "-i", src, "-an", "-vf", chain.join(","), "-f", "null", "-"], { timeoutMs: 60000 + duration * 2000 });
  return { metadata: r.stdout, log: r.stderr, scaled: s };
}

export function audioPass(src, { duration, has }) {
  const chain = [];
  if (has("ebur128")) chain.push("ebur128");
  if (has("silencedetect")) chain.push("silencedetect=n=-35dB:d=0.3");
  if (!chain.length) return "";
  return ff(["-v", "info", "-t", String(duration + 1), "-i", src, "-vn", "-af", chain.join(","), "-f", "null", "-"], { timeoutMs: 60000 + duration * 1000 }).stderr;
}

const clampT = (t, duration) => Math.max(0, Math.min(t, Math.max(0, duration - 0.1)));

// Raw rgb24 bytes of one frame at width x height (palette sampling).
export function grabRaw(src, t, duration, w, h) {
  const r = ff(["-v", "error", "-ss", clampT(t, duration).toFixed(3), "-i", src, "-an", "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { timeoutMs: 30000, raw: true });
  if (r.stdout.length < w * h * 3) throw new Error(`no frame at ${t}s in ${src}`);
  return r.stdout;
}

export function grabJpg(src, t, duration, out, width = 480) {
  mkdirSync(dirname(out), { recursive: true });
  ff(["-v", "error", "-y", "-ss", clampT(t, duration).toFixed(3), "-i", src, "-an", "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", out], { timeoutMs: 30000 });
  return out;
}
