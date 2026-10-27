// Draft preview outside the gates, review labels, chapters, the assemble no-overwrite fix, --at stills,
// readable sheets and scene-script warnings. No HyperFrames needed: a stub renderer makes the raw clips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPTS, run, scene, tmp, writeJson } from "./helpers.mjs";

const { draftPreview, assemble } = await import(join(SCRIPTS, "concat-and-mix.mjs"));
const { injectReviewLabel, planDraft, chapterMetadata } = await import(join(SCRIPTS, "lib", "draft.mjs"));
const { encodeSettings, normalize, probe } = await import(join(SCRIPTS, "lib", "ffmpeg.mjs"));
const { loadProject } = await import(join(SCRIPTS, "lib", "project.mjs"));
const { parseAt } = await import(join(SCRIPTS, "keyframe-stills.mjs"));
const { contactSheets, overviewSheets } = await import(join(SCRIPTS, "lib", "contact-sheet.mjs"));
const { sceneScriptWarnings } = await import(join(SCRIPTS, "lib", "scene-lint.mjs"));

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ffmpeg = (...a) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...a]);

const sceneHtml = (id, d) => `<!doctype html><html><body>
<div id="root" class="os-scene" data-composition-id="${id}" data-start="0" data-duration="${d}" data-width="1920" data-height="1080">
  <h1 class="os-display" data-line="${id}-1">Hi</h1>
</div>
<script>
  const S = OS.scene("${id}");
  S.words(".os-display", { at: 0.3 })
  S.done();
</script>
</body></html>
`;

function project() {
  const dir = join(tmp(), "d");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi", "--captions", "none").code, 0);
  writeJson(join(dir, "storyboard.json"), {
    version: 1,
    scenes: [scene("s01", "text", { duration: 2, title: "Mở đầu" }), scene("s02", "text", { duration: 1.5, title: "Kết" })],
  });
  writeFileSync(join(dir, "scenes", "s01.html"), sceneHtml("s01", 2));
  writeFileSync(join(dir, "scenes", "s02.html"), sceneHtml("s02", 1.5));
  return dir;
}

// Stub for the engine: records what it was given and writes a raw clip of the scene's length.
function stubRenderer(seen) {
  return (project, sc, raw, { mode, root }) => {
    const html = readFileSync(join(root, "scenes", `${sc.id}.html`), "utf8");
    seen.push({ id: sc.id, mode, root, labelled: html.includes("one-studio draft review label"), html });
    ffmpeg("-f", "lavfi", "-i", `testsrc=size=1920x1080:rate=30:duration=${sc.duration}`, "-pix_fmt", "yuv420p", raw);
  };
}

test("review label: injected before S.done() in the staged copy only, above the veil, timeline-driven", () => {
  const html = sceneHtml("s01", 2);
  const info = { id: "s01", title: "Mở đầu", start: 4.5, duration: 2, lines: [{ id: "s01-1", start: 0.3, end: 1.4 }] };
  const out = injectReviewLabel(html, info, { height: 1080 });
  assert.ok(out.indexOf("one-studio draft review label") < out.lastIndexOf("S.done()"));
  assert.match(out, /;\/\* one-studio draft review label/, "leading semicolon guards the previous statement");
  assert.match(out, /z-index:2147483000/);
  assert.match(out, /S\.tl\.to\(p, \{ t: S\.dur/);
  assert.match(out, /\}\)\(S\);/);
  assert.match(out, /"start":4\.5/);
  assert.equal(injectReviewLabel("<script>console.log(1)</script>", info), null, "no OS.scene → no label");
  const other = injectReviewLabel('<script>const scn = OS.scene("x"); scn.enter(".a"); scn.done();</script>', info);
  assert.match(other, /\}\)\(scn\);\nscn\.done\(\)/);
});

test("draft preview: renders unapproved scenes, assembles with chapters, never touches studio.json or scene files", () => {
  const dir = project();
  const studioBefore = readFileSync(join(dir, "studio.json"), "utf8");
  const sources = ["s01", "s02"].map((id) => sha(join(dir, "scenes", `${id}.html`)));
  const seen = [];
  const r = draftPreview(dir, { labels: true, renderer: stubRenderer(seen) });
  assert.deepEqual(seen.map((s) => [s.id, s.mode, s.labelled]), [["s01", "preview", true], ["s02", "preview", true]]);
  assert.ok(seen.every((s) => !s.root.startsWith(join(dir, "scenes"))), "rendered from a staged copy");
  assert.match(seen[1].html, /"start":2,/, "s02 label knows its place in the video");
  assert.equal(readFileSync(join(dir, "studio.json"), "utf8"), studioBefore, "studio.json untouched");
  assert.deepEqual(["s01", "s02"].map((id) => sha(join(dir, "scenes", `${id}.html`))), sources, "scene sources untouched");
  assert.ok(!readFileSync(join(dir, "scenes", "s01.html"), "utf8").includes("review label"));
  assert.ok(r.out.endsWith("-draft-labels.mp4"));
  assert.equal(r.rendered, 2);
  assert.equal(r.video.height, encodeSettings(loadProject(dir).studio, "preview").height);
  const chapters = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_chapters", "-of", "json", r.out], { encoding: "utf8" })).chapters;
  assert.deepEqual(chapters.map((c) => c.tags.title), ["s01 · Mở đầu", "s02 · Kết"]);
  assert.deepEqual(chapters.map((c) => Number(c.start_time)), [0, 2]);

  // Second draft: everything cached, nothing rendered; a plain draft is a different clip set.
  const again = draftPreview(dir, { labels: true, renderer: stubRenderer(seen) });
  assert.equal(again.rendered, 0);
  assert.equal(seen.length, 2);
  const plain = planDraft(loadProject(dir));
  assert.deepEqual(plain.map((p) => p.action), ["render", "render"]);
  assert.equal(readFileSync(join(dir, "studio.json"), "utf8"), studioBefore);
  // The gate commands still refuse: nothing was approved by the draft.
  assert.equal(run("render-changed-scenes.mjs", dir, "--dry-run").code, 2);
  assert.match(run("render-changed-scenes.mjs", dir, "--draft", "--dry-run").out, /draft: 2 rendered\/to render/);
  assert.match(run("concat-and-mix.mjs", dir, "--labels").err, /--labels needs --draft/);
});

