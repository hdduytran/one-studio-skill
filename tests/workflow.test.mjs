import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, run, scene, tmp, writeJson } from "./helpers.mjs";

function freshProject(extra = []) {
  const base = tmp();
  const dir = join(base, "videos", "ep1");
  const r = run("init-project.mjs", dir, "--title", "Thử nghiệm", ...extra);
  assert.equal(r.code, 0, r.err);
  return { base, dir };
}

const fillMd = (dir, file) => {
  const p = join(dir, file);
  writeFileSync(p, readFileSync(p, "utf8").replace(/<!--\s*TODO[^>]*-->/g, "ok").replace(/<!--[\s\S]*?-->/g, ""));
};

test("init creates a valid project that resumes at the brief gate", () => {
  const { dir } = freshProject();
  for (const f of ["brief.md", "script.md", "storyboard.json", "studio.json", "brand/brand.json", "scenes", "out/scenes"]) {
    assert.ok(existsSync(join(dir, f)), f);
  }
  assert.equal(run("validate.mjs", dir).code, 0);
  const s = JSON.parse(run("status.mjs", dir, "--json").out);
  assert.equal(s.current, "brief");
  assert.equal(s.format.width, 1920);
  assert.equal(readJson(join(dir, "studio.json")).audio.tts.vi.model, "zerotts");
  assert.equal(run("init-project.mjs", dir).code, 1, "refuses to re-init");
});

test("portrait + English + 3d sets format, OmniVoice and Remotion", () => {
  const { dir } = freshProject(["--aspect", "9:16", "--lang", "en", "--dimension", "3d"]);
  const studio = readJson(join(dir, "studio.json"));
  assert.deepEqual([studio.format.width, studio.format.height], [1080, 1920]);
  assert.equal(studio.engine.default, "remotion");
  assert.equal(studio.audio.tts.vi, undefined);
  assert.equal(studio.audio.tts.default.model, "omnivoice");
});

test("series: second episode reuses the brand kit untouched", () => {
  const base = tmp();
  const ep1 = join(base, "ep1");
  const ep2 = join(base, "ep2");
  assert.equal(run("init-project.mjs", ep1, "--series", "Khoa Học").code, 0);
  const brandPath = join(base, "series", "khoa-hoc", "brand", "brand.json");
  const brand = readJson(brandPath);
  brand.colors.primary = "#123456";
  brand.version = 3;
  writeJson(brandPath, brand);
  const r = run("init-project.mjs", ep2, "--series", "Khoa Học");
  assert.match(r.out, /brand\s+reused/);
  assert.equal(readJson(brandPath).colors.primary, "#123456");
  const s2 = readJson(join(ep2, "studio.json"));
  assert.equal(s2.meta.episode, 2);
  assert.equal(s2.brand.ref, "../series/khoa-hoc/brand/brand.json");
  assert.equal(JSON.parse(run("status.mjs", ep2, "--json").out).brand.version, 3);
  assert.equal(readJson(join(base, "series", "khoa-hoc", "series.json")).episodes.length, 2);
});

test("gates: order, TODO guard, storyboard validation, re-open on edit", () => {
  const { dir } = freshProject();
  assert.match(run("status.mjs", dir, "--approve", "script").err, /Gate 1 \(brief\) is not done/);
  assert.match(run("status.mjs", dir, "--approve", "brief").err, /TODO placeholders/);
  fillMd(dir, "brief.md");
  assert.equal(run("status.mjs", dir, "--approve", "brief").code, 0);
  fillMd(dir, "script.md");
  assert.equal(run("status.mjs", dir, "--approve", "script").code, 0);

  const sb = join(dir, "storyboard.json");
  assert.match(run("status.mjs", dir, "--approve", "storyboard").err, /no scenes/);
  writeJson(sb, { version: 1, scenes: [scene("s01"), scene("s01"), scene("s02", "character")] });
  const bad = run("status.mjs", dir, "--approve", "storyboard").err;
  assert.match(bad, /duplicate scene ids s01/);
  assert.match(bad, /character scene needs character.style/);

  writeJson(sb, { version: 1, scenes: [scene("s01"), scene("s02", "diagram")] });
  const ok = run("status.mjs", dir, "--approve", "storyboard");
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /scenes added: s01, s02/);
  assert.deepEqual(readJson(join(dir, "studio.json")).scenes.map((s) => s.status), ["planned", "planned"]);
  assert.equal(JSON.parse(run("status.mjs", dir, "--json").out).current, "estimate");

  // Editing the approved script re-opens gate 2 and blocks later approvals.
  writeFileSync(join(dir, "script.md"), readFileSync(join(dir, "script.md"), "utf8") + "\n- Một câu mới.\n");
  const s = JSON.parse(run("status.mjs", dir, "--json").out);
  assert.equal(s.current, "script");
  assert.ok(s.gates.find((g) => g.id === "script").stale);
  assert.match(run("status.mjs", dir, "--approve", "estimate").err, /changed after gate 2/);
  assert.match(run("status.mjs", dir).out, /! +2 Script/);
});

