import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPTS, readJson, run, scene, tmp, writeJson } from "./helpers.mjs";
import { startMockTts } from "./mock-tts-server.mjs";
import { startMockStt } from "./mock-stt-server.mjs";

const { acronyms, applyPronunciations, pronunciationsFor, spokenText } = await import(join(SCRIPTS, "lib", "pronounce.mjs"));
const { checkLine, canonicalHeard } = await import(join(SCRIPTS, "lib", "pron-check.mjs"));
const { cacheKey } = await import(join(SCRIPTS, "lib", "tts.mjs"));

const execFileP = promisify(execFile);
async function runAsync(script, ...args) {
  try {
    const r = await execFileP(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", env: process.env });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    return { code: e.code, out: e.stdout, err: e.stderr };
  }
}

const DICT = { PHP: "pi ếch pi", "PHP-FPM": "pi ếch pi ép pi em", PHP2Shell: "pi ếch pi tu seo", CA: "xi ây", TLS: "ti eo ét", CVE: "xi vi i", CVSS: "xi vi ét ét" };

test("pronunciations: whole word, case-sensitive, longest key first, one pass", () => {
  const r = applyPronunciations("PHP, PHP-FPM và PHP2Shell; CVSS của CVE-2024; CA ≠ Ca ≠ CAT ≠ xCA; TLS.", DICT);
  assert.equal(r.text, "pi ếch pi, pi ếch pi ép pi em và pi ếch pi tu seo; xi vi ét ét của xi vi i-2024; xi ây ≠ Ca ≠ CAT ≠ xCA; ti eo ét.");
  assert.deepEqual(r.hits, ["PHP", "PHP-FPM", "PHP2Shell", "CVSS", "CVE", "CA", "TLS"]);
  // A replacement is never replaced again (the spelled "pi" is not a key, but "CA" inside output would not be either).
  assert.equal(applyPronunciations("CA", { CA: "CA CA", "CA CA": "x" }).text, "CA CA");
  assert.equal(applyPronunciations("no entry here", {}).text, "no entry here");
  assert.deepEqual(acronyms("PHP-FPM, CVE-2024-4577, iOS, A1, TLS1"), ["PHP", "FPM", "CVE", "TLS1"]);
});

test("pronunciations: brand (series) entries, project overrides, say wins, captions keep text", () => {
  const project = {
    brand: { pronunciations: { vi: { PHP: "pi ếch pi", CA: "xi ây" }, default: { API: "ây pi ai" } } },
    studio: { meta: { language: "vi" }, pronunciations: { vi: { CA: "xê a" } } },
  };
  assert.deepEqual(pronunciationsFor(project, "vi-VN"), { API: "ây pi ai", PHP: "pi ếch pi", CA: "xê a" });
  assert.equal(spokenText(project, { text: "PHP và CA" }).text, "pi ếch pi và xê a");
  assert.equal(spokenText(project, { text: "PHP", say: "PHP tám" }).text, "PHP tám");
  // The cache key follows the spoken text: changing one entry changes only the lines that use it.
  const v = { model: "zerotts", voice: "quangminh", speed: 1 };
  const before = [cacheKey(spokenText(project, { text: "PHP" }).text, v), cacheKey(spokenText(project, { text: "CA" }).text, v)];
  project.studio.pronunciations.vi.CA = "xi a";
  const after = [cacheKey(spokenText(project, { text: "PHP" }).text, v), cacheKey(spokenText(project, { text: "CA" }).text, v)];
  assert.equal(before[0], after[0]);
  assert.notEqual(before[1], after[1]);
});

async function project(ttsUrl, sttUrl) {
  const dir = join(tmp(), "p");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  const st = readJson(join(dir, "studio.json"));
  st.audio.tts.vi.base_url = ttsUrl;
  st.audio.tts.default.base_url = ttsUrl;
  if (sttUrl) st.audio.stt = { vi: { base_url: sttUrl, model: "gipformer" } };
  writeJson(join(dir, "studio.json"), st);
  const brandPath = join(dir, "brand", "brand.json");
  const brand = readJson(brandPath);
  brand.pronunciations = { vi: { PHP: "pi ếch pi", CA: "xi ây", CVE: "xi vi i" } };
  writeJson(brandPath, brand);
  writeJson(join(dir, "storyboard.json"), {
    version: 1,
    scenes: [
      scene("s01", "text", { duration: 3, lines: [{ id: "s01-1", text: "Lỗ hổng PHP mới." }, { id: "s01-2", text: "Chứng chỉ do CA cấp." }] }),
      scene("s02", "text", { duration: 3, lines: [{ id: "s02-1", text: "Mã CVE đã có." }, { id: "s02-2", text: "Không có chữ viết tắt nào." }] }),
    ],
  });
  writeFileSync(join(dir, "scenes", "s01.html"), '<div id="root" data-composition-id="s01" data-duration="3"><p data-line="s01-1"></p></div>');
  writeFileSync(join(dir, "scenes", "s02.html"), '<div id="root" data-composition-id="s02" data-duration="3"><p></p></div>');
  return dir;
}

test("build-audio: dictionary feeds TTS and the cache key, captions keep the text, dry-run counts the change", async () => {
  const mock = await startMockTts();
  try {
    const dir = await project(mock.url);
    const ok = await runAsync("build-audio.mjs", dir, "--allow-tts");
    assert.equal(ok.code, 0, ok.err);
    assert.deepEqual(mock.calls.map((c) => c.input), ["Lỗ hổng pi ếch pi mới.", "Chứng chỉ do xi ây cấp.", "Mã xi vi i đã có.", "Không có chữ viết tắt nào."]);
    const srt = readFileSync(join(dir, "captions.srt"), "utf8");
    assert.match(srt, /Lỗ hổng PHP mới\./);
    assert.doesNotMatch(srt, /pi ếch pi/);
    const m = readJson(join(dir, "audio", "manifest.json"));
    const s01 = m.scenes[0].lines;
    assert.equal(s01[0].text, "Lỗ hổng PHP mới.");
    assert.equal(s01[0].spoken, "Lỗ hổng pi ếch pi mới.");
    assert.equal(m.scenes[1].lines[1].spoken, undefined, "no spoken field when nothing changed");
    // s02 has VO lines but no data-line element: warned, not failed.
    assert.match(ok.out, /s02: no data-line element/);
    assert.doesNotMatch(ok.out, /s01: no data-line element/);
    const sync = run("sync-lines.mjs", dir);
    assert.equal(sync.code, 0, sync.err);
    assert.match(sync.out, /⚠ s02: no data-line element/);

    // Project override of one entry: one sentence re-synthesised, the audio gate sees the change.
    const st = readJson(join(dir, "studio.json"));
    st.pronunciations = { vi: { CA: "xê a" } };
    writeJson(join(dir, "studio.json"), st);
    const dry = await runAsync("build-audio.mjs", dir, "--dry-run");
    assert.match(dry.out, /4 sentence\(s\), 1 TTS call\(s\) needed, 3 cached/);
    assert.match(dry.out, /pronunciations change 3 sentence\(s\) \(PHP, CA, CVE\); 1 of them need a TTS call/);
    const { loadProject } = await import(join(SCRIPTS, "lib", "project.mjs"));
    const { audioHash } = await import(join(SCRIPTS, "lib", "hash.mjs"));
    assert.notEqual(audioHash(loadProject(dir)), readJson(join(dir, "audio", "manifest.json")).hash, "dictionary edit makes the audio out of date");
    const again = await runAsync("build-audio.mjs", dir);
    assert.equal(again.code, 0, again.err);
    assert.equal(mock.calls.length, 5);
    assert.equal(mock.calls[4].input, "Chứng chỉ do xê a cấp.");
    assert.equal(run("validate.mjs", dir).code, 0, "pronunciations validate in brand.json and studio.json");
  } finally {
    mock.close();
  }
});

test("pron-check: diff, spelled or written acronyms, unlisted acronyms, duration sanity", () => {
  const dict = { PHP: "pi ếch pi", CVE: "xi vi i", CA: "xi ây" };
  assert.deepEqual(canonicalHeard("Lỗi pi ếch pi và PHP", dict), ["lỗi", "php", "và", "php"]);
  const good = checkLine({ text: "Lỗ hổng CVE trong PHP.", spoken: "Lỗ hổng xi vi i trong pi ếch pi.", hits: ["CVE", "PHP"], dict, transcript: "lỗ hổng xi vi i trong PHP", duration: 2.4, wps: 4.5 });
  assert.equal(good.ok, true, good.issues.join("; "));
  assert.equal(good.timing.verdict, "ok");
  const merged = checkLine({ text: "Mã CVE do CA cấp.", spoken: "Mã xi vi i do xi ây cấp.", hits: ["CVE", "CA"], dict, transcript: "mã CV do công an cấp", duration: 2.2, wps: 4.5 });
  assert.equal(merged.ok, false);
  assert.deepEqual(merged.missing, ["cve", "ca"]);
  assert.ok(merged.issues.some((i) => /CVE \("xi vi i"\) not recognised/.test(i)));
  assert.ok(merged.issues.some((i) => /CA \("xi ây"\) not recognised/.test(i)));
  // 3 plain words at 4.5 w/s = 0.67 s; 5 spelled letters need ≥ 0.8 s: 1.2 s total is too short.
  const short = checkLine({ text: "Mã CVE do CA.", spoken: "Mã xi vi i do xi ây.", hits: ["CVE", "CA"], dict, transcript: "mã xi vi i do xi ây", duration: 1.2, wps: 4.5 });
  assert.equal(short.timing.verdict, "short");
  assert.ok(short.issues.some((i) => /letters may be swallowed/.test(i)));
  const unlisted = checkLine({ text: "Bật TLS lên.", spoken: "Bật TLS lên.", hits: [], dict, transcript: "bật TLS lên", duration: 1, wps: 4.5 });
  assert.deepEqual(unlisted.unlisted, ["TLS"]);
  assert.equal(unlisted.ok, false);
});

test("check-pronunciation: consent, mock STT, flagged lines, transcript cache", async () => {
  const tts = await startMockTts();
  const transcripts = new Map();
  const stt = await startMockStt({ transcribe: ({ bytes }) => transcripts.get(createHash("sha256").update(bytes).digest("hex")) ?? "" });
  try {
    const dir = await project(tts.url, stt.url);
    assert.equal((await runAsync("build-audio.mjs", dir, "--allow-tts")).code, 0);
    const m = readJson(join(dir, "audio", "manifest.json"));
    const heard = { "s01-1": "lỗ hổng pi ếch pi mới", "s01-2": "chứng chỉ do công an cấp", "s02-1": "mã CV đã có", "s02-2": "không có chữ viết tắt nào" };
    for (const l of m.scenes.flatMap((s) => s.lines)) transcripts.set(createHash("sha256").update(readFileSync(join(dir, l.file))).digest("hex"), heard[l.id]);

    const dry = await runAsync("check-pronunciation.mjs", dir, "--dry-run");
    assert.match(dry.out, /4 sentence\(s\), 4 speech-to-text call\(s\) needed/);
    const refused = await runAsync("check-pronunciation.mjs", dir);
    assert.equal(refused.code, 3);
    assert.match(refused.err, /Ask the user/);
    assert.equal(stt.calls.length, 0, "no STT call before consent");

    const r = await runAsync("check-pronunciation.mjs", dir, "--allow-stt");
    assert.equal(r.code, 2, r.err);
    assert.equal(stt.calls.length, 4);
    assert.equal(stt.calls[0].model, "gipformer");
    assert.equal(stt.calls[0].language, "vi");
    assert.equal(readJson(join(dir, "studio.json")).services.stt, true, "consent recorded");
    assert.match(r.out, /✗ s01-2/);
    assert.match(r.out, /CA \("xi ây"\) not recognised/);
    assert.match(r.out, /✗ s02-1/);
    assert.doesNotMatch(r.out, /✗ s01-1/);
    assert.match(r.out, /4 sentence\(s\) checked, 2 to listen to/);
    const report = readJson(join(dir, "review", "pronunciation.json"));
    assert.deepEqual(report.lines.filter((l) => !l.ok).map((l) => l.id), ["s01-2", "s02-1"]);

    // Unchanged audio: transcripts come from the cache; one scene only.
    const again = await runAsync("check-pronunciation.mjs", dir, "s01");
    assert.equal(stt.calls.length, 4, "cached");
    assert.match(again.out, /2 sentence\(s\) checked, 1 to listen to/);
    assert.equal((await runAsync("check-pronunciation.mjs", dir, "nope")).code, 1);
  } finally {
    tts.close();
    stt.close();
  }
});
