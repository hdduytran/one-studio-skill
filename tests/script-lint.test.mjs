import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run, readJson, tmp, writeJson } from "./helpers.mjs";

const { lintText, lintProject } = await import(pathToFileURL(resolve("plugins/one-studio/skills/one-studio/scripts/script-lint.mjs")).href);
const FIX = resolve("tests/fixtures/script-lint");
const fixture = (name) => readFileSync(join(FIX, name), "utf8");

const scene = (body, id = "s01") => `## ${id} · T\n\n> visual: hình\n> silence: 1s\n\n${body}\n`;
const rules = (text, opts) => lintText(text, opts).map((v) => `${v.rule}:${v.severity}`);
const has = (text, opts, rule, severity) => lintText(text, opts).some((v) => v.rule === rule && (!severity || v.severity === severity));

test("good two-column script has no violations", () => {
  assert.deepEqual(lintText(fixture("good-vi.md"), { language: "vi", playbook: "news-recap", research: fixture("research.md") }), []);
});

test("slop phrases are caught per language with a replacement hint", () => {
  const vi = lintText(scene("- Bạn có bao giờ tự hỏi vì sao trời xanh."), { language: "vi" });
  assert.equal(vi[0].rule, "slop");
  assert.equal(vi[0].severity, "error");
  assert.match(vi[0].message, /Mở bằng/);
  assert.ok(has(scene("- Điều này đóng vai trò vô cùng quan trọng."), { language: "vi" }, "slop"), "regex entry");
  assert.ok(has(scene("- Let's delve into the tapestry of data."), { language: "en" }, "slop", "error"));
  assert.ok(has(scene("- In conclusion, it works."), { language: "en" }, "slop", "error"), "anchored regex");
  assert.ok(!has(scene("- Bạn có bao giờ tự hỏi vì sao trời xanh."), { language: "en" }, "slop"), "vi list not used for en");
  assert.ok(!has(scene("- Phép tính kết luận ở cuối."), { language: "vi" }, "slop"));
});

test("sentences over 20 words warn, in both languages", () => {
  const long = Array(21).fill("từ").join(" ") + ".";
  assert.ok(has(scene(`- ${long}`), { language: "vi" }, "long-sentence", "warning"));
  assert.ok(has(scene(`- ${Array(21).fill("word").join(" ")}.`), { language: "en" }, "long-sentence"));
  assert.ok(!has(scene(`- ${Array(20).fill("word").join(" ")}.`), { language: "en" }, "long-sentence"));
  assert.ok(!has(scene(`- Short one. ${Array(15).fill("word").join(" ")}.`), { language: "en" }, "long-sentence"), "counted per sentence");
});

test("digits and symbols warn and point to say", () => {
  const v = lintText(scene("- Vệ tinh cao 20200 km."), { language: "vi" }).find((x) => x.rule === "write-for-ear");
  assert.equal(v.severity, "warning");
  assert.match(v.message, /say/);
  assert.ok(has(scene("- It grew 40% in 2026."), { language: "en" }, "write-for-ear"));
  assert.ok(!has(scene("- Nó chỉ nghe."), { language: "vi" }, "write-for-ear"));
});

test("more than one 'and then' style connector is an error", () => {
  const vi = scene("- Máy thu đo trễ và rồi tính vòng tròn.\n- Rồi thì thêm vệ tinh thứ hai.");
  assert.ok(has(vi, { language: "vi" }, "and-then", "error"));
  assert.ok(has(scene("- It listens and then measures.\n- It adds a satellite and then repeats."), { language: "en" }, "and-then", "error"));
  assert.ok(!has(scene("- It listens and then measures.\n- But one circle is not enough."), { language: "en" }, "and-then"), "one is allowed");
});

test("scene without > visual: is an error in the two-column format, a warning in old scripts", () => {
  const av = "## s01 · A\n\n> silence: 1s\n\n- Câu một.\n";
  assert.ok(has(av, {}, "missing-visual", "error"));
  const old = "## s01 · A\n\n- Câu một.\n\n## s02 · B\n\n> visual: hình\n\n- Câu hai.\n";
  const v = lintText(old, {}).filter((x) => x.rule === "missing-visual");
  assert.equal(v.length, 1);
  assert.equal(v[0].severity, "warning");
  assert.equal(v[0].line, 1);
  assert.ok(has(old, { hasStory: true }, "missing-visual", "error"), "recorded story means two-column");
  assert.ok(!has("## s01 · A\n\n<!-- > visual: hint -->\n> visual: hình\n\n- Câu.\n", {}, "missing-visual"), "comments are ignored");
  assert.ok(has("## s01 · A\n\n> visual:\n\n- Câu.\n", {}, "missing-visual"), "empty visual counts as missing");
  assert.ok(has("## s01 · A\n\n<!-- > visual: hint -->\n\n- Câu.\n", {}, "missing-visual"), "comments are ignored");
});

test("a script with no > silence: warns once", () => {
  const text = "## s01 · A\n\n> visual: hình\n\n- Câu một.\n";
  const v = lintText(text, {}).filter((x) => x.rule === "no-silence");
  assert.equal(v.length, 1);
  assert.equal(v[0].severity, "warning");
  assert.ok(!has(scene("- Câu một."), {}, "no-silence"));
});