test("storyboard re-approval keeps existing scene state and drops removed scenes", () => {
  const { dir } = freshProject();
  fillMd(dir, "brief.md");
  fillMd(dir, "script.md");
  run("status.mjs", dir, "--approve", "brief");
  run("status.mjs", dir, "--approve", "script");
  const sb = join(dir, "storyboard.json");
  writeJson(sb, { version: 1, scenes: [scene("s01"), scene("s02")] });
  run("status.mjs", dir, "--approve", "storyboard");
  const studioPath = join(dir, "studio.json");
  const studio = readJson(studioPath);
  Object.assign(studio.scenes[0], { hash: "abc", approved_hash: "abc", status: "rendered", clip: "out/scenes/s01-abc.mp4" });
  writeJson(studioPath, studio);
  writeJson(sb, { version: 1, scenes: [scene("s01"), scene("s03")] });
  const r = run("status.mjs", dir, "--approve", "storyboard");
  assert.match(r.out, /added: s03/);
  assert.match(r.out, /removed: s02/);
  const after = readJson(studioPath).scenes;
  assert.deepEqual(after.map((s) => s.id), ["s01", "s03"]);
  assert.equal(after[0].status, "rendered");

  const e = JSON.parse(run("status.mjs", dir, "--estimate", "--json").out);
  assert.equal(e.cached, 1);
  assert.equal(e.toBuild, 1);
  assert.deepEqual(e.scenes[0].tokens, [0, 0]);
});

test("estimate: table, references, warnings for many / heavy scenes", () => {
  const { dir } = freshProject();
  const scenes = Array.from({ length: 9 }, (_, i) => scene(`s${String(i + 1).padStart(2, "0")}`));
  scenes.push(scene("s10", "3d"), scene("s11", "character", { character: { style: "whiteboard" } }));
  scenes.push(scene("s12", "explainer", { explainer: { size: "hero" } }));
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes });

  const table = run("status.mjs", dir, "--estimate");
  assert.equal(table.code, 0, table.err);
  assert.match(table.out, /\| s10 \| 3d \| remotion \| high \|/);
  assert.match(table.out, /\| s11 \| character \| lemo \|/);
  assert.match(table.out, /⚠ 12 scenes to build \(> 8\)/);
  assert.match(table.out, /⚠ heavy scene types: 3d, character, explainer/);
  assert.match(table.out, /hero/);
  assert.match(table.out, /TTS .*12 sentence calls.*ask before first call/);

  const e = JSON.parse(run("status.mjs", dir, "--estimate", "--json").out);
  assert.equal(e.toBuild, 12);
  assert.ok(e.tokens[1] > e.tokens[0]);
  assert.ok(e.references.some((r) => r.path.endsWith("3d.md")));
  assert.equal(new Set(e.references.map((r) => r.path)).size, e.references.length, "each reference counted once");
});

test("validate.mjs: single-file mode and errors", () => {
  assert.equal(run("validate.mjs", "examples/demo/storyboard.json").code, 0);
  assert.equal(run("validate.mjs", "examples/demo/brand/brand.json").code, 0);
  assert.equal(run("validate.mjs", "examples/demo/studio.json").code, 0);
  const base = tmp();
  const p = join(base, "storyboard.json");
  writeJson(p, { version: 1, scenes: [{ id: "x", type: "nope", duration: 1 }] });
  const r = run("validate.mjs", p, "--json");
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.out).ok, false);
});