test("chapter metadata: escaped titles, clamped to the video", () => {
  const meta = chapterMetadata([{ start: 0, duration: 2, title: "a=b;#c" }, { start: 2, duration: 5, title: "x" }, { start: 9, duration: 1, title: "late" }], 4);
  assert.match(meta, /^;FFMETADATA1\n/);
  assert.match(meta, /title=a\\=b\\;\\#c/);
  assert.match(meta, /START=2000\nEND=4000/);
  assert.doesNotMatch(meta, /late/);
});

test("assemble: mismatched clips are normalised into temp copies, the input clip files stay as they are", () => {
  const dir = project();
  const p = loadProject(dir);
  const settings = encodeSettings(p.studio, "preview");
  const a = join(dir, "out", "a.mp4");
  const b = join(dir, "out", "b.mp4");
  const raw = join(dir, "out", "raw.mp4");
  ffmpeg("-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=1", "-pix_fmt", "yuv420p", raw);
  normalize(raw, a, settings);
  normalize(raw, b, encodeSettings(p.studio, "final")); // a full-size clip in a preview assembly
  const before = sha(b);
  const r = assemble(p, [a, b], settings, join(dir, "out", "mix.mp4"), { captions: false });
  assert.equal(sha(b), before, "input clip not rewritten");
  assert.equal(probe(b).video.height, 1080);
  assert.equal(r.video.height, settings.height);
  assert.ok(Math.abs(r.duration - 2) < 0.1);
  assert.ok(!readdirSync(join(dir, "out")).some((f) => /renorm/.test(f)));
});

test("keyframe-stills --at: argument parsing and checks before any render", () => {
  assert.deepEqual(parseAt("12.4,13.6"), [12.4, 13.6]);
  assert.deepEqual(parseAt(" 1s, .5 ,2"), [1, 0.5, 2]);
  assert.throws(() => parseAt(""), /needs scene times/);
  assert.throws(() => parseAt("1,abc"), /"abc" is not a time/);
  assert.throws(() => parseAt("-1"), /not a time/);
  const dir = project();
  assert.match(run("keyframe-stills.mjs", dir, "--at", "1").err, /needs the scene id/);
  assert.match(run("keyframe-stills.mjs", dir, "s09", "--at", "1").err, /not in storyboard\.json: s09/);
  assert.match(run("keyframe-stills.mjs", dir, "s02", "--at", "1,3").err, /s02 is 1\.5s long: 3s is past its end/);
});

test("contact sheets: at most 12 scenes and 1200 px per file, stale chunks removed", () => {
  const dir = tmp();
  const still = join(dir, "a.png");
  ffmpeg("-f", "lavfi", "-i", "testsrc=size=1920x1080", "-frames:v", "1", still);
  const rows = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, times: [1, 2, 3], stills: [still, still, still] }));
  const files = contactSheets(rows, join(dir, "sheet.jpg"));
  assert.deepEqual(files.map((f) => f.split("/").pop()), ["sheet-1.jpg", "sheet-2.jpg"]);
  for (const f of files) assert.ok(probe(f).video.width <= 1200, `${f} ${probe(f).video.width}px`);
  assert.ok(probe(files[0]).video.height > probe(files[1]).video.height, "12 rows then 2");
  const one = contactSheets(rows.slice(0, 3), join(dir, "sheet.jpg"));
  assert.deepEqual(one.map((f) => f.split("/").pop()), ["sheet.jpg"]);
  assert.ok(!existsSync(join(dir, "sheet-1.jpg")), "stale chunk removed");
  const grid = overviewSheets(Array.from({ length: 14 }, (_, i) => ({ still, label: `s${i}` })), join(dir, "sheet-9x16.jpg"));
  assert.equal(grid.length, 2);
  for (const f of grid) assert.ok(probe(f).video.width <= 1200);
});

test("validate: warns about non-literal L(...) ids and a top-level top, never fails on them", () => {
  const w = sceneScriptWarnings(`<script>
const S = OS.scene("s01");
const L = (id) => S.line(id, 1);
const top = 100;
function f() { const top = 1; }
S.enter(".a", { at: L("s01-1") });
S.enter(".b", { at: L(ids[0]) });
// L(commented)
S.done();
</script><script type="application/json" id="os-lines">{"x":"L(y)"}</script>`);
  assert.equal(w.length, 2, w.join("\n"));
  assert.match(w[0], /L\(ids\[0\]\)/);
  assert.match(w[1], /top-level "const top"/);
  const dir = project();
  writeFileSync(join(dir, "scenes", "s02.html"), sceneHtml("s02", 1.5).replace('const S = OS.scene("s02");', 'const S = OS.scene("s02"); let top = 3; S.enter(".x", { at: L(n) });'));
  const r = run("validate.mjs", dir);
  assert.match(r.out, /! scene s02: L\(n\)/);
  assert.match(r.out, /! scene s02: top-level "let top"/);
  assert.doesNotMatch(r.out, /scene s01:/);
  assert.equal(r.code, 0, "warnings only");
});
