// Screen scene with a real capture and real renders: the same scene renders to identical frames twice,
// and the camera really zooms to the clicked button. Needs Chrome (HyperFrames shell), FFmpeg and Node 22+.
// Run: node --test --test-timeout=1800000 tests/e2e/screen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, tmp, writeJson } from "../helpers.mjs";
import { cdpAvailable, findChrome } from "../../plugins/one-studio/skills/one-studio/scripts/lib/cdp.mjs";
import { ENGINES } from "../../plugins/one-studio/skills/one-studio/scripts/lib/engines.mjs";
import { variantRoot } from "../../plugins/one-studio/skills/one-studio/scripts/lib/variants.mjs";
import { loadProject } from "../../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { markSpan, readEvents } from "../../plugins/one-studio/skills/one-studio/scripts/lib/flow.mjs";

const execFileP = promisify(execFile);
async function ok(script, ...args) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: process.env, maxBuffer: 32 << 20 });
    return r.stdout;
  } catch (e) {
    assert.fail(`${script} ${args.join(" ")}\n${e.stdout}\n${e.stderr}`);
  }
}
const ready = Boolean(findChrome()) && cdpAvailable() && spawnSync("ffmpeg", ["-version"]).status === 0;
const fillMd = (dir, f) => writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace(/<!--[\s\S]*?-->/g, "ok"));

const ASSETS = "plugins/one-studio/skills/one-studio/templates/hyperframes-project/assets";
const load = (name) => {
  const mod = { exports: {} };
  new Function("module", readFileSync(join(ASSETS, name), "utf8"))(mod);
  return mod.exports;
};
globalThis.OS_CAMERA = load("camera.js");
const SCREEN = load("screen.js");

// Frame checksums of a clip: identical clips have identical lists.
const frameHashes = (file) => spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "framemd5", "-"], { encoding: "utf8" }).stdout.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").pop().trim());

// Bounding box width of the pixels close to `rgb` in a PNG.
function colourWidth(png, [r, g, b], width, height) {
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 64 << 20 }).stdout;
  let min = width, max = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (Math.abs(raw[i] - r) < 12 && Math.abs(raw[i + 1] - g) < 12 && Math.abs(raw[i + 2] - b) < 12) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  return max < 0 ? 0 : max - min + 1;
}

test("screen scene: capture, render twice to identical frames, camera zooms to the click", { skip: !ready && "needs Chrome, FFmpeg and Node 22+" }, async () => {
  const page = readFileSync(resolve("tests/fixtures/capture/page.html"), "utf8");
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(page);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const dir = join(tmp(), "screen");
    await ok("init-project.mjs", dir, "--title", "Screen", "--duration", "4");
    const studio = readJson(join(dir, "studio.json"));
    studio.services = { ...(studio.services ?? {}), capture: true };
    writeJson(join(dir, "studio.json"), studio);
    fillMd(dir, "brief.md");
    fillMd(dir, "script.md");
    mkdirSync(join(dir, "flows"), { recursive: true });
    writeJson(join(dir, "flows", "tour.json"), {
      url: `http://127.0.0.1:${server.address().port}/`,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      steps: [{ mark: "start" }, { wait: 800 }, { click: "#b1" }, { wait: 2500 }, { mark: "end" }],
    });
    await ok("capture-screen.mjs", dir, "tour");
    const events = readEvents(loadProject(dir), "tour");
    const span = markSpan(events, "start", "end");
    const sceneLength = Math.floor((span.to - span.from) * 10) / 10;
    writeJson(join(dir, "storyboard.json"), {
      version: 1,
      scenes: [{ id: "s01", title: "Tour", type: "screen", mode: "screen-cinema", duration: sceneLength, screen: { flow: "tour", from_mark: "start", to_mark: "end", frame: "window", zoom: "auto" }, lines: [] }],
    });
    await ok("prepare-project.mjs", dir);
    await ok("new-scene.mjs", dir, "s01");
    await ok("validate.mjs", dir);

    const project = loadProject(dir);
    const scene = project.storyboard.scenes[0];
    // Same scene, rendered twice: every frame identical.
    const a = join(dir, "out", "a.mp4"), b = join(dir, "out", "b.mp4");
    mkdirSync(join(dir, "out"), { recursive: true });
    ENGINES.hyperframes.render(project, scene, a, { mode: "preview" });
    ENGINES.hyperframes.render(project, scene, b, { mode: "preview" });
    const ha = frameHashes(a), hb = frameHashes(b);
    assert.ok(ha.length >= Math.floor(sceneLength * project.studio.format.fps), `${ha.length} frames`);
    assert.deepEqual(ha, hb, "two renders of the same scene differ");
    assert.ok(new Set(ha).size > 10, "the picture moves (video, cursor, camera)");

    // The camera at a time after the click: the clicked button is drawn at its recorded size times the zoom.
    const click = events.clicks[0];
    const tHold = click.t - span.from + 1.0;
    const layout = SCREEN.layout(1920, 1080, events.viewport, "window");
    const wps = SCREEN.plan(events, { W: 1920, H: 1080, from: span.from, to: span.to, zoom: "auto", layout, viewport: events.viewport });
    const view = SCREEN.viewAt(wps, tHold, { frame: { w: 1920, h: 1080 }, world: { w: 1920, h: 1080 }, places: {} });
    assert.ok(view.zoom > 1.5, `planned zoom ${view.zoom}`);
    const stills = ENGINES.hyperframes.stills(project, scene, [0.2, tHold], join(dir, "review", "s01"));
    const green = [16, 163, 107]; // the clicked button after the page reacts
    const zoomed = colourWidth(stills[1], green, 1920, 1080);
    const rest = 180 * layout.s;
    assert.equal(colourWidth(stills[0], green, 1920, 1080), 0, "not clicked yet at the start");
    assert.ok(Math.abs(zoomed - rest * view.zoom) / (rest * view.zoom) < 0.08, `clicked button is ${zoomed}px wide, expected about ${Math.round(rest * view.zoom)} (zoom ${view.zoom.toFixed(2)})`);
    assert.ok(zoomed > rest * 1.4, "zoomed in compared with the resting layout");

    // 9:16: layout and zoom are recomputed for the tall frame, not scaled from 16:9.
    const tall = SCREEN.layout(1080, 1920, events.viewport, "window");
    const planTall = SCREEN.plan(events, { W: 1080, H: 1920, from: span.from, to: span.to, zoom: "auto", layout: tall, viewport: events.viewport });
    const viewTall = SCREEN.viewAt(planTall, tHold, { frame: { w: 1080, h: 1920 }, world: { w: 1080, h: 1920 }, places: {} });
    const root = variantRoot(project, "9:16");
    const tallStills = ENGINES.hyperframes.stills(project, scene, [tHold], join(dir, "review", "s01-tall"), { root, tag: "s01-9x16" });
    const wideGreen = colourWidth(tallStills[0], green, 1080, 1920);
    const restTall = 180 * tall.s;
    assert.ok(Math.abs(wideGreen - restTall * viewTall.zoom) / (restTall * viewTall.zoom) < 0.08, `9:16 clicked button is ${wideGreen}px wide, expected about ${Math.round(restTall * viewTall.zoom)}`);
  } finally {
    server.close();
  }
});
