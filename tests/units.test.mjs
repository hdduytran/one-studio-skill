import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSrt, srtTime, wrapCue } from "../plugins/one-studio/skills/one-studio/scripts/lib/captions.mjs";
import { assColor, captionStyle } from "../plugins/one-studio/skills/one-studio/scripts/concat-and-mix.mjs";
import { resizeHtml } from "../plugins/one-studio/skills/one-studio/scripts/lib/variants.mjs";
import { toTemplate } from "../plugins/one-studio/skills/one-studio/scripts/series-bumper.mjs";
import { anatomyToSvg, scopeCss } from "../plugins/one-studio/skills/one-studio/scripts/anatomy-to-svg.mjs";
import { collectRefs, sceneHash, audioHash } from "../plugins/one-studio/skills/one-studio/scripts/lib/hash.mjs";
import { loadProject, sceneEngine } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { readJson, run, scene, tmp, writeJson } from "./helpers.mjs";

test("captions: srt time format, balanced wrapping, proportional split", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(3661.2345), "01:01:01,235");
  const two = wrapCue("Điện thoại của bạn chưa bao giờ nói chuyện với vệ tinh.", 42);
  assert.equal(two.length, 1);
  assert.equal(two[0].length, 2);
  assert.ok(Math.abs(two[0][0].length - two[0][1].length) < 12, "break near the middle");
  const long = "một hai ba bốn năm sáu bảy tám chín mười ".repeat(5).trim();
  const srt = buildSrt([{ start: 1, end: 11, text: long }], { maxChars: 30 });
  const cues = srt.trim().split("\n\n");
  assert.ok(cues.length >= 2, "long sentence split into several cues");
  assert.match(cues[0], /^1\n00:00:01,000 --> /);
  assert.match(cues.at(-1), / --> 00:00:11,000\n/);
  for (const c of cues) for (const line of c.split("\n").slice(2)) assert.ok(line.length <= 30, line);
});

test("ASS colours and caption sizing", () => {
  assert.equal(assColor("#ffffff"), "&H00FFFFFF");
  assert.equal(assColor("#ff8000"), "&H000080FF");
  assert.equal(assColor("rgba(0,0,0,0.5)"), "&H80000000");
  const land = captionStyle({ captions: { size: 44, position: "bottom" } }, 1920, 1080);
  const port = captionStyle({ captions: { size: 44 } }, 1080, 1920);
  const size = (s) => Number(/FontSize=([\d.]+)/.exec(s)[1]);
  // On-screen px = FontSize * height / 288.
  assert.ok(Math.abs((size(land) * 1080) / 288 - 44) < 1);
  assert.ok(Math.abs((size(port) * 1920) / 288 - 44 * 1.35) < 1, "portrait captions 1.35× larger");
  assert.match(land, /Alignment=2/);
});

test("resizeHtml rewrites composition size only", () => {
  const html = '<meta name="viewport" content="width=1920, height=1080" /><div data-width="1920" data-height="1080" style="--w: 1920px; --h: 1080px"><canvas id="gl" width="1920" height="1080"></canvas><img width="1920"></div>';
  const out = resizeHtml(html, { width: 1920, height: 1080 }, { width: 1080, height: 1920 });
  assert.match(out, /content="width=1080, height=1920"/);
  assert.match(out, /data-width="1080" data-height="1920"/);
  assert.match(out, /--w: 1080px; --h: 1920px/);
  assert.match(out, /<canvas id="gl" width="1080" height="1920">/);
  assert.match(out, /<img width="1920">/, "other elements untouched");
});

test("series bumper template placeholders", () => {
  const html = '<meta content="width=1920, height=1080"><div data-composition-id="s01" data-duration="2.5" data-width="1920" data-height="1080" style="--w: 1920px; --h: 1080px"><p class="clip" data-duration="2.5"></p></div><script>OS.scene("s01")</script>';
  const t = toTemplate(html, { id: "s01", duration: 2.5, width: 1920, height: 1080 });
  assert.ok(!/s01|1920|1080|2\.5/.test(t), t);
  assert.equal((t.match(/\{\{duration\}\}/g) ?? []).length, 2);
});

test("anatomy figure → scoped standalone SVG", () => {
  const svg = anatomyToSvg("tests/fixtures/anatomy-figure.html", { theme: "light" });
  assert.match(svg, /^<svg data-theme="light" xmlns=/);
  assert.match(svg, /class="iso-svg iso"/);
  assert.match(svg, /data-part="carriage"/);
  assert.match(svg, /data-part="needle"/);
  assert.match(svg, /<\/svg>$/);
  assert.ok(svg.includes('<svg class="inner"'), "nested svg kept");
  assert.ok(!svg.includes("iso-swatch"), "legend swatch outside the figure dropped");
  const css = scopeCss(".iso-fill{fill:red}*{x:1}body{margin:0}html{a:b}.iso-page{c:d}@media (x){.iso-svg{e:f}}.iso-plate{g:h}");
  assert.equal(css, ".iso-fill{fill:red}");
});

function hfProject() {
  const base = tmp();
  const dir = join(base, "p");
  assert.equal(run("init-project.mjs", dir).code, 0);
  mkdirSync(join(dir, "assets", "vendor"), { recursive: true });
  writeFileSync(join(dir, "assets", "brand.css"), ":root{--c-bg:#000}@font-face{src:url(fonts/a.woff2)}");
  mkdirSync(join(dir, "assets", "fonts"), { recursive: true });
  writeFileSync(join(dir, "assets", "fonts", "a.woff2"), "font-v1");
  writeFileSync(join(dir, "assets", "chart.svg"), "<svg/>");
  writeFileSync(join(dir, "assets", "vendor", "three.module.min.js"), "three");
  writeFileSync(join(dir, "assets", "mod.js"), 'export const x = 1;');
  writeFileSync(join(dir, "scenes", "s01.html"),
    '<link rel="stylesheet" href="../assets/brand.css"><img src="../assets/chart.svg"><script type="module">import * as T from "../assets/vendor/three.module.min.js"; import { x } from "../assets/mod.js";</script><div data-composition-id="s01" data-duration="5"></div>');
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [scene("s01")] });
  return dir;
}

