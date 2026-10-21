// End-to-end scenarios with real renders (HyperFrames + FFmpeg; lemo when ONE_STUDIO_LEMO_LIB is set).
// Run: HYPERFRAMES_BROWSER_PATH=<headless_shell> npm run test:e2e
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, tmp, writeJson } from "../helpers.mjs";
import { startMockTts } from "../mock-tts-server.mjs";

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
const probe = (f) => JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", f], { encoding: "utf8" }).stdout);
const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
const lemo = process.env.ONE_STUDIO_LEMO_LIB && existsSync(join(process.env.ONE_STUDIO_LEMO_LIB, "core", "render", "video.mjs"));

const fillMd = (dir, f) => writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace(/<!--[\s\S]*?-->/g, "ok"));

function storyboard(extra = []) {
  return {
    version: 1,
    scenes: [
      { id: "s01", title: "Mở đầu", type: "text", duration: 2, lines: [{ id: "s01-1", text: "Xin chào." }] },
      { id: "s02", title: "Sơ đồ", type: "diagram", duration: 2, lines: [{ id: "s02-1", text: "A tới B." }] },
      { id: "s03", title: "Số liệu", type: "data", duration: 2, data: [{ label: "A", value: 3 }, { label: "B", value: 7 }], lines: [] },
      { id: "s04", title: "Kết", type: "lottie", duration: 2, assets: ["assets/satellite.json"], lines: [{ id: "s04-1", text: "Hẹn gặp lại." }] },
      ...extra,
    ],
  };
}

