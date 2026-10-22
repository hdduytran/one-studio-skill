// Generates synthetic reference clips with known cuts, colours, fades, silence and motion.
// Nothing is committed: tests call makeFixtures(dir) with a temp dir.
//   node make-style-fixtures.mjs <out-dir> [--long]   (--long also writes a 60 s 720p clip)
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const SEGMENTS = [
  { color: "0xd62828", from: 0, to: 2 },
  { color: "0x1d3557", from: 2, to: 5 },
  { color: "0x000000", from: 5, to: 5.5 }, // fade through black
  { color: "0xf4d35e", from: 5.5, to: 7.5 },
  { color: "0x2a9d8f", from: 7.5, to: 10 },
  { color: "0x7b2cbf", from: 10, to: 13 },
];
export const SILENCE = { from: 8, to: 10 };
export const FPS = 30;
// A black bar sweeping across a white frame: large, fast, steady motion.
const BOX_OVERLAY = "[0][1]overlay=x='mod(t*1500\\,800)-160':y=0";

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...args], { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed: ${r.stderr}`);
}

export function makeFixtures(dir, { long = false } = {}) {
  mkdirSync(dir, { recursive: true });
  const out = { cuts: join(dir, "cuts.mp4"), motion: join(dir, "motion.mp4"), still: join(dir, "still.mp4") };
  const inputs = SEGMENTS.flatMap((s) => ["-f", "lavfi", "-i", `color=c=${s.color}:s=640x360:r=${FPS}:d=${s.to - s.from}`]);
  const concat = SEGMENTS.map((_, i) => `[${i}:v]`).join("") + `concat=n=${SEGMENTS.length}:v=1:a=0[v]`;
  ffmpeg([...inputs, "-f", "lavfi", "-i", "sine=f=440:d=13", "-filter_complex", `${concat};[${SEGMENTS.length}:a]volume=enable='between(t,${SILENCE.from},${SILENCE.to})':volume=0[a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out.cuts]);
  ffmpeg(["-f", "lavfi", "-i", `color=c=white:s=640x360:r=${FPS}:d=5`, "-f", "lavfi", "-i", `color=c=black:s=160x360:r=${FPS}:d=5`, "-filter_complex", BOX_OVERLAY, "-c:v", "libx264", "-pix_fmt", "yuv420p", out.motion]);
  ffmpeg(["-f", "lavfi", "-i", `color=c=0x336699:s=640x360:r=${FPS}:d=5`, "-c:v", "libx264", "-pix_fmt", "yuv420p", out.still]);
  if (long) {
    out.long = join(dir, "long-720p.mp4");
    // 20 shots of 3 s: moving black box over flat colours at 1280x720, plus a tone.
    const n = 20;
    const hues = ["0xd62828", "0x1d3557", "0xf4d35e", "0x2a9d8f", "0x7b2cbf"];
    const ins = Array.from({ length: n }, (_, i) => ["-f", "lavfi", "-i", `color=c=${hues[i % hues.length]}:s=1280x720:r=30:d=3`, "-f", "lavfi", "-i", "color=c=black:s=320x720:r=30:d=3"]).flat();
    const parts = Array.from({ length: n }, (_, i) => `[${2 * i}][${2 * i + 1}]overlay=x='mod(t*1500\\,1600)-320':y=0[s${i}]`);
    const cat = Array.from({ length: n }, (_, i) => `[s${i}]`).join("") + `concat=n=${n}:v=1:a=0[v]`;
    ffmpeg([...ins, "-f", "lavfi", "-i", "sine=f=220:d=60", "-filter_complex", `${parts.join(";")};${cat}`, "-map", "[v]", "-map", `${2 * n}:a`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", out.long]);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [dir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: make-style-fixtures.mjs <out-dir> [--long]");
    process.exit(1);
  }
  console.log(makeFixtures(dir, { long: process.argv.includes("--long") }));
}
