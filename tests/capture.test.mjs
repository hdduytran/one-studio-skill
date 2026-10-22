// Screen capture: flow validation, consent, password refusal, recorded rects, and the zoom/cursor maths of the screen runtime.
// The browser tests need Chrome (HyperFrames' headless shell or ONE_STUDIO_CHROME), FFmpeg and Node 22+; they skip otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, run, tmp, writeJson } from "./helpers.mjs";
import { flowErrors } from "../plugins/one-studio/skills/one-studio/scripts/lib/flow.mjs";
import { cdpAvailable, findChrome } from "../plugins/one-studio/skills/one-studio/scripts/lib/cdp.mjs";
import { cursorAt, moveSegment, pointAt, rng } from "../plugins/one-studio/skills/one-studio/scripts/lib/cursor-path.mjs";
import { sceneHash } from "../plugins/one-studio/skills/one-studio/scripts/lib/hash.mjs";
import { loadProject } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";

const execFileP = promisify(execFile);
const ASSETS = "plugins/one-studio/skills/one-studio/templates/hyperframes-project/assets";
// Browser scripts (UMD) loaded the way a script tag would, without a package type clash.
const load = (name) => {
  const mod = { exports: {} };
  new Function("module", readFileSync(join(ASSETS, name), "utf8"))(mod);
  return mod.exports;
};
globalThis.OS_CAMERA = load("camera.js");
const SCREEN = load("screen.js");

const canRecord = Boolean(findChrome()) && cdpAvailable() && spawnSync("ffmpeg", ["-version"]).status === 0;
const PAGE = readFileSync(resolve("tests/fixtures/capture/page.html"), "utf8");