test("(a)(b)(d)(e) 2D Vietnamese video through every gate, then add one scene", { skip: !chrome && "no Chrome for HyperFrames" }, async () => {
  const mock = await startMockTts();
  try {
    const dir = join(tmp(), "gps");
    await ok("init-project.mjs", dir, "--title", "E2E", "--lang", "vi", "--duration", "8");
    const st = readJson(join(dir, "studio.json"));
    st.audio.tts.vi.base_url = mock.url;
    st.audio.music = false; // gate 7 needs a music decision; false = the user chose none
    writeJson(join(dir, "studio.json"), st);
    copyFileSync("tests/fixtures/satellite.json", join(dir, "assets", "satellite.json"));
    fillMd(dir, "brief.md");
    fillMd(dir, "script.md");
    writeJson(join(dir, "storyboard.json"), storyboard());
    for (const g of ["brief", "script", "storyboard"]) await ok("status.mjs", dir, "--approve", g);

    // (d) estimate before gate 5
    const est = await ok("status.mjs", dir, "--estimate");
    assert.match(est, /4 scene\(s\) to write\/fix, 4 to render/);
    await ok("status.mjs", dir, "--approve", "estimate");

    await ok("prepare-project.mjs", dir);
    await ok("new-scene.mjs", dir, "--all");
    const stills = await ok("keyframe-stills.mjs", dir);
    assert.match(stills, /s04: 3 still/);
    assert.ok(existsSync(join(dir, "review", "sheet.jpg")));

    // (e) nothing renders before keyframe approval
    const blocked = await sh("render-changed-scenes.mjs", dir, "--preview");
    assert.equal(blocked.code, 2);
    assert.ok(!existsSync(join(dir, "out", "preview")) || readdirSync(join(dir, "out", "preview")).length === 0);
    assert.notEqual((await sh("status.mjs", dir, "--approve", "keyframes")).code, 0);

    await ok("status.mjs", dir, "--approve-scenes", "all");
    await ok("status.mjs", dir, "--approve", "keyframes");
    await ok("render-changed-scenes.mjs", dir, "--preview");
    await ok("status.mjs", dir, "--approve", "build");
    await ok("build-audio.mjs", dir, "--allow-tts");
    await ok("status.mjs", dir, "--approve", "audio");
    await ok("render-changed-scenes.mjs", dir, "--preview"); // scenes stretched by VO
    await ok("concat-and-mix.mjs", dir, "--preview");
    await ok("status.mjs", dir, "--approve", "preview");
    const est9 = await ok("status.mjs", dir, "--estimate");
    assert.match(est9, /0 scene\(s\) to write\/fix, 4 to render/, "(d) estimate before gate 9: no tokens, only render time");
    await ok("render-changed-scenes.mjs", dir);
    const mix = await ok("concat-and-mix.mjs", dir);
    await ok("status.mjs", dir, "--approve", "render");

    const final = join(dir, "out", "gps.mp4");
    const p = probe(final);
    const v = p.streams.find((s) => s.codec_type === "video");
    assert.equal(v.width, 1920);
    assert.equal(v.height, 1080);
    assert.equal(v.r_frame_rate, "30/1");
    assert.ok(p.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"));
    const manifest = readJson(join(dir, "audio", "manifest.json"));
    assert.ok(Math.abs(+p.format.duration - manifest.duration) < 0.1, `${p.format.duration} vs ${manifest.duration}`);
    const lufs = +/loudness (-?[\d.]+) LUFS/.exec(mix)[1];
    assert.ok(Math.abs(lufs + 14) <= 1, `loudness ${lufs}`);
    assert.ok(existsSync(join(dir, "out", "gps.srt")));

    // (b) add one scene: only it renders, old hashes stay
    const before = Object.fromEntries(readJson(join(dir, "studio.json")).scenes.map((s) => [s.id, s.clip]));
    writeJson(join(dir, "storyboard.json"), storyboard([{ id: "s05", title: "Thêm", type: "text", duration: 2, lines: [{ id: "s05-1", text: "Cảnh mới." }] }]));
    writeFileSync(join(dir, "script.md"), readFileSync(join(dir, "script.md"), "utf8") + "\n## s05 · Thêm\n\n- Cảnh mới.\n");
    for (const g of ["script", "storyboard", "estimate"]) await ok("status.mjs", dir, "--approve", g);
    const est5 = await ok("status.mjs", dir, "--estimate");
    assert.match(est5, /1 scene\(s\) to write\/fix/);
    await ok("new-scene.mjs", dir, "s05");
    const stills2 = await ok("keyframe-stills.mjs", dir);
    assert.match(stills2, /s05/);
    assert.doesNotMatch(stills2, /s0[1-4]:/, "only the new scene is reviewed");
    await ok("status.mjs", dir, "--approve-scenes", "s05");
    await ok("build-audio.mjs", dir);
    assert.equal(mock.calls.length, 4, "one new TTS call");
    const render = await ok("render-changed-scenes.mjs", dir, "--json");
    const plan = JSON.parse(render);
    assert.deepEqual(plan.filter((x) => x.action === "render").map((x) => x.id), ["s05"]);
    const after = Object.fromEntries(readJson(join(dir, "studio.json")).scenes.map((s) => [s.id, s.clip]));
    for (const id of ["s01", "s02", "s03", "s04"]) assert.equal(after[id], before[id], `${id} clip unchanged`);
    await ok("concat-and-mix.mjs", dir);
    const sidecar = readJson(join(dir, "out", "gps.json"));
    assert.equal(sidecar.scenes.length, 5);

    // publish one extra ratio + thumbnails
    const pub = await ok("publish.mjs", dir, "--ratios", "9:16");
    assert.match(pub, /9:16\s+out\/gps-9x16\.mp4\s+1080x1920/);
    const man = readJson(join(dir, "out", "manifest.json"));
    assert.equal(man.videos.length, 2);
    assert.equal(man.thumbnails.length, 2);
  } finally {
    mock.close();
  }
});

test("(f) explainer + character + 3D scenes concat with the 2D scenes", { skip: !chrome && "no Chrome for HyperFrames" }, async () => {
  const dir = join(tmp(), "mix");
  await ok("init-project.mjs", dir, "--title", "Mix", "--duration", "6");
  fillMd(dir, "brief.md");
  fillMd(dir, "script.md");
  const scenes = [
    { id: "s01", title: "Text", type: "text", duration: 1.5 },
    { id: "s02", title: "Explainer", type: "explainer", duration: 1.5 },
    { id: "s03", title: "3D", type: "3d", duration: 1.5 },
  ];
  if (lemo) scenes.push({ id: "s04", title: "Character", type: "character", duration: 1.5, character: { style: "whiteboard" } });
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes });
  for (const g of ["brief", "script", "storyboard", "estimate"]) await ok("status.mjs", dir, "--approve", g);
  await ok("prepare-project.mjs", dir);
  await ok("new-scene.mjs", dir, "--all");
  await ok("anatomy-to-svg.mjs", "tests/fixtures/anatomy-figure.html", "--into", dir, "s02");
  await ok("keyframe-stills.mjs", dir);
  await ok("status.mjs", dir, "--approve-scenes", "all");
  await ok("render-changed-scenes.mjs", dir);
  const out = await ok("concat-and-mix.mjs", dir);
  assert.match(out, /1920x1080@30/);
  const p = probe(join(dir, "out", "mix.mp4"));
  assert.ok(Math.abs(+p.format.duration - scenes.length * 1.5) < 0.1);
});
