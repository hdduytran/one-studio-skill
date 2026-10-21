// 0.3.0: music/SFX, caption modes, FFmpeg fallbacks, VO sync, ratio-scoped CSS, voices, presets, glass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, run, scene, tmp, writeJson } from "./helpers.mjs";
import { startMockTts } from "./mock-tts-server.mjs";
import { loadProject, validateKind } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { renderBed, keyOffset, wavBytes } from "../plugins/one-studio/skills/one-studio/scripts/lib/music.mjs";
import { SFX_NAMES, makeSfx, placeCues } from "../plugins/one-studio/skills/one-studio/scripts/lib/sfx.mjs";
import { captionMode, captionSetting } from "../plugins/one-studio/skills/one-studio/scripts/lib/captions.mjs";
import { sceneHash, sceneText } from "../plugins/one-studio/skills/one-studio/scripts/lib/hash.mjs";
import { variantHash } from "../plugins/one-studio/skills/one-studio/scripts/lib/variants.mjs";
import { gateInputHash, gateProblems } from "../plugins/one-studio/skills/one-studio/scripts/lib/gates.mjs";
import { writeLineTimes } from "../plugins/one-studio/skills/one-studio/scripts/lib/scenes.mjs";
import { applyPreset, PRESET_NAMES } from "../plugins/one-studio/skills/one-studio/scripts/lib/presets.mjs";
import { brandToCss } from "../plugins/one-studio/skills/one-studio/scripts/brand-to-css.mjs";
import { parseThumbFrame } from "../plugins/one-studio/skills/one-studio/scripts/publish.mjs";

const execFileP = promisify(execFile);
async function runAsync(script, ...args) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: process.env });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { code: e.code, out: e.stdout, err: e.stderr };
  }
}

// FFmpeg without drawtext (freetype) and libass, like Homebrew FFmpeg 8 core.
function ffmpegShim() {
  const dir = join(tmp(), "shim");
  mkdirSync(dir);
  const real = spawnSync("sh", ["-c", "command -v ffmpeg"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(join(dir, "ffmpeg"), `#!/bin/sh
for a in "$@"; do [ "$a" = "-filters" ] && { "${real}" "$@" | grep -vE '^ [A-Z.|]{3} +(drawtext|subtitles|ass) '; exit 0; }; done
for a in "$@"; do case "$a" in *drawtext=*|*subtitles=*) echo "No such filter" >&2; exit 8;; esac; done
exec "${real}" "$@"
`);
  chmodSync(join(dir, "ffmpeg"), 0o755);
  return dir;
}

function project(extra = {}) {
  const dir = join(tmp(), "p");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi", ...(extra.init ?? [])).code, 0);
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: extra.scenes ?? [scene("s01", "text", { duration: 4 })] });
  for (const s of extra.scenes ?? [scene("s01", "text", { duration: 4 })]) {
    writeFileSync(join(dir, "scenes", `${s.id}.html`), extra.html?.[s.id] ?? `<div id="root" data-composition-id="${s.id}" data-duration="${s.duration}"><p class="clip" data-duration="${s.duration}"></p></div>`);
  }
  return dir;
}

test("music beds: deterministic, whole bars, −3 dBFS peak, loop seam smooth", () => {
  const a = renderBed({ preset: "lofi", length: 5 });
  const b = renderBed({ preset: "lofi", length: 5 });
  assert.equal(a.options.seconds, 9.6, "rounded to whole 4-bar progressions at 100 BPM");
  assert.ok(wavBytes(a.left, a.right).equals(wavBytes(b.left, b.right)), "same options → same bytes");
  let peak = 0;
  for (let i = 0; i < a.left.length; i++) peak = Math.max(peak, Math.abs(a.left[i]), Math.abs(a.right[i]));
  assert.ok(Math.abs(20 * Math.log10(peak) + 3) < 0.01, `peak ${20 * Math.log10(peak)} dBFS`);
  const amb = renderBed({ preset: "ambient" });
  assert.equal(amb.options.seconds, 16);
  const N = amb.left.length;
  let maxStep = 0;
  for (let i = 1; i < N; i++) maxStep = Math.max(maxStep, Math.abs(amb.left[i] - amb.left[i - 1]));
  assert.ok(Math.abs(amb.left[0] - amb.left[N - 1]) <= maxStep, "no jump at the loop point");
  assert.equal(keyOffset("D"), 2);
  assert.equal(keyOffset("Bb"), -2);
  assert.throws(() => renderBed({ preset: "polka" }), /unknown preset/);
});

