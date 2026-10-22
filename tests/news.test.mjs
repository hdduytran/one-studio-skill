// News recap: research table parsing, on-screen opinion/quote chips, sources in the publish manifest, lint rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, scene, tmp, writeJson } from "./helpers.mjs";
import { parseResearch, sourceIds } from "../plugins/one-studio/skills/one-studio/scripts/lib/research.mjs";
import { lintText } from "../plugins/one-studio/skills/one-studio/scripts/script-lint.mjs";
import { lineLabel, writeLineTimes } from "../plugins/one-studio/skills/one-studio/scripts/lib/scenes.mjs";
import { citedSources, sourcesText } from "../plugins/one-studio/skills/one-studio/scripts/publish.mjs";
import { loadProject } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { brandToCss } from "../plugins/one-studio/skills/one-studio/scripts/brand-to-css.mjs";

const RESEARCH = `# Research

<!-- | r9 | fact | hidden | x | | | | | -->

| id | type | content | source | url | published | accessed | speaker |
|---|---|---|---|---|---|---|---|
| r1 | fact | Ngân hàng Mẫu tăng hạn mức | Báo Ví Dụ | https://example.org/a | 2026-07-01 | 2026-10-20 | |
| r2 | quote | "Chúng tôi không có lỗi" | Báo Mẫu | https://example.org/b | 2026-07-02 | 2026-10-20 | Bà Lan Mẫu |
| r3 | opinion | Thời hạn quá gấp | Blog Ví Dụ | https://example.org/c | 2026-07-03 | 2026-10-20 | |
`;

function newsProject(lines) {
  const dir = join(tmp(), "n");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi").code, 0);
  const sc = scene("s01", "text", { duration: 4, lines });
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [sc] });
  writeFileSync(join(dir, "research.md"), RESEARCH);
  writeFileSync(join(dir, "scenes", "s01.html"), `<div id="root" data-composition-id="s01" data-duration="4"></div>`);
  return dir;
}

test("research.md parses by header name and ignores comments", () => {
  const rows = parseResearch(RESEARCH);
  assert.deepEqual(rows.map((r) => r.id), ["r1", "r2", "r3"]);
  assert.equal(rows[1].speaker, "Bà Lan Mẫu");
  assert.equal(rows[0].published, "2026-07-01");
  assert.deepEqual(sourceIds(["r1,r2", "r3"]), ["r1", "r2", "r3"]);
  assert.deepEqual(sourceIds(undefined), []);
});

test("chip labels: opinion by language, quote speaker and outlet", () => {
  const research = parseResearch(RESEARCH);
  assert.equal(lineLabel({ kind: "opinion" }, "vi", research), "Ý KIẾN");
  assert.equal(lineLabel({ kind: "opinion" }, "en", research), "OPINION");
  assert.equal(lineLabel({ kind: "quote", speaker: "Bà Lan Mẫu", source: "r2" }, "vi", research), "Bà Lan Mẫu · Báo Mẫu");
  assert.equal(lineLabel({ kind: "fact", source: "r1" }, "vi", research), null);
});

