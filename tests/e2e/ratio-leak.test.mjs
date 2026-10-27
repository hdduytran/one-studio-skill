// A 9:16 <style data-ratio> block must never reach the 16:9 stills or clips. HyperFrames merges adjacent
// <style> blocks when it loads a scene (dropping data-ratio), so the block is removed before staging.
// Run: HYPERFRAMES_BROWSER_PATH=<headless_shell> npm run test:e2e
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tmp, writeJson } from "../helpers.mjs";

const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;

// Mean colour of a 4×4 patch at (50, 50) of an image or of a video frame at `at` seconds.
function pixel(file, at) {
  const seek = at == null ? [] : ["-ss", String(at)];
  const r = spawnSync("ffmpeg", ["-v", "error", ...seek, "-i", file, "-frames:v", "1", "-vf", "crop=4:4:50:50,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  return [...r.stdout];
}
const isRed = ([r, g, b]) => r > 200 && g < 60 && b < 60;
const ok = (script, ...args) => {
  const r = run(script, ...args);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};

test("9:16 ratio block stays out of 16:9 stills and clips, even after a plain <style>", { skip: !chrome && "no Chrome for HyperFrames" }, () => {
  const dir = join(tmp(), "leak");
  ok("init-project.mjs", dir, "--lang", "vi", "--exports", "16:9,9:16");
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [{ id: "s01", type: "text", duration: 2, lines: [] }] });
  ok("prepare-project.mjs", dir);
  ok("new-scene.mjs", dir, "s01");
  const file = join(dir, "scenes", "s01.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("</head>", '<style>.x { color: blue; }</style>\n<style data-ratio="9:16">\n  #root { background: rgb(255, 0, 0) !important; }\n</style>\n</head>'));

  ok("keyframe-stills.mjs", dir, "--frames", "1");
  const still = (sub) => join(dir, "review", ...sub, readdirSync(join(dir, "review", ...sub)).find((f) => f.endsWith(".png")));
  assert.ok(!isRed(pixel(still(["s01"]))), "16:9 still has no 9:16 rule");
  assert.ok(isRed(pixel(still(["9x16", "s01"]))), "9:16 still has its rule");

  ok("status.mjs", dir, "--approve-scenes", "s01");
  ok("render-changed-scenes.mjs", dir, "--preview");
  const clip = join(dir, "out", "preview", readdirSync(join(dir, "out", "preview")).find((f) => f.endsWith(".mp4")));
  assert.ok(!isRed(pixel(clip, 1)), "16:9 preview clip has no 9:16 rule");
  // Gate 8 check of the Shorts cut: a low-res 9:16 preview with its own rule.
  ok("concat-and-mix.mjs", dir, "--preview", "--ratio", "9:16");
  const tall = join(dir, "out", readdirSync(join(dir, "out")).find((f) => f.endsWith("-preview-9x16.mp4")));
  assert.ok(isRed(pixel(tall, 1)), "9:16 preview has its rule");
});