test("SFX kit: every built-in renders, byte-identical on re-render; cues place by scene and line", () => {
  const out = join(tmp(), "sfx");
  for (const n of SFX_NAMES) assert.ok(existsSync(makeSfx(n, out)));
  const first = readFileSync(join(out, "whoosh.wav"));
  makeSfx("whoosh", out, { force: true });
  assert.ok(first.equals(readFileSync(join(out, "whoosh.wav"))));

  const dir = project({ scenes: [scene("s01", "text", { duration: 4, sfx: [{ name: "pop", at: 0.5 }] }), scene("s02", "text", { duration: 3, sfx: [{ name: "ding", line: "s02-1", at: 0.2, gain: -6 }] })] });
  assert.deepEqual(validateKind("storyboard", readJson(join(dir, "storyboard.json"))), []);
  const cues = placeCues(loadProject(dir), new Map([["s01", 0], ["s02", 4]]), new Map([["s02-1", 0.3]]));
  assert.deepEqual(cues.map((c) => [c.name, c.time, c.gain]), [["pop", 0.5, 0], ["ding", 4.5, -6]]);
  assert.ok(existsSync(join(dir, "assets", "sfx", "ding.wav")), "built-ins rendered on demand");
  const bad = validateKind("storyboard", { version: 1, scenes: [scene("s01", "text", { sfx: [{ at: 1 }, { name: "boing", at: 0 }, { name: "pop", src: "a.wav", at: 0 }] })] });
  assert.equal(bad.length >= 3, true, bad.join("\n"));
});

test("caption choice: studio overrides brand, none, burn falls back to mux without libass", () => {
  const dir = project();
  const p = () => loadProject(dir);
  assert.equal(captionSetting(p()), "burn");
  assert.equal(captionMode(p(), { libass: false }), "mux");
  const warn = [];
  captionMode(p(), { libass: false, warn: (m) => warn.push(m) });
  assert.match(warn[0], /libass/);
  assert.match(run("status.mjs", dir, "--captions", "none").out, /captions: none/);
  assert.deepEqual(readJson(join(dir, "studio.json")).captions, { enabled: false, mode: "none" });
  assert.equal(captionMode(p(), { libass: true }), "none");
  run("status.mjs", dir, "--captions", "sidecar");
  assert.equal(captionSetting(p()), "sidecar");
  assert.equal(run("status.mjs", dir, "--captions", "subtitles").code, 1);

  const d2 = join(tmp(), "q");
  run("init-project.mjs", d2, "--captions", "none");
  assert.equal(readJson(join(d2, "brand", "brand.json")).captions.enabled, false, "new brand kit stores the gate-0 answer");
});