test("labels are written into os-lines without touching plain lines; approval hash is unchanged", () => {
  const dir = newsProject([
    { id: "s01-1", text: "Một.", kind: "fact", source: "r1" },
    { id: "s01-2", text: "Hai.", kind: "quote", speaker: "Bà Lan Mẫu", source: "r2" },
    { id: "s01-3", text: "Ba.", kind: "opinion" },
  ]);
  const p = loadProject(dir);
  const timing = [{ id: "s01-1", start: 0.3, duration: 1 }, { id: "s01-2", start: 1.5, duration: 1 }, { id: "s01-3", start: 3, duration: 0.8 }];
  assert.equal(writeLineTimes(p, p.storyboard.scenes[0], timing), true);
  const html = readFileSync(join(dir, "scenes", "s01.html"), "utf8");
  const json = JSON.parse(/id="os-lines">(.*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(json["s01-1"], { start: 0.3, end: 1.3 });
  assert.deepEqual(json["s01-2"], { start: 1.5, end: 2.5, kind: "quote", label: "Bà Lan Mẫu · Báo Mẫu" });
  assert.equal(json["s01-3"].label, "Ý KIẾN");
  assert.equal(writeLineTimes(p, p.storyboard.scenes[0], timing), false, "idempotent");
});

test("brand.css carries the label classes from brand variables only", () => {
  const dir = newsProject([]);
  brandToCss(loadProject(dir), { offline: true });
  const css = readFileSync(join(dir, "assets", "brand.css"), "utf8");
  assert.match(css, /\.os-label-opinion \{[^}]*var\(--c-accent\)/);
  assert.match(css, /\.os-label-quote \{/);
  assert.doesNotMatch(css.slice(css.indexOf(".os-label")), /#[0-9a-f]{3,6}\b/i, "no hard-coded colours");
});

test("publish lists only the sources the storyboard lines cite", () => {
  const dir = newsProject([
    { id: "s01-1", text: "Một.", kind: "fact", source: ["r1"] },
    { id: "s01-2", text: "Hai.", kind: "quote", speaker: "Bà Lan Mẫu", source: "r2" },
  ]);
  assert.deepEqual(citedSources(loadProject(dir)), [
    { id: "r1", name: "Báo Ví Dụ", url: "https://example.org/a", published: "2026-07-01", accessed: "2026-10-20" },
    { id: "r2", name: "Báo Mẫu", url: "https://example.org/b", published: "2026-07-02", accessed: "2026-10-20" },
  ]);
  const none = newsProject([{ id: "s01-1", text: "Một." }]);
  assert.deepEqual(citedSources(loadProject(none)), []);
  writeFileSync(join(none, "research.md"), "");
  assert.deepEqual(citedSources(loadProject(none)), []);
});

test("lint: fact without source and unknown source id are errors with the new research layout", () => {
  const opts = { language: "vi", playbook: "news-recap", research: RESEARCH };
  const text = (src) => `## s01 · T\n\n- Ngân hàng tăng hạn mức.\n> visual: hình\n> silence: 1s\n${src}\n`;
  assert.deepEqual(lintText(text("> source: r1,r2"), opts).filter((v) => v.severity === "error"), []);
  assert.ok(lintText(text(""), opts).some((v) => v.rule === "missing-source" && v.severity === "error"));
  assert.ok(lintText(text("> source: r7"), opts).some((v) => v.rule === "unknown-source" && v.severity === "error"));
});

// Real render: the chip appears only on the scene whose line is an opinion.
const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
test("an opinion line shows its chip in the rendered still", { skip: !chrome && "no Chrome for HyperFrames" }, () => {
  const dir = join(tmp(), "chip");
  assert.equal(run("init-project.mjs", dir, "--lang", "vi", "--title", "Chip", "--duration", "4").code, 0);
  const mk = (id, kind) => scene(id, "text", { duration: 4, lines: [{ id: `${id}-1`, text: "Ý của tôi.", ...(kind && { kind }) }] });
  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [mk("s01", "opinion"), mk("s02", null)] });
  assert.equal(run("prepare-project.mjs", dir).code, 0);
  assert.equal(run("new-scene.mjs", dir, "--all").code, 0);
  const p = loadProject(dir);
  for (const sc of p.storyboard.scenes) assert.equal(writeLineTimes(p, sc, [{ id: `${sc.id}-1`, start: 0.3, duration: 3 }]), sc.id === "s01");
  const r = run("keyframe-stills.mjs", dir, "--no-exports");
  assert.equal(r.code, 0, r.out + r.err);
  // The chip sits in the top-left corner: crop it from each still and compare.
  const crop = (id, at) => {
    const f = walk(join(dir, "review", id)).find((x) => x.endsWith(`-at-${at}s.png`));
    assert.ok(f, `still ${id} at ${at}s`);
    return spawnSync("ffmpeg", ["-v", "error", "-i", f, "-vf", "crop=400:140:40:20", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 }).stdout;
  };
  const spoken = crop("s01", 2);
  assert.ok(spoken.length > 0);
  assert.ok(!spoken.equals(crop("s01", 3.4)), "chip is gone after the line ends");
  assert.ok(!spoken.equals(crop("s02", 2)), "a plain line shows no chip");
});

function walk(d) {
  return readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
}

test("sources.txt lists each URL once, even when several research rows quote the same article", () => {
  const a = { name: "Anthropic, bài công bố", url: "https://claude.com/a", published: "2026-10-21" };
  const b = { name: "Anthropic, trang sản phẩm", url: "https://claude.com/b", published: "2026-10-21" };
  const text = sourcesText([{ id: "r1", ...a }, { id: "r2", ...a }, { id: "r3", ...b }, { id: "r4", ...a }, { id: "r5", name: "Phỏng vấn", url: "" }], "vi");
  assert.equal(text, "Nguồn:\n- Anthropic, bài công bố https://claude.com/a (2026-10-21)\n- Anthropic, trang sản phẩm https://claude.com/b (2026-10-21)\n- Phỏng vấn\n");
});