test("news-recap needs > source: per scene and known ids", () => {
  const research = fixture("research.md");
  const opts = { language: "vi", playbook: "news-recap", research };
  const missing = "## s01 · A\n\n> visual: hình\n> silence: 1s\n\n- Chuyện một.\n- Chuyện hai.\n";
  const v = lintText(missing, opts).find((x) => x.rule === "missing-source");
  assert.equal(v.severity, "error");
  assert.equal(v.line, 6);
  assert.ok(has(missing.replace("- Chuyện một.", "> source: r1, r9\n\n- Chuyện một."), opts, "unknown-source", "error"));
  assert.ok(!has(missing.replace("- Chuyện một.", "> source: r1,r2\n\n- Chuyện một."), opts, "unknown-source"));
  assert.ok(!has(missing, { language: "vi" }, "missing-source"), "other playbooks do not need sources");
  assert.ok(has(missing.replace("- Chuyện một.", "> source: r1\n\n- Chuyện một."), { ...opts, research: null }, "unknown-source"), "no research.md means unknown");
});

test("word count vs duration warns above 90% (vi 2.8, en 2.5 words/s)", () => {
  const words = (n) => Array(n).fill("từ").join(" ");
  // 10 s: vi budget 28 words, 90% = 25.2; en budget 25, 90% = 22.5
  assert.ok(has(scene(`- ${words(26)}.`), { language: "vi", targetDuration: 10 }, "too-long", "warning"));
  assert.ok(!has(scene(`- ${words(25)}.`), { language: "vi", targetDuration: 10 }, "too-long"));
  assert.ok(has(scene(`- ${words(23)}.`), { language: "en", targetDuration: 10 }, "too-long"));
  assert.ok(!has(scene(`- ${words(22)}.`), { language: "en", targetDuration: 10 }, "too-long"));
  assert.ok(!has(scene(`- ${words(26)}.`), { language: "vi" }, "too-long"), "no duration, no check");
});

function project(script, { story } = {}) {
  const dir = join(tmp(), "ep");
  assert.equal(run("init-project.mjs", dir, "--title", "Thử").code, 0);
  writeFileSync(join(dir, "script.md"), script);
  if (story) {
    const studio = readJson(join(dir, "studio.json"));
    writeJson(join(dir, "studio.json"), { ...studio, story });
  }
  return dir;
}

test("CLI prints only violations, exits 1 on errors, 0 on warnings", () => {
  const bad = project(fixture("bad-vi.md"));
  const r = run("script-lint.mjs", bad);
  assert.equal(r.code, 1);
  assert.match(r.out, /^script\.md:\d+ · [a-z-]+ · (error|warn): /m);
  assert.match(r.out, /slop/);
  assert.match(r.out, /and-then/);
  assert.match(r.out, /missing-visual/);
  const json = JSON.parse(run("script-lint.mjs", bad, "--json").out);
  assert.equal(json.ok, false);
  assert.ok(json.violations.length >= 4);

  const good = project(fixture("good-vi.md"));
  const g = run("script-lint.mjs", good);
  assert.equal(g.code, 0);
  assert.equal(g.out.trim(), "");

  const warnOnly = project("## s01 · A\n\n> visual: hình\n\n- Câu một.\n");
  assert.equal(run("script-lint.mjs", warnOnly).code, 0);
  assert.equal(lintProject({ root: warnOnly, studio: readJson(join(warnOnly, "studio.json")) }).length, 1, "only the missing silence");
});

test("the old demo script produces warnings only", () => {
  const r = run("script-lint.mjs", resolve("examples/demo"));
  assert.equal(r.code, 0, r.out);
});

test("studio.json story switches to the news-recap rules and the two-column strictness", () => {
  const dir = project("## s01 · A\n\n> visual: hình\n> silence: 1s\n\n- Chuyện một.\n", { story: { playbook: "news-recap" } });
  copyFileSync(join(FIX, "research.md"), join(dir, "research.md"));
  const r = run("script-lint.mjs", dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /missing-source/);
});

test("status --approve script refuses on lint errors unless --force-lint", () => {
  const dir = project(fixture("bad-vi.md"));
  for (const f of ["brief.md"]) {
    const p = join(dir, f);
    writeFileSync(p, readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, "ok"));
  }
  assert.equal(run("status.mjs", dir, "--approve", "brief").code, 0);
  const refused = run("status.mjs", dir, "--approve", "script");
  assert.equal(refused.code, 1);
  assert.match(refused.err, /script-lint found \d+ error/);
  assert.match(refused.err, /script\.md:\d+ · slop/);
  assert.equal(readJson(join(dir, "studio.json")).gates.script?.done ?? false, false);

  const forced = run("status.mjs", dir, "--approve", "script", "--force-lint");
  assert.equal(forced.code, 0, forced.err);
  assert.equal(readJson(join(dir, "studio.json")).gates.script.done, true);

  const clean = project(fixture("good-vi.md"));
  const b = join(clean, "brief.md");
  writeFileSync(b, readFileSync(b, "utf8").replace(/<!--[\s\S]*?-->/g, "ok"));
  run("status.mjs", clean, "--approve", "brief");
  assert.equal(run("status.mjs", clean, "--approve", "script").code, 0);
});
