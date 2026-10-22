import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tmp, writeJson } from "./helpers.mjs";
import { seamPairs, visualRefErrors, worldNeighbours } from "../plugins/one-studio/skills/one-studio/scripts/lib/visual-refs.mjs";
import { sceneHash } from "../plugins/one-studio/skills/one-studio/scripts/lib/hash.mjs";
import { loadProject } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";

const ASSETS = "plugins/one-studio/skills/one-studio/templates/hyperframes-project/assets";
// camera.js is a browser script (UMD); load it the way a script tag would, without a package type clash.
const CAM = (() => {
  const mod = { exports: {} };
  new Function("module", readFileSync(join(ASSETS, "camera.js"), "utf8"))(mod);
  return mod.exports;
})();

const places = { a: { x: 400, y: 800, w: 800, h: 800 }, wide: { x: 1000, y: 1000, w: 1600, h: 200 } };
const ctxFor = (w, h) => ({ frame: { w, h }, world: { w: 4000, h: 2400 }, places });
const screenRect = (view, ctx, p) => {
  const sc = view.zoom * CAM.contain(ctx);
  return { x: (p.x - view.x) * sc + ctx.frame.w / 2, y: (p.y - view.y) * sc + ctx.frame.h / 2, w: p.w * sc, h: p.h * sc };
};

test("a place fills the frame at 16:9, 9:16 and 1:1", () => {
  for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
    const ctx = ctxFor(w, h);
    for (const id of ["a", "wide"]) {
      const r = screenRect(CAM.viewOf(id, ctx), ctx, places[id]);
      assert.ok(Math.abs(r.x + r.w / 2 - w / 2) < 1e-6 && Math.abs(r.y + r.h / 2 - h / 2) < 1e-6, `${id} centred at ${w}x${h}`);
      assert.ok(r.w <= w + 1e-6 && r.h <= h + 1e-6, `${id} inside the frame`);
      assert.ok(Math.abs(Math.max(r.w / w, r.h / h) - CAM.FILL) < 1e-9, `${id} fills ${CAM.FILL} of the tighter axis`);
    }
  }
});

test("free targets and bad targets", () => {
  const ctx = ctxFor(1920, 1080);
  assert.deepEqual(CAM.viewOf({ x: 5, y: 6 }, ctx), { x: 5, y: 6, zoom: 1 });
  assert.throws(() => CAM.viewOf("nowhere", ctx), /no \[data-place="nowhere"\]/);
  assert.throws(() => CAM.viewOf({ x: 1, y: 2, zoom: 0 }, ctx), /zoom/);
  assert.throws(() => CAM.viewOf(42, ctx), /place id/);
});

test("moves start and end exactly on their views, zoom is log-even, cut jumps", () => {
  const ctx = ctxFor(1920, 1080);
  const a = { x: 400, y: 800, zoom: 1 };
  const b = { x: 3500, y: 1200, zoom: 64 };
  for (const move of ["push", "fly", "orbit", "follow"]) {
    assert.deepEqual(CAM.sample(a, b, 0, move, ctx), { ...a, rot: 0 });
    assert.deepEqual(CAM.sample(a, b, 1, move, ctx), { ...b, rot: 0 });
  }
  const mid = CAM.sample(a, b, 0.5, "follow", ctx);
  assert.ok(Math.abs(mid.zoom - 8) < 1e-9, "halfway of 1x..64x is 8x");
  const ratios = [0, 1, 2, 3].map((i) => CAM.sample(a, b, (i + 1) / 4, "push", ctx).zoom / CAM.sample(a, b, i / 4 || 1e-9, "push", ctx).zoom);
  assert.ok(Math.abs(ratios[2] - ratios[3]) < 1e-6, "equal zoom factor per equal time step");
  assert.deepEqual(CAM.sample(a, b, 0.7, "cut", ctx), { ...a, rot: 0 });
  assert.ok(CAM.sample(a, b, 0.5, "orbit", ctx).rot > 0);
  assert.ok(CAM.sample({ ...a, zoom: 2 }, { ...b, zoom: 2 }, 0.5, "fly", ctx).zoom < 2, "fly pulls back mid-flight");
});

test("transform centres the view and follows the frame size", () => {
  const ctx = ctxFor(1080, 1920);
  const t = CAM.transform({ x: 100, y: 200, zoom: 2 }, ctx);
  const sc = 2 * Math.min(1080 / 4000, 1920 / 2400);
  assert.equal(t, `translate(540px,960px) rotate(0deg) scale(${sc}) translate(-100px,-200px)`);
});

const sb = (scenes) => ({ version: 1, worlds: { city: { file: "worlds/city.html", size: { w: 4000, h: 2400 } }, sea: { file: "worlds/sea.html", size: { w: 4000, h: 2400 } } }, scenes });
const sc = (id, extra = {}) => ({ id, type: "text", duration: 3, world: "city", ...extra });

test("continuity: camera.to must equal the next camera.from, message names both scenes", () => {
  const bad = sb([sc("s01", { camera: { from: "a", to: "b" } }), sc("s02", { camera: { from: "c", to: "d" } })]);
  const msg = visualRefErrors(bad).join("\n");
  assert.match(msg, /s01 -> s02/);
  assert.match(msg, /s01 camera\.to "b" must equal s02 camera\.from "c"/);
  assert.deepEqual(visualRefErrors(sb([sc("s01", { camera: { from: "a", to: { x: 1, y: 2, zoom: 3 } } }), sc("s02", { camera: { from: { zoom: 3, y: 2, x: 1 }, to: "d" } })])), []);
});