test("build-audio with captions none writes no .srt; VO stretch keeps gates 5–6 and data-line timings land in the scene", async () => {
  const mock = await startMockTts();
  try {
    const html = `<div id="root" data-composition-id="s01" data-duration="2"><h1 data-line="s01-1">A</h1><p class="clip" data-duration="2"></p></div>
<script>
  const S = OS.scene("s01"); S.lines(); S.done();
</script>`;
    const dir = project({ scenes: [scene("s01", "text", { duration: 2, lines: [{ id: "s01-1", text: "Một câu đủ dài để cảnh phải kéo dài thêm." }] })], html: { s01: html } });
    const st = readJson(join(dir, "studio.json"));
    st.audio.tts.vi.base_url = mock.url;
    st.gates.keyframes = { done: true, hash: gateInputHash(loadProject(dir), { id: "keyframes" }) };
    writeJson(join(dir, "studio.json"), st);
    run("status.mjs", dir, "--approve-scenes", "all");
    run("status.mjs", dir, "--captions", "none");
    writeFileSync(join(dir, "captions.srt"), "stale");
    const r = await runAsync("build-audio.mjs", dir, "--allow-tts");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /no captions/);
    assert.ok(!existsSync(join(dir, "captions.srt")), "stale captions removed");
    assert.equal(readJson(join(dir, "audio", "manifest.json")).captions, null);
    const out = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
    assert.match(out, /<script type="application\/json" id="os-lines">\{"s01-1":\{"start":0\.3,"end":[\d.]+\}\}<\/script>\n<script>/);
    assert.doesNotMatch(out, /data-duration="2"/, "scene stretched");
    const p = loadProject(dir);
    assert.equal(p.studio.scenes[0].approved_hash, sceneHash(p, p.storyboard.scenes[0]), "approval kept");
    const status = JSON.parse(run("status.mjs", dir, "--json").out);
    assert.equal(status.gates.find((g) => g.id === "keyframes").stale, false, "gate 5 not re-opened by the VO");
    // music must be decided before the audio gate closes
    assert.ok(gateProblems(loadProject(dir), { id: "audio" }).some((x) => /music not chosen/.test(x)));
    run("make-music.mjs", dir, "--use", "none");
    assert.ok(!gateProblems(loadProject(dir), { id: "audio" }).some((x) => /music/.test(x)));
  } finally {
    mock.close();
  }
});

test("ratio-scoped <style data-ratio> blocks: main hash ignores other ratios, variant hash sees its own", () => {
  const base = `<div id="root" data-composition-id="s01" data-duration="4"></div>`;
  const dir = project({ html: { s01: base } });
  const p = () => loadProject(dir);
  const s = () => p().storyboard.scenes[0];
  const main0 = sceneHash(p(), s());
  const v0 = variantHash(p(), s(), "9:16");
  writeFileSync(join(dir, "scenes", "s01.html"), `<style data-ratio="9:16">#root{font-size:2em}</style>\n${base}`);
  assert.equal(sceneHash(p(), s()), main0, "16:9 approval/clip untouched");
  assert.notEqual(variantHash(p(), s(), "9:16"), v0, "9:16 re-renders");
  assert.equal(variantHash(p(), s(), "1:1"), variantHash(p(), s(), "1:1"));
  assert.equal(sceneText('<style data-ratio="1:1, 9:16">x</style>', { aspect: "9:16" }), '<style data-ratio="1:1, 9:16">x</style>');
  // indented block on its own line, as people write it
  writeFileSync(join(dir, "scenes", "s01.html"), `<head>\n  <style data-ratio="1:1">a{}</style>\n</head>\n${base}`);
  const withHead = sceneHash(p(), s());
  writeFileSync(join(dir, "scenes", "s01.html"), `<head>\n</head>\n${base}`);
  assert.equal(sceneHash(p(), s()), withHead);
  assert.equal(sceneText('a data-duration="4.2" b', { layoutOnly: true }), 'a data-duration="" b');
});

test("writeLineTimes is idempotent and only touches scenes that use data-line", () => {
  const dir = project({ html: { s01: `<p data-line="s01-1"></p>\n<script>\nconst S = OS.scene("s01");\n</script>` } });
  const p = loadProject(dir);
  const sc = p.storyboard.scenes[0];
  assert.equal(writeLineTimes(p, sc, [{ id: "s01-1", start: 0.3, duration: 1 }]), true);
  assert.equal(writeLineTimes(p, sc, [{ id: "s01-1", start: 0.3, duration: 1 }]), false);
  assert.equal(writeLineTimes(p, sc, [{ id: "s01-1", start: 0.5, duration: 1 }]), true);
  assert.equal((readFileSync(join(dir, "scenes", "s01.html"), "utf8").match(/os-lines/g) ?? []).length, 1);
  const d2 = project();
  const p2 = loadProject(d2);
  assert.equal(writeLineTimes(p2, p2.storyboard.scenes[0], [{ id: "s01-1", start: 0.3, duration: 1 }]), false);
});