test("scene hash follows referenced files, brand version and format, not VO text", () => {
  const dir = hfProject();
  const p = () => loadProject(dir);
  const s = () => p().storyboard.scenes[0];
  const refs = [...collectRefs(join(dir, "scenes", "s01.html"), dir)].map((f) => f.slice(dir.length + 1)).sort();
  assert.deepEqual(refs, ["assets/brand.css", "assets/chart.svg", "assets/fonts/a.woff2", "assets/mod.js", "assets/vendor/three.module.min.js", "scenes/s01.html"]);
  const h0 = sceneHash(p(), s());
  writeFileSync(join(dir, "assets", "fonts", "a.woff2"), "font-v2");
  const h1 = sceneHash(p(), s());
  assert.notEqual(h1, h0, "font inside brand.css changes the hash");
  writeFileSync(join(dir, "assets", "mod.js"), "export const x = 2;");
  const h2 = sceneHash(p(), s());
  assert.notEqual(h2, h1, "ES module import changes the hash");
  const a0 = audioHash(p());
  const sb = readJson(join(dir, "storyboard.json"));
  sb.scenes[0].lines[0].text = "Câu khác.";
  writeJson(join(dir, "storyboard.json"), sb);
  assert.equal(sceneHash(p(), s()), h2, "VO text does not touch the picture");
  assert.notEqual(audioHash(p()), a0, "…but changes the audio");
  const brandPath = join(dir, "brand", "brand.json");
  const brand = readJson(brandPath);
  brand.version = 2;
  writeJson(brandPath, brand);
  assert.notEqual(sceneHash(p(), s()), h2, "brand version bump");
});

test("engine routing", () => {
  const studio = { engine: { default: "hyperframes" } };
  assert.equal(sceneEngine({ type: "text" }, studio), "hyperframes");
  assert.equal(sceneEngine({ type: "3d" }, studio), "hyperframes");
  assert.equal(sceneEngine({ type: "3d", three: { physics: true } }, studio), "remotion");
  assert.equal(sceneEngine({ type: "3d", three: { postfx: true } }, studio), "remotion");
  assert.equal(sceneEngine({ type: "character" }, studio), "lemo");
  assert.equal(sceneEngine({ type: "text", engine: "remotion" }, studio), "remotion");
});

test("render plan blocks unapproved scenes and caches approved clips", () => {
  const dir = hfProject();
  const plan = () => JSON.parse(run("render-changed-scenes.mjs", dir, "--dry-run", "--json").out);
  const r = run("render-changed-scenes.mjs", dir, "--dry-run");
  assert.equal(r.code, 2, "blocked → exit 2");
  assert.equal(plan()[0].action, "blocked");
  const ok = run("status.mjs", dir, "--approve-scenes", "all");
  const hash = /s01@([0-9a-f]+)/.exec(ok.out)[1];
  assert.equal(plan()[0].action, "render");
  mkdirSync(join(dir, "out", "scenes"), { recursive: true });
  writeFileSync(join(dir, "out", "scenes", `s01-${hash}.mp4`), "");
  assert.equal(plan()[0].action, "cached");
  writeFileSync(join(dir, "assets", "chart.svg"), "<svg><g/></svg>");
  assert.equal(plan()[0].action, "blocked", "edit clears the approval");
});

test("series: new episode inherits format, voice, consent and gets bumpers", () => {
  const base = tmp();
  const ep1 = join(base, "ep1");
  assert.equal(run("init-project.mjs", ep1, "--series", "S", "--aspect", "9:16").code, 0);
  const st = readJson(join(ep1, "studio.json"));
  st.audio.tts.vi.voice = "ngoc-huyen";
  st.services.tts = true;
  st.format.exports = ["9:16", "1:1"];
  writeJson(join(ep1, "studio.json"), st);
  const brandDir = join(base, "series", "s", "brand");
  writeFileSync(join(brandDir, "intro.html"), '<div data-composition-id="{{id}}" data-duration="{{duration}}" data-width="{{width}}">{{title}}</div>');
  const brand = readJson(join(brandDir, "brand.json"));
  brand.intro = { enabled: true, template: "intro.html", duration: 2 };
  writeJson(join(brandDir, "brand.json"), brand);
  const ep2 = join(base, "ep2");
  const r = run("init-project.mjs", ep2, "--series", "S", "--title", "Tập 2");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /from ep1/);
  const s2 = readJson(join(ep2, "studio.json"));
  assert.equal(s2.format.aspect, "9:16");
  assert.deepEqual(s2.format.exports, ["9:16", "1:1"]);
  assert.equal(s2.audio.tts.vi.voice, "ngoc-huyen");
  assert.equal(s2.services.tts, true);
  assert.equal(readJson(join(ep2, "storyboard.json")).scenes[0].id, "intro");
  assert.equal(
    readFileSync(join(ep2, "scenes", "intro.html"), "utf8"),
    '<div data-composition-id="intro" data-duration="2" data-width="1080">Tập 2</div>',
  );
  assert.equal(run("validate.mjs", ep2).code, 0);
});
