// style-fetch: range maths, yt-dlp arguments, error classes, consent order, local cut, and a stubbed link download.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { SCRIPTS, readJson, run, tmp, writeJson } from "./helpers.mjs";

const S = "plugins/one-studio/skills/one-studio";
const yt = await import(`../${S}/scripts/lib/ytdlp.mjs`);
const { neededTools } = await import(`../${S}/scripts/check-external.mjs`);
const { loadProject } = await import(`../${S}/scripts/lib/project.mjs`);
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const fetchCli = (env, ...args) => {
  const r = spawnSync(process.execPath, [join(SCRIPTS, "style-fetch.mjs"), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const project = (services) => {
  const dir = tmp();
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  if (services) {
    const studio = readJson(join(dir, "studio.json"));
    studio.services = services;
    writeJson(join(dir, "studio.json"), studio);
  }
  return dir;
};

test("parseTime accepts seconds, m:ss, h:mm:ss and rejects junk", () => {
  assert.equal(yt.parseTime("90"), 90);
  assert.equal(yt.parseTime("1:30"), 90);
  assert.equal(yt.parseTime("1:01:30.5"), 3690.5);
  assert.throws(() => yt.parseTime("abc"));
  assert.throws(() => yt.parseTime("1:2:3:4"));
});

test("resolveRange combines from, to and max", () => {
  assert.deepEqual(yt.resolveRange({}), { from: 0, to: 90, max: 90 });
  assert.deepEqual(yt.resolveRange({ from: "0:10" }), { from: 10, to: 100, max: 90 });
  assert.deepEqual(yt.resolveRange({ from: "0:10", to: "0:40" }), { from: 10, to: 40, max: 90 });
  assert.deepEqual(yt.resolveRange({ max: "0" }), { from: 0, to: null, max: 0 });
  assert.deepEqual(yt.resolveRange({ to: "10:00", max: "0" }), { from: 0, to: 600, max: 0 });
  assert.deepEqual(yt.resolveRange({ to: "3:00", max: "200" }), { from: 0, to: 180, max: 200 });
  assert.throws(() => yt.resolveRange({ to: "3:00" }), /--max/);
  assert.throws(() => yt.resolveRange({ from: "1:00", to: "0:30" }), /after/);
  assert.throws(() => yt.resolveRange({ max: "-5" }), /--max/);
});

test("buildArgs: sections, no cookies, no shell, url after --", () => {
  const args = yt.buildArgs({ url: "https://youtu.be/x", dir: "/d", from: 5, to: 95 });
  assert.equal(args[args.indexOf("--download-sections") + 1], "*5-95");
  for (const f of ["--no-playlist", "--write-info-json", "--write-auto-subs", "--no-cookies-from-browser"]) assert.ok(args.includes(f), f);
  assert.ok(!args.some((a) => a.startsWith("--cookies")));
  assert.deepEqual(args.slice(-2), ["--", "https://youtu.be/x"]);
  assert.equal(yt.buildArgs({ url: "https://a.b/", dir: "/d", from: 0, to: null })[3], "*0-inf");
});

test("only http(s) links are accepted", () => {
  assert.equal(yt.assertHttpUrl("https://www.tiktok.com/@a/video/1"), "https://www.tiktok.com/@a/video/1");
  assert.throws(() => yt.assertHttpUrl("ftp://x/y"), /http/);
  assert.throws(() => yt.assertHttpUrl("file:///etc/passwd"), /http/);
  assert.throws(() => yt.assertHttpUrl("not a url"));
});

test("stderr samples map to the right failure class", () => {
  const cases = {
    login: ["ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate", "ERROR: This video is private. Use --cookies-from-browser", "ERROR: [facebook] Cannot parse data; you need to log in"],
    format: ["ERROR: [youtube] abc: Requested format is not available. Use --list-formats", "ERROR: No video formats found"],
    network: ["ERROR: Unable to download webpage: <urlopen error [Errno 8] nodename nor servname provided>", "ERROR: Read timed out", "HTTP Error 503: Service Unavailable"],
    extractor: ["ERROR: [TikTok] 1: Unable to extract webpage video data; please report this issue on https://github.com/yt-dlp/yt-dlp/issues", "ERROR: Unsupported URL: https://example.com/"],
    other: ["something odd happened"],
  };
  for (const [kind, samples] of Object.entries(cases)) for (const s of samples) assert.equal(yt.classifyError(s).kind, kind, s);
  assert.match(yt.classifyError("Sign in to confirm").message, /file/);
  assert.match(yt.classifyError("Unable to extract x").message, /yt-dlp -U/);
});

test("platform detection and info filtering", () => {
  assert.equal(yt.platformOf("Youtube", "https://youtu.be/a"), "youtube");
  assert.equal(yt.platformOf("TikTok", "https://vm.tiktok.com/a"), "tiktok");
  assert.equal(yt.platformOf(undefined, "https://fb.watch/a"), "facebook");
  assert.equal(yt.platformOf("generic", "https://example.com/v"), "other");
  const kept = yt.filterInfo({ title: "T", uploader: "U", webpage_url: "https://x/", duration: 12, extractor: "e", width: 1, height: 2, cookies: "secret", formats: [{}] });
  assert.deepEqual(Object.keys(kept).sort(), ["channel", "duration", "extractor", "height", "title", "url", "width"]);
});

test("a link without consent stops before looking for yt-dlp", () => {
  const dir = project();
  const r = fetchCli({ ONE_STUDIO_YTDLP: "/nonexistent/yt-dlp" }, dir, "https://www.youtube.com/watch?v=x");
  assert.equal(r.code, 1);
  assert.match(r.err, /services|download/);
  assert.doesNotMatch(r.err, /not installed/);
  assert.ok(!existsSync(join(dir, "style-refs", "x")));
});

test("with consent but no yt-dlp, the error names the install command", () => {
  const dir = project({ download: true });
  const r = fetchCli({ ONE_STUDIO_YTDLP: "/nonexistent/yt-dlp" }, dir, "https://www.youtube.com/watch?v=x");
  assert.equal(r.code, 1);
  assert.match(r.err, /brew install yt-dlp/);
});

test("non-http links and over-long spans are refused", () => {
  const dir = project({ download: true });
  assert.match(fetchCli({}, dir, "ftp://host/video.mp4").err, /http/);
  assert.match(fetchCli({}, dir, "https://a.b/v", "--to", "5:00").err, /--max/);
});

test("local file: cut to the requested span with a valid info.json", { skip: !hasFfmpeg }, () => {
  const dir = project();
  const src = join(tmp(), "Video Mẫu Dài.mp4");
  const gen = spawnSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=25", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "120", "-shortest", "-pix_fmt", "yuv420p", src]);
  assert.equal(gen.status, 0, String(gen.stderr));
  const r = fetchCli({}, dir, src, "--to", "0:30");
  assert.equal(r.code, 0, r.err);
  const slug = /slug: (\S+)/.exec(r.out)[1];
  assert.equal(slug, "video-mau-dai");
  const info = readJson(join(dir, "style-refs", slug, "info.json"));
  assert.equal(info.file, "source.mp4");
  assert.equal(info.platform, "other");
  assert.ok(Math.abs(info.duration - 30) <= 0.1, `duration ${info.duration}`);
  assert.deepEqual(info.range.from, 0);
  assert.ok(Math.abs(info.range.to - 30) <= 0.1);
  assert.match(info.accessed, /^\d{4}-\d\d-\d\dT/);
  assert.equal(info.subs, false);
  assert.match(readFileSync(join(dir, "style-refs", ".gitignore"), "utf8"), /\*\/source\.\*/);
  // A second fetch of the same name gets a new slug.
  assert.match(fetchCli({}, dir, src, "--from", "0:10", "--to", "0:14").out, /slug: video-mau-dai-2/);
});

test("link download through a stub binary keeps subs and a minimal info.json", { skip: !hasFfmpeg }, () => {
  const dir = project({ download: true });
  const bin = join(tmp(), "yt-dlp");
  writeFileSync(bin, `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const a = process.argv.slice(2);
if (a[0] === "--version") process.exit(0);
const out = a[a.indexOf("-o") + 1].replace("%(ext)s", "mp4");
const base = out.slice(0, -".mp4".length);
if (a.includes("--cookies") || a.some((x) => x.startsWith("--cookies"))) process.exit(3);
if (process.env.STUB_FAIL) { console.error("ERROR: Sign in to confirm your age"); process.exit(1); }
spawnSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=10", "-t", "4", "-pix_fmt", "yuv420p", out]);
writeFileSync(base + ".en.vtt", "WEBVTT\\n");
writeFileSync(base + ".info.json", JSON.stringify({ title: "Hello World", uploader: "Chan", webpage_url: "https://www.tiktok.com/@c/video/1", duration: 200, extractor: "TikTok", width: 320, height: 180, http_headers: { Cookie: "x" } }));
`);
  chmodSync(bin, 0o755);
  const url = "https://www.tiktok.com/@c/video/1";
  const r = fetchCli({ ONE_STUDIO_YTDLP: bin }, dir, url, "--from", "0:05", "--to", "0:09");
  assert.equal(r.code, 0, r.err);
  const slug = "hello-world";
  const sdir = join(dir, "style-refs", slug);
  const info = readJson(join(sdir, "info.json"));
  assert.equal(info.url, url);
  assert.equal(info.platform, "tiktok");
  assert.equal(info.channel, "Chan");
  assert.equal(info.subs, true);
  assert.equal(info.range.from, 5);
  assert.ok(Math.abs(info.range.to - 9) <= 0.2);
  assert.ok(existsSync(join(sdir, "subs.vtt")) && existsSync(join(sdir, "source.mp4")));
  assert.equal(JSON.stringify(info).includes("Cookie"), false);
  assert.deepEqual(readdirNames(sdir), ["info.json", "source.mp4", "subs.vtt"]);
  // Failure leaves nothing behind and speaks the login advice.
  const bad = fetchCli({ ONE_STUDIO_YTDLP: bin, STUB_FAIL: "1" }, dir, url);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /đường dẫn file/);
  assert.deepEqual(readdirNames(join(dir, "style-refs")).filter((n) => n !== ".gitignore"), [slug]);
});

test("neededTools asks for yt-dlp only while a linked reference has no footage", () => {
  const dir = project();
  const sdir = join(dir, "style-refs", "a");
  mkdirSync(sdir, { recursive: true });
  writeJson(join(sdir, "info.json"), { url: "https://youtu.be/x", file: "source.mp4" });
  assert.ok(neededTools(loadProject(dir)).includes("yt-dlp"));
  writeFileSync(join(sdir, "source.mp4"), "x");
  assert.ok(!neededTools(loadProject(dir)).includes("yt-dlp"));
});

function readdirNames(d) {
  return spawnSync("ls", ["-A", d], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).sort();
}