test("continuity: exit_state must equal the next enter_state; other worlds are free", () => {
  const bad = sb([sc("s01", { exit_state: { sat: "signal" } }), sc("s02", { enter_state: { sat: "idle" } })]);
  assert.match(visualRefErrors(bad).join("\n"), /s01 exit_state .* must equal s02 enter_state/);
  assert.deepEqual(visualRefErrors(sb([sc("s01", { exit_state: { sat: "signal" } }), sc("s02", { enter_state: { sat: "signal" } })])), []);
  const apart = sb([sc("s01", { camera: { from: "a", to: "b" } }), sc("s02", { world: "sea", camera: { from: "x", to: "y" } })]);
  assert.deepEqual(visualRefErrors(apart), []);
});

test("neighbours and seam pairs", () => {
  const s = sb([sc("s01", { exit_state: { sat: "signal" } }), sc("s02"), sc("s03", { world: "sea", handoff: { selector: "#m", to_scene: "s04" } }), sc("s04", { world: undefined })]);
  assert.deepEqual(worldNeighbours(s, "s01"), { prev: false, next: true, prevExit: null });
  assert.deepEqual(worldNeighbours(s, "s02"), { prev: true, next: false, prevExit: { sat: "signal" } });
  assert.deepEqual(seamPairs(s), [{ a: "s01", b: "s02", kind: "world" }, { a: "s03", b: "s04", kind: "handoff" }]);
});

function project(scenes) {
  const dir = join(tmp(), "p");
  assert.equal(run("init-project.mjs", dir).code, 0);
  writeJson(join(dir, "storyboard.json"), sb(scenes));
  assert.equal(run("prepare-project.mjs", dir, "--offline").code, 0);
  return dir;
}

test("new-scene starts the world file, forces cuts between same-world scenes and links the world", () => {
  const dir = project([sc("s01", { camera: { from: "start", to: "middle" }, exit_state: { beacon: "signal" } }), sc("s02", { camera: { from: "middle", to: "end" } }), sc("s03", { world: "sea" })]);
  assert.ok(existsSync(join(dir, "assets", "camera.js")));
  const r = run("new-scene.mjs", dir, "--all");
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, "worlds", "city.html")) && existsSync(join(dir, "worlds", "sea.html")));
  const html = (id) => readFileSync(join(dir, "scenes", `${id}.html`), "utf8");
  assert.match(html("s01"), /data-transition-in="fade" data-transition-out="cut"/);
  assert.match(html("s02"), /data-transition-in="cut" data-transition-out="fade"/);
  assert.match(html("s02"), /data-enter-state="\{&quot;beacon&quot;:&quot;signal&quot;\}"/, "starts where the previous scene left the world");
  assert.match(html("s03"), /data-transition-in="fade"/, "other world: normal transition");
  assert.match(html("s01"), /<link rel="x-world" href="\.\.\/worlds\/city\.html" \/>/);
  assert.match(html("s01"), /camera\.js/);

  // The scene hash follows the world file; a scene in another world is untouched.
  const p = loadProject(dir);
  const [h1, h3] = [sceneHash(p, p.storyboard.scenes[0]), sceneHash(p, p.storyboard.scenes[2])];
  writeFileSync(join(dir, "worlds", "city.html"), readFileSync(join(dir, "worlds", "city.html"), "utf8") + "\n<!-- edit -->\n");
  assert.notEqual(sceneHash(p, p.storyboard.scenes[0]), h1);
  assert.equal(sceneHash(p, p.storyboard.scenes[2]), h3);
  // An existing world file is never overwritten.
  run("new-scene.mjs", dir, "s01", "--force");
  assert.match(readFileSync(join(dir, "worlds", "city.html"), "utf8"), /edit/);
});

test("validate rejects a fade between same-world scenes and a broken camera chain", () => {
  const dir = project([sc("s01", { camera: { from: "a", to: "b" } }), sc("s02", { camera: { from: "b", to: "c" } })]);
  run("new-scene.mjs", dir, "--all");
  assert.equal(run("validate.mjs", dir).code, 0);
  const f = join(dir, "scenes", "s01.html");
  writeFileSync(f, readFileSync(f, "utf8").replace('data-transition-out="cut"', 'data-transition-out="fade"'));
  const bad = run("validate.mjs", dir);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /scene s01: data-transition-out="fade" between s01 and s02 .* must be "cut"/);
  writeJson(join(dir, "storyboard.json"), sb([sc("s01", { camera: { from: "a", to: "b" } }), sc("s02", { camera: { from: "z", to: "c" } })]));
  assert.match(run("validate.mjs", dir).out, /s01 camera\.to "b" must equal s02 camera\.from "z"/);
});

test("seam-check reports bad usage", () => {
  assert.equal(run("seam-check.mjs").code, 1);
  const dir = project([sc("s01"), sc("s02")]);
  assert.equal(run("seam-check.mjs", dir, "--threshold", "-1").code, 1);
  assert.equal(run("seam-check.mjs", dir, "--pairs", "s01:s09").code, 1);
});
