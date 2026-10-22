// Continuous world with real renders: two scenes in one world meet at a seam, and edits re-render only what they touch.
// Run: HYPERFRAMES_BROWSER_PATH=<headless_shell> npm run test:e2e
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, tmp, writeJson } from "../helpers.mjs";

const execFileP = promisify(execFile);
async function sh(script, ...args) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: process.env, maxBuffer: 32 << 20 });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { code: e.code, out: e.stdout, err: e.stderr };
  }
}
async function ok(script, ...args) {
  const r = await sh(script, ...args);
  assert.equal(r.code, 0, `${script} ${args.join(" ")}\n${r.out}\n${r.err}`);
  return r.out;
}
const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
const fillMd = (dir, f) => writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace(/<!--[\s\S]*?-->/g, "ok"));

test("two scenes in one world: seam under threshold, edits re-render only the touched scenes", { skip: !chrome && "no Chrome for HyperFrames" }, async () => {
  const dir = join(tmp(), "world");
  await ok("init-project.mjs", dir, "--title", "World", "--duration", "4");
  fillMd(dir, "brief.md");
  fillMd(dir, "script.md");
  writeJson(join(dir, "storyboard.json"), {
    version: 1,
    worlds: { city: { file: "worlds/city.html", size: { w: 4000, h: 2400 } } },
    scenes: [
      { id: "s01", title: "Một", type: "text", duration: 2, mode: "world-camera", world: "city", camera: { from: "start", to: "middle", move: "fly" }, exit_state: { beacon: "signal" }, lines: [] },
      { id: "s02", title: "Hai", type: "text", duration: 2, mode: "world-camera", world: "city", camera: { from: "middle", to: "end" }, lines: [] },
    ],
  });
  for (const g of ["brief", "script", "storyboard", "estimate"]) await ok("status.mjs", dir, "--approve", g);
  await ok("prepare-project.mjs", dir);
  await ok("new-scene.mjs", dir, "--all");
  assert.ok(existsSync(join(dir, "worlds", "city.html")), "world file started from the template");
  const s1 = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
  assert.match(s1, /data-transition-out="cut"/);
  assert.match(readFileSync(join(dir, "scenes", "s02.html"), "utf8"), /data-transition-in="cut"/);
  assert.equal((await sh("validate.mjs", dir)).code, 0);

  const stills = await ok("keyframe-stills.mjs", dir, "--no-exports");
  assert.match(stills, /s01 → s02\s+world\s+diff/);
  assert.ok(existsSync(join(dir, "review", "seams.jpg")));
  const seam = await ok("seam-check.mjs", dir, "--threshold", "0.02");
  const diff = Number(/diff ([\d.]+)%/.exec(seam)[1]);
  assert.ok(diff < 2, `seam diff ${diff}%`);

  // A camera that ends elsewhere than the next scene starts is caught.
  writeFileSync(join(dir, "scenes", "s02.html"), readFileSync(join(dir, "scenes", "s02.html"), "utf8").replace(/data-camera="[^"]*"/, 'data-camera="{&quot;from&quot;:&quot;end&quot;,&quot;to&quot;:&quot;end&quot;}"'));
  const bad = await sh("seam-check.mjs", dir, "--threshold", "0.02");
  assert.equal(bad.code, 1, bad.out);
  await ok("new-scene.mjs", dir, "s02", "--force");

  await ok("status.mjs", dir, "--approve-scenes", "all");
  await ok("status.mjs", dir, "--approve", "keyframes");
  const first = JSON.parse(await ok("render-changed-scenes.mjs", dir, "--preview", "--json"));
  assert.deepEqual(first.map((x) => x.action), ["render", "render"]);

  // Edit scene 2 only.
  writeFileSync(join(dir, "scenes", "s02.html"), readFileSync(join(dir, "scenes", "s02.html"), "utf8").replace("S.done();", 'S.enter(".os-h2", { at: 0.5, kind: "fade" });\n  S.done();'));
  await ok("status.mjs", dir, "--approve-scenes", "s02");
  const second = JSON.parse(await ok("render-changed-scenes.mjs", dir, "--preview", "--json"));
  assert.deepEqual(second.filter((x) => x.action === "render").map((x) => x.id), ["s02"]);

  // Edit the world: both scenes depend on it.
  writeFileSync(join(dir, "worlds", "city.html"), readFileSync(join(dir, "worlds", "city.html"), "utf8") + "\n<!-- edited -->\n");
  await ok("status.mjs", dir, "--approve-scenes", "all");
  const third = JSON.parse(await ok("render-changed-scenes.mjs", dir, "--preview", "--json"));
  assert.deepEqual(third.filter((x) => x.action === "render").map((x) => x.id), ["s01", "s02"]);
});