test("TTS voices: list, rejected placeholder names the real voices, samples need consent, use-voice", async () => {
  const mock = await startMockTts({ voices: ["quangminh", "tiendat", "baotrang"] });
  try {
    const dir = project();
    const st = readJson(join(dir, "studio.json"));
    st.audio.tts.vi.base_url = mock.url;
    writeJson(join(dir, "studio.json"), st);
    const list = await runAsync("tts-openai-compatible.mjs", "--voices", dir);
    assert.match(list.out, /3 voice\(s\).*"default" is NOT one of them/s);
    const fail = await runAsync("build-audio.mjs", dir, "--allow-tts");
    assert.notEqual(fail.code, 0);
    assert.match(fail.err, /Available: quangminh, tiendat, baotrang/);
    const noConsent = await runAsync("tts-openai-compatible.mjs", dir, "--samples", "all");
    assert.equal(noConsent.code, 3);
    const samples = await runAsync("tts-openai-compatible.mjs", dir, "--samples", "quangminh,tiendat", "--allow-tts");
    assert.equal(samples.code, 0, samples.err);
    assert.ok(existsSync(join(dir, "review", "voices", "tiendat.wav")));
    assert.equal(run("tts-openai-compatible.mjs", dir, "--use-voice", "quangminh").code, 0);
    assert.equal(readJson(join(dir, "studio.json")).audio.tts.vi.voice, "quangminh");
    const init = await runAsync("init-project.mjs", join(tmp(), "z"), "--tts-url", mock.url, "--probe-tts");
    assert.match(init.out, /3 on the server: quangminh, tiendat, baotrang/);
  } finally {
    mock.close();
  }
});

test("no drawtext: contact sheet is built unlabelled instead of crashing", () => {
  const shim = ffmpegShim();
  const dir = tmp();
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:d=1", "-frames:v", "1", join(dir, "a.png")]);
  const code = `import { contactSheet, findFont } from ${JSON.stringify(join(SCRIPTS, "keyframe-stills.mjs"))};
    console.log(findFont() === null ? "nofont" : "font");
    contactSheet([{ id: "s01", times: [1, 2], stills: [${JSON.stringify(join(dir, "a.png"))}, ${JSON.stringify(join(dir, "a.png"))}] }], ${JSON.stringify(join(dir, "sheet.jpg"))});`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...process.env, PATH: `${shim}:${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nofont/);
  assert.ok(existsSync(join(dir, "sheet.jpg")));
  const ext = spawnSync(process.execPath, [join(SCRIPTS, "check-external.mjs"), "--tool", "ffmpeg"], { encoding: "utf8", env: { ...process.env, PATH: `${shim}:${process.env.PATH}` } });
  assert.match(ext.stdout, /NO libass.*NO drawtext/);
});

test("presets + glass surface; music choice; thumb-frame spec", () => {
  assert.ok(PRESET_NAMES().length >= 8);
  for (const n of PRESET_NAMES()) assert.deepEqual(validateKind("brand", applyPreset(readJson("examples/demo/brand/brand.json"), n)), [], n);
  const dir = project({ init: ["--preset", "apple-light"] });
  const p = loadProject(dir);
  assert.equal(p.brand.colors.primary, "#0071e3");
  assert.equal(p.brand.surface, "glass");
  brandToCss(p, { offline: true });
  const css = readFileSync(join(dir, "assets", "brand.css"), "utf8");
  assert.match(css, /html \.os-card, html \.os-glass \{[\s\S]*backdrop-filter: blur\(calc\(36 \* var\(--u\)\)\) saturate\(180%\)/);
  assert.match(css, /color-mix\(in srgb, var\(--c-bg\) 52%, transparent\)/);

  assert.match(run("make-music.mjs", dir, "--use", "none").out, /no music/);
  assert.equal(readJson(join(dir, "studio.json")).audio.music, false);
  assert.equal(run("make-music.mjs", dir, "--use", "polka").code, 1);

  assert.deepEqual(parseThumbFrame("s01@2.5", p), { id: "s01", t: 2.5 });
  assert.deepEqual(parseThumbFrame("s01＠3", p), { id: "s01", t: 3 });
  assert.throws(() => parseThumbFrame("s09@1", p), /not in storyboard/);
});