async function withServer(fn) {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/`);
  } finally {
    server.close();
  }
}

async function capture(dir, id, ...extra) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, "capture-screen.mjs"), dir, id, ...extra], { encoding: "utf8", maxBuffer: 16 << 20 });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { code: e.code, out: e.stdout, err: e.stderr };
  }
}

function project({ capture: allowed = true } = {}) {
  const dir = join(tmp(), "demo");
  assert.equal(run("init-project.mjs", dir, "--title", "Screen").code, 0);
  const studio = readJson(join(dir, "studio.json"));
  studio.services = { ...(studio.services ?? {}), capture: allowed };
  writeJson(join(dir, "studio.json"), studio);
  mkdirSync(join(dir, "flows"), { recursive: true });
  return dir;
}

const steps = (...s) => s;

// ---------- flow schema ----------
test("flow schema accepts every step kind and rejects bad ones", () => {
  const good = { url: "http://127.0.0.1:1/", viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, steps: steps({ goto: "/a" }, { click: "#x" }, { type: "#n", text: "hi", cps: 12 }, { press: "Enter" }, { scroll: { by: 300 } }, { scroll: { to: "#end" } }, { hover: ".h" }, { wait: 500 }, { wait: "#ready" }, { mark: "done" }) };
  assert.deepEqual(flowErrors(good), []);
  const bad = (steps2, extra = {}) => flowErrors({ url: "http://127.0.0.1:1/", steps: steps2, ...extra });
  assert.ok(bad([{ click: "" }]).length, "empty selector");
  assert.ok(bad([{ jump: "#x" }]).length, "unknown step");
  assert.ok(bad([{ type: "#n" }]).length, "type needs text");
  assert.ok(bad([{ press: "F13" }]).length, "unknown key");
  assert.ok(bad([{ scroll: {} }]).some((e) => /to|by/.test(e)), "scroll needs to or by");
  assert.ok(bad([{ scroll: { to: 1, by: 2 } }]).length, "scroll not both");
  assert.ok(bad([{ mark: "Not Valid" }]).length, "mark name");
  assert.ok(bad([{ mark: "a" }, { mark: "a" }]).some((e) => /duplicate/.test(e)));
  assert.ok(bad([]).length, "steps cannot be empty");
  assert.ok(flowErrors({ url: "file:///etc/passwd", steps: [{ mark: "a" }] }).length, "only http(s) pages");
  assert.ok(bad([{ type: "input[type=password]", text: "x" }]).some((e) => /password/.test(e)), "password selector refused up front");
});

// ---------- consent ----------
test("capture is refused until services.capture is true, and says how to enable it", async () => {
  const dir = project({ capture: false });
  writeJson(join(dir, "flows", "a.json"), { url: "http://127.0.0.1:9/", steps: [{ mark: "m" }] });
  const r = await capture(dir, "a");
  assert.equal(r.code, 1);
  assert.match(r.err, /services\.capture/);
  assert.match(r.err, /"capture": true/);
  assert.ok(!existsSync(join(dir, "capture")), "nothing recorded");
});

test("capture rejects an invalid flow before opening a browser", async () => {
  const dir = project();
  writeJson(join(dir, "flows", "bad.json"), { url: "http://127.0.0.1:9/", steps: [{ type: "#pw", text: "x" }, { click: "" }] });
  const r = await capture(dir, "bad");
  assert.equal(r.code, 1);
  assert.match(r.err, /invalid/);
});

// ---------- recording ----------
test("recording: three clicks give three rects at the real element positions; unchanged flows are not recorded again", { skip: !canRecord && "needs Chrome, FFmpeg and Node 22+" }, async () => {
  await withServer(async (url) => {
    const dir = project();
    writeJson(join(dir, "flows", "demo.json"), { url, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, steps: steps({ mark: "open" }, { click: "#b1" }, { click: "#b2" }, { click: "#b3" }, { type: "#name", text: "Hello", cps: 12 }, { scroll: { by: 50 } }, { mark: "done" }) });
    const r = await capture(dir, "demo");
    assert.equal(r.code, 0, `${r.out}\n${r.err}`);
    const ev = readJson(join(dir, "capture", "demo", "events.json"));
    assert.equal(ev.clicks.length, 4, "three buttons plus the click that focuses the input");
    const want = { "#b1": { x: 140, y: 120, w: 180, h: 64 }, "#b2": { x: 360, y: 280, w: 180, h: 64 }, "#b3": { x: 880, y: 120, w: 180, h: 64 } };
    for (const sel of Object.keys(want)) {
      const c = ev.clicks.find((x) => x.selector === sel);
      assert.ok(c, sel);
      for (const k of ["x", "y", "w", "h"]) assert.ok(Math.abs(c.rect[k] - want[sel][k]) <= 1, `${sel} rect.${k} ${c.rect[k]} vs ${want[sel][k]}`);
      assert.ok(c.x >= c.rect.x && c.x <= c.rect.x + c.rect.w && c.y >= c.rect.y && c.y <= c.rect.y + c.rect.h, `${sel} click lands inside its rect`);
    }
    assert.deepEqual(ev.clicks.map((c) => c.t), [...ev.clicks.map((c) => c.t)].sort((a, b) => a - b));
    assert.equal(ev.types[0].text, "Hello");
    assert.equal(ev.scrolls.length, 1);
    assert.deepEqual(ev.marks.map((m) => m.name), ["open", "done"]);
    // One cursor sample per output frame, constant frame rate.
    assert.equal(ev.cursor.length, Math.round(ev.duration * ev.fps));
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate,r_frame_rate,nb_frames", "-of", "json", join(dir, "capture", "demo", "video.mp4")], { encoding: "utf8" });
    const v = JSON.parse(probe.stdout).streams[0];
    assert.equal(v.avg_frame_rate, `${ev.fps}/1`);
    assert.equal(Number(v.nb_frames), ev.cursor.length);

    const again = await capture(dir, "demo");
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /up to date/);
    writeJson(join(dir, "flows", "demo.json"), { ...readJson(join(dir, "flows", "demo.json")), steps: [{ mark: "open" }, { click: "#b1" }, { mark: "done" }] });
    const changed = await capture(dir, "demo");
    assert.equal(changed.code, 0, changed.err);
    assert.doesNotMatch(changed.out, /up to date/);
    assert.equal(readJson(join(dir, "capture", "demo", "events.json")).clicks.length, 1);
  });
});

test("recording refuses to type into a password field and records nothing", { skip: !canRecord && "needs Chrome, FFmpeg and Node 22+" }, async () => {
  await withServer(async (url) => {
    const dir = project();
    for (const [id, sel] of [["pw", "#pw"], ["pw2", "form input, #pw"]]) {
      writeJson(join(dir, "flows", `${id}.json`), { url, viewport: { width: 1280, height: 720 }, steps: [{ click: "#b1" }, { type: sel, text: "not-a-real-secret" }] });
      const r = await capture(dir, id);
      assert.equal(r.code, 1, r.out);
      assert.match(r.err, /refusing to type into a password field/);
      assert.ok(!existsSync(join(dir, "capture", id, "video.mp4")), "no video from a refused flow");
    }
  });
});

test("recording stays on the flow's origin", { skip: !canRecord && "needs Chrome, FFmpeg and Node 22+" }, async () => {
  await withServer(async (url) => {
    const dir = project();
    writeJson(join(dir, "flows", "away.json"), { url, viewport: { width: 1280, height: 720 }, steps: [{ goto: "http://example.com/" }] });
    const r = await capture(dir, "away");
    assert.equal(r.code, 1);
    assert.match(r.err, /leaves the flow's origin/);
  });
});

// ---------- cursor path ----------
test("cursor moves are deterministic for a seed, arc gently and end on target", () => {
  const a = moveSegment({ x: 10, y: 10 }, { x: 610, y: 410 }, 1, rng(7));
  const b = moveSegment({ x: 10, y: 10 }, { x: 610, y: 410 }, 1, rng(7));
  const c = moveSegment({ x: 10, y: 10 }, { x: 610, y: 410 }, 1, rng(8));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.ctrl, c.ctrl);
  assert.deepEqual(pointAt(a, 0), { x: 10, y: 10 });
  const end = pointAt(a, a.t1 + 5);
  assert.ok(Math.abs(end.x - 610) < 1e-9 && Math.abs(end.y - 410) < 1e-9);
  // Eased: slower at both ends than in the middle.
  const step = (t) => Math.hypot(pointAt(a, t + 0.01).x - pointAt(a, t).x, pointAt(a, t + 0.01).y - pointAt(a, t).y);
  assert.ok(step(a.t0 + 0.01) < step((a.t0 + a.t1) / 2) && step(a.t1 - 0.02) < step((a.t0 + a.t1) / 2));
  assert.deepEqual(cursorAt([a], { x: 10, y: 10 }, 0.5), { x: 10, y: 10 }, "rests at the start before the move");
});

// ---------- screen runtime maths ----------
const viewport = { width: 1280, height: 720 };
const evAt = (...ts) => ({ viewport, duration: 20, cursor: Array.from({ length: 601 }, (_, i) => [i / 30, 100 + i, 200]), drags: [], clicks: ts.map((t, i) => ({ t, x: 200 + i * 400, y: 150, rect: { x: 140 + i * 400, y: 120, w: 180, h: 64 } })), types: [] });
const planFor = (events, W = 1920, H = 1080, extra = {}) => {
  const layout = SCREEN.layout(W, H, viewport, "window");
  return { layout, wps: SCREEN.plan(events, { W, H, from: 0, to: events.duration, zoom: "auto", layout, viewport, ...extra }) };
};
const zoomsOf = (wps) => wps.filter((w) => w.view.zoom > 1);

test("zoom plan: clicks within 1.2 s share one zoom, each zoom holds at least 1.2 s, tiny moves are ignored", () => {
  const apart = planFor(evAt(2, 6)).wps;
  const zooms = (wps) => new Set(zoomsOf(wps).map((w) => w.view));
  assert.equal(zooms(apart).size, 2, "two separated clicks, two zooms");
  assert.ok(apart.some((w) => w.view.zoom === 1 && w.t > 3 && w.t < 6), "the camera shows the whole frame between them");
  assert.equal(zooms(planFor(evAt(2, 3.5)).wps).size, 2, "1.5 s apart: a direct pan between two zooms");
  const near = planFor(evAt(2, 2.8, 3.6)).wps; // 0.8 s apart: one group
  assert.equal(zooms(near).size, 1);
  const lone = planFor(evAt(2)).wps;
  const reached = lone.find((w) => w.view.zoom > 1);
  const held = lone.filter((w) => w.view === reached.view);
  assert.ok(held.at(-1).t - held[0].t >= SCREEN.constants.MIN_HOLD - 1e-9, "minimum zoom hold");
  // Two zooms on practically the same spot: no second zoom move.
  const tiny = planFor({ ...evAt(2, 4.2), clicks: [{ t: 2, x: 200, y: 150, rect: { x: 140, y: 120, w: 180, h: 64 } }, { t: 4.2, x: 202, y: 151, rect: { x: 142, y: 121, w: 180, h: 64 } }] }).wps;
  assert.equal(new Set(zoomsOf(tiny).map((w) => w.view)).size, 1, "tiny move folded into one zoom");
  assert.deepEqual(planFor({ ...evAt(), clicks: [] }).wps.map((w) => w.view.zoom), [1], "no clicks, no zoom");
  assert.equal(SCREEN.plan(evAt(2), { W: 1920, H: 1080, from: 0, to: 20, zoom: "manual", layout: SCREEN.layout(1920, 1080, viewport, "window"), viewport }).length, 1, "manual does not zoom by itself");
});

test("zoom frames follow the click target at 16:9 and are recomputed for 9:16", () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const events = evAt(2);
    const { layout, wps } = planFor(events, W, H);
    const hold = wps.find((w) => w.view.zoom > 1).view;
    const ctx = { frame: { w: W, h: H }, world: { w: W, h: H }, places: {} };
    const view = SCREEN.viewAt(wps, 2, ctx);
    assert.ok(view.zoom > 1.1, `${W}x${H} zoomed at the click`);
    // The clicked rect centre, after the camera transform, sits inside the frame.
    const c = events.clicks[0].rect;
    const sx = layout.video.x + (c.x + c.w / 2) * layout.s, sy = layout.video.y + (c.y + c.h / 2) * layout.s;
    const ox = W / 2 + (sx - view.x) * view.zoom, oy = H / 2 + (sy - view.y) * view.zoom;
    assert.ok(ox > 0 && ox < W && oy > 0 && oy < H, `${W}x${H}: target on screen at (${ox | 0}, ${oy | 0})`);
    // The visible window stays inside the recording where it can.
    assert.ok(layout.video.x + layout.video.w >= layout.video.x + layout.video.w * 0.99);
    if (W < H) assert.ok(layout.video.w <= W - 2 * 48 + 1e-6 && layout.video.y > 0 && layout.video.y + layout.video.h <= H * 0.84 + 1e-6, "portrait layout fits the safe area and keeps the caption zone");
    assert.ok(hold.x >= layout.video.x && hold.x <= layout.video.x + layout.video.w);
  }
});

test("cursor spring is deterministic, lags the raw path a little, and drags use raw data", () => {
  const ev = evAt(2);
  const a = SCREEN.cursorTrack(ev, 0, 10, 0.5), b = SCREEN.cursorTrack(ev, 0, 10, 0.5);
  for (const t of [0.1, 1.5, 4.2, 9.9]) assert.deepEqual(a(t), b(t));
  const raw = SCREEN.cursorTrack(ev, 0, 10, 0);
  const rawAt = (t) => ({ x: 100 + t * 30, y: 200 });
  assert.ok(Math.abs(raw(3).x - rawAt(3).x) < 0.01, "smooth 0 = raw");
  assert.ok(a(3).x < rawAt(3).x && rawAt(3).x - a(3).x < 60, "spring trails the raw pointer a little");
  const dragged = SCREEN.cursorTrack({ ...ev, drags: [{ t0: 0, t1: 10 }] }, 0, 10, 0.9);
  assert.ok(Math.abs(dragged(3).x - rawAt(3).x) < 0.01, "drag span = raw data");
});

test("motion blur rises with camera speed and is zero when the camera rests", () => {
  const { wps } = planFor(evAt(2));
  const ctx = { frame: { w: 1920, h: 1080 }, world: { w: 1920, h: 1080 }, places: {} };
  const blurs = Array.from({ length: 80 }, (_, i) => SCREEN.blurAt(wps, i * 0.1, ctx, 1));
  assert.ok(Math.max(...blurs) > 0.5, "blur during the zoom move");
  assert.equal(SCREEN.blurAt(wps, 0.2, ctx, 1), 0, "no blur while still");
  assert.equal(SCREEN.blurAt(wps, 3, ctx, 1), 0, "no blur during the hold");
});

// ---------- scene + hash ----------
test("screen scene: needs a capture to scaffold, and its hash follows the flow and the recording", () => {
  const dir = project();
  writeJson(join(dir, "flows", "demo.json"), { url: "http://127.0.0.1:9/", steps: [{ mark: "a" }, { click: "#b" }, { mark: "b" }] });
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [{ id: "s01", title: "Demo", type: "screen", duration: 4, mode: "screen-cinema", screen: { flow: "demo", from_mark: "a", to_mark: "b" }, lines: [] }] });
  assert.equal(run("prepare-project.mjs", dir).code, 0);
  const missing = run("new-scene.mjs", dir, "s01");
  assert.equal(missing.code, 1);
  assert.match(missing.err, /capture-screen\.mjs/);
  // A recording with the shape capture-screen writes (timings only matter for the span).
  mkdirSync(join(dir, "capture", "demo"), { recursive: true });
  const events = { version: 1, flow: "demo", url: "http://127.0.0.1:9/", fps: 30, viewport, seed: 1, duration: 8, cursor: [[0, 10, 10]], clicks: [], hovers: [], types: [], scrolls: [], marks: [{ name: "a", t: 1 }, { name: "b", t: 6 }], drags: [] };
  writeFileSync(join(dir, "capture", "demo", "events.json"), JSON.stringify(events));
  writeFileSync(join(dir, "capture", "demo", "video.mp4"), "video-v1");
  const made = run("new-scene.mjs", dir, "s01");
  assert.equal(made.code, 0, made.err);
  const html = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
  assert.match(html, /data-media-start="1"/);
  assert.match(html, /data-duration="4"/);
  assert.match(html, /<video[^>]*src="\.\.\/capture\/demo\/video\.mp4"[^>]*muted/);
  assert.match(html, /rel="x-flow" href="\.\.\/flows\/demo\.json"/);
  assert.equal(run("validate.mjs", dir).code, 0, run("validate.mjs", dir).out);

  const hash = () => {
    const p = loadProject(dir);
    return sceneHash(p, p.storyboard.scenes[0]);
  };
  const h0 = hash();
  assert.equal(hash(), h0, "stable");
  writeFileSync(join(dir, "capture", "demo", "video.mp4"), "video-v2");
  const h1 = hash();
  assert.notEqual(h1, h0, "a new recording re-renders the scene");
  writeFileSync(join(dir, "capture", "demo", "events.json"), JSON.stringify({ ...events, clicks: [{ t: 2, x: 1, y: 1, rect: { x: 0, y: 0, w: 1, h: 1 }, selector: "#b" }] }));
  const h2 = hash();
  assert.notEqual(h2, h1, "events change the hash");
  writeJson(join(dir, "flows", "demo.json"), { url: "http://127.0.0.1:9/", steps: [{ mark: "a" }, { click: "#c" }, { mark: "b" }] });
  assert.notEqual(hash(), h2, "the flow is part of the hash");

  // A scene longer than the recording between its marks is caught.
  const sb = readJson(join(dir, "storyboard.json"));
  sb.scenes[0].duration = 9;
  writeJson(join(dir, "storyboard.json"), sb);
  const long = run("validate.mjs", dir);
  assert.equal(long.code, 1);
  assert.match(long.out, /recording between the marks/);
});
