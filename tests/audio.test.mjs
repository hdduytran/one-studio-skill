import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, run, scene, tmp, writeJson } from "./helpers.mjs";
import { startMockTts } from "./mock-tts-server.mjs";

const execFileP = promisify(execFile);
// The mock server lives in this process, so scripts must run asynchronously.
async function runAsync(script, ...args) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: process.env });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { code: e.code, out: e.stdout, err: e.stderr };
  }
}

async function project(url, { key } = {}) {
  const dir = join(tmp(), "a");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  const st = readJson(join(dir, "studio.json"));
  st.audio.tts.vi.base_url = url;
  st.audio.tts.default.base_url = url;
  if (key) st.audio.tts.vi.key_env = "MOCK_TTS_KEY";
  writeJson(join(dir, "studio.json"), st);
  writeJson(join(dir, "storyboard.json"), {
    version: 1,
    scenes: [
      scene("s01", "text", { duration: 4, lines: [{ id: "s01-1", text: "Câu thứ nhất." }, { id: "s01-2", text: "Câu thứ hai dài hơn một chút." }] }),
      scene("s02", "text", { duration: 2, lines: [{ id: "s02-1", text: "Một câu rất dài để cảnh này phải kéo dài thêm cho khớp với giọng đọc." }] }),
      scene("s03", "text", { duration: 3, lines: [] }),
    ],
  });
  for (const id of ["s01", "s02", "s03"]) {
    writeFileSync(join(dir, "scenes", `${id}.html`), `<div id="root" data-composition-id="${id}" data-duration="${id === "s01" ? 4 : id === "s02" ? 2 : 3}"><p class="clip" data-duration="${id === "s01" ? 4 : id === "s02" ? 2 : 3}"></p></div>`);
  }
  return dir;
}

test("build-audio: consent, cache, fitting, captions, manifest", async () => {
  const mock = await startMockTts();
  try {
    const dir = await project(mock.url);
    run("status.mjs", dir, "--approve-scenes", "all");
    const approvedBefore = readJson(join(dir, "studio.json")).scenes.find((s) => s.id === "s02").approved_hash;

    const dry = await runAsync("build-audio.mjs", dir, "--dry-run");
    assert.match(dry.out, /3 TTS call\(s\) needed/);
    const refused = await runAsync("build-audio.mjs", dir);
    assert.equal(refused.code, 3);
    assert.match(refused.err, /Ask the user/);
    assert.equal(mock.calls.length, 0, "no call before consent");

    const ok = await runAsync("build-audio.mjs", dir, "--allow-tts");
    assert.equal(ok.code, 0, ok.err);
    assert.equal(mock.calls.length, 3);
    assert.equal(mock.calls[0].model, "zerotts");
    assert.equal(mock.calls[0].response_format, "wav");
    const st = readJson(join(dir, "studio.json"));
    assert.equal(st.services.tts, true, "consent recorded");

    const m = readJson(join(dir, "audio", "manifest.json"));
    const s02 = m.scenes.find((s) => s.id === "s02");
    // mock speech = 0.06 s/char with 0.2 s silence each side; trimming keeps 0.02 s + 0.05 s.
    const spoken = "Một câu rất dài để cảnh này phải kéo dài thêm cho khớp với giọng đọc.".length * 0.06 + 0.07;
    assert.ok(Math.abs(s02.lines[0].duration - spoken) < 0.03, `trimmed duration ${s02.lines[0].duration} vs ${spoken}`);
    assert.ok(s02.duration > 2, "scene stretched to fit VO");
    assert.equal(s02.duration, Math.round((0.3 + s02.lines[0].duration + 0.5) * 1000) / 1000);
    assert.equal(m.scenes.find((s) => s.id === "s03").duration, 3, "scene without VO keeps its length");
    assert.match(readFileSync(join(dir, "scenes", "s02.html"), "utf8"), new RegExp(`data-duration="${s02.duration}"><p class="clip" data-duration="${s02.duration}"`));
    const st2 = st.scenes.find((s) => s.id === "s02");
    assert.equal(st2.fit_duration, s02.duration);
    assert.notEqual(st2.approved_hash, approvedBefore, "approval moved to the new hash");
    const plan = JSON.parse(run("render-changed-scenes.mjs", dir, "--dry-run", "--json").out);
    assert.equal(plan.find((p) => p.id === "s02").action, "render", "stretched scene renders without new review");

    // Captions start exactly where each sentence is placed; audio onsets match within 100 ms.
    const srt = readFileSync(join(dir, "captions.srt"), "utf8");
    const starts = [...srt.matchAll(/(\d\d):(\d\d):(\d\d),(\d{3}) -->/g)].map((x) => +x[1] * 3600 + +x[2] * 60 + +x[3] + +x[4] / 1000);
    assert.equal(starts.length, 3);
    const det = await execFileP("ffmpeg", ["-hide_banner", "-i", join(dir, "audio", "vo.wav"), "-af", "silencedetect=n=-40dB:d=0.1", "-f", "null", "-"]);
    const onsets = [0, ...[...det.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((x) => +x[1])];
    for (const s of starts) assert.ok(onsets.some((o) => Math.abs(o - s) < 0.1), `cue at ${s} has audio onset (${onsets.join(", ")})`);
    const voDur = +(await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, "audio", "vo.wav")])).stdout;
    assert.ok(Math.abs(voDur - m.duration) < 0.02);

    // Audio gate is approvable right after (manifest hash matches).
    for (const g of ["brief", "script"]) {
      const p = join(dir, `${g}.md`);
      writeFileSync(p, readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, "x"));
    }
    const status = JSON.parse(run("status.mjs", dir, "--json").out);
    assert.ok(status.scenes.length === 3);

    // Re-run: everything cached. Edit one sentence: exactly one new call.
    await runAsync("build-audio.mjs", dir);
    assert.equal(mock.calls.length, 3);
    const sb = readJson(join(dir, "storyboard.json"));
    sb.scenes[0].lines[1].text = "Câu thứ hai đã sửa.";
    writeJson(join(dir, "storyboard.json"), sb);
    const again = await runAsync("build-audio.mjs", dir);
    assert.equal(again.code, 0, again.err);
    assert.equal(mock.calls.length, 4);
    assert.match(again.out, /1 TTS call/);
  } finally {
    mock.close();
  }
});

test("tts: API key from env, probe", async () => {
  const mock = await startMockTts({ key: "secret" });
  try {
    const dir = await project(mock.url, { key: true });
    const bad = await runAsync("tts-openai-compatible.mjs", "--probe", dir);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /HTTP 401/);
    process.env.MOCK_TTS_KEY = "secret";
    const ok = await runAsync("tts-openai-compatible.mjs", "--probe", dir);
    delete process.env.MOCK_TTS_KEY;
    assert.equal(ok.code, 0, ok.err);
    const info = JSON.parse(ok.out);
    assert.deepEqual(info.models, ["zerotts", "omnivoice"]);
    assert.equal(info.codec, "pcm_s16le");
    assert.equal(info.sample_rate, 24000);
    assert.ok(!readFileSync(join(dir, "studio.json"), "utf8").includes("secret"), "key never written");
  } finally {
    mock.close();
  }
});
