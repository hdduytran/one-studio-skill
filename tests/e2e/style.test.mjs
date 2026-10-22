// Style extraction end to end on a synthetic clip, no network: fetch (file) -> analyze -> draft -> read-by-eye
// fields -> compare -> enhance -> style-set -> apply into a copy of examples/demo -> validate -> render plan.
// Needs Chrome (sample scenes) and FFmpeg; skips cleanly without them.
// Run: node --test --test-timeout=1800000 tests/e2e/style.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run, readJson, tmp, writeJson } from "../helpers.mjs";
import { makeFixtures } from "../fixtures/style/make-style-fixtures.mjs";
import { cdpAvailable, findChrome } from "../../plugins/one-studio/skills/one-studio/scripts/lib/cdp.mjs";

const ready = Boolean(findChrome()) && cdpAvailable() && spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const SLUG = "synthetic";

// Presets saved by --as-preset go to a throwaway cache; the network is never touched (a file, not a link).
const cache = tmp();
process.env.ONE_STUDIO_CACHE = cache;
const presets = await import("../../plugins/one-studio/skills/one-studio/scripts/lib/presets.mjs");

function ok(script, ...args) {
  const r = run(script, ...args);
  assert.equal(r.code, 0, `${script} ${args.join(" ")}\n${r.out}\n${r.err}`);
  return r.out;
}

// What Claude fills after looking at the sheets: values fixed here, marked as read by eye.
function fillSeenFields(file) {
  const style = readJson(file);
  const seen = (path) => (style.provenance[path] = { source: "seen" });
  Object.assign(style.brand, {
    surface: "flat",
    typography: { heading: { family: "Montserrat", weight: 800 }, body: { family: "Inter", weight: 400 } },
    captions: { position: "bottom", size: 48 },
  });
  style.brand.colors = { ...style.brand.colors, bg: "#ffffff", fg: "#555555", primary: "#d62828", accent: "#1d3557" };
  for (const p of ["brand.surface", "brand.typography.heading", "brand.typography.body", "brand.captions.position", "brand.captions.size", "brand.colors.bg", "brand.colors.fg", "brand.colors.primary", "brand.colors.accent"]) seen(p);
  style.do_not_copy = ["logo"];
  writeJson(file, style);
}

test("style extraction: file -> card -> compare -> enhance -> apply -> validate -> render plan", { skip: !ready && "needs Chrome and FFmpeg" }, () => {
  const clips = makeFixtures(join(tmp(), "clips"));
  const dir = join(tmp(), "demo");
  cpSync("examples/demo", dir, { recursive: true });
  const sd = join(dir, "style-refs", SLUG);

  ok("style-fetch.mjs", dir, clips.cuts, "--slug", SLUG);
  assert.ok(readdirSync(sd).some((f) => f.startsWith("source.")), "local file copied, no network used");
  ok("style-analyze.mjs", dir, SLUG);
  const metrics = readJson(join(sd, "metrics.json"));
  assert.ok(metrics.pacing.cuts.length >= 4, "cuts found");
  assert.equal(readdirSync(join(dir, "review")).filter((f) => f.startsWith(`style-${SLUG}-`) && f.endsWith(".jpg")).length, 2, "two contact sheets");

  ok("style-draft.mjs", dir, SLUG);
  fillSeenFields(join(sd, "style.json"));
  ok("style-draft.mjs", dir, SLUG, "--check");

  ok("style-compare.mjs", dir, SLUG, "--offline");
  assert.ok(existsSync(join(dir, "review", `style-${SLUG}-compare.jpg`)));

  // The grey text on white fails WCAG AA: apply refuses until the contrast proposal is accepted.
  const refused = run("style-apply.mjs", dir, SLUG);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /WCAG AA/);
  const brandBefore = readJson(join(dir, "brand", "brand.json"));
  const proposals = ok("style-enhance.mjs", dir, SLUG, "--no-sheet");
  const number = /(\d+)\. \[contrast\]/.exec(proposals)?.[1];
  assert.ok(number, proposals);
  ok("style-enhance.mjs", dir, SLUG, "--accept", number);
  ok("style-set.mjs", dir, SLUG, "motion.stagger=0.07");
  assert.match(ok("style-diff.mjs", dir, SLUG), /motion\.stagger/);
  ok("style-compare.mjs", dir, SLUG, "--offline");

  const dry = ok("style-apply.mjs", dir, SLUG, "--dry-run");
  const [, reapprove, scenes] = /(\d+) of (\d+) scene\(s\) need re-approval/.exec(dry);
  assert.deepEqual(readJson(join(dir, "brand", "brand.json")), brandBefore, "dry run writes nothing");

  ok("style-apply.mjs", dir, SLUG, "--as-preset", "e2e-synthetic");
  const brand = readJson(join(dir, "brand", "brand.json"));
  assert.equal(brand.version, (brandBefore.version ?? 1) + 1);
  assert.equal(brand.motion.stagger, 0.07);
  assert.deepEqual(readJson(join(dir, "studio.json")).story.style, { slug: SLUG });
  assert.ok(!readdirSync(sd).some((f) => f.startsWith("source.")), "reference footage removed after apply");
  for (const d of ["assets", "out"]) if (existsSync(join(dir, d))) assert.ok(!JSON.stringify(readdirSync(join(dir, d), { recursive: true })).includes(SLUG), `nothing from style-refs/ in ${d}/`);

  assert.match(ok("validate.mjs", dir), /valid/);
  assert.ok(existsSync(join(cache, "presets", "e2e-synthetic.json")));
  assert.ok(presets.loadPresets()["e2e-synthetic"], "saved preset is listed with the others");
  assert.match(run("init-project.mjs", "--help").out, /e2e-synthetic/); // exits 1 without a directory but lists every preset

  // Every scene hash includes the brand version, so each scene with a source is stale now.
  const planRun = run("render-changed-scenes.mjs", dir, "--dry-run", "--json"); // exit 2: scenes blocked until re-approved
  assert.ok([0, 2].includes(planRun.code), planRun.err);
  const plan = JSON.parse(planRun.out);
  assert.equal(plan.length, Number(scenes));
  assert.equal(plan.filter((p) => p.action !== "cached").length, Number(scenes));
  assert.ok(Number(reapprove) <= Number(scenes));
  assert.equal(status(dir).style.changed, false);
  rmSync(cache, { recursive: true, force: true });
});

const status = (dir) => JSON.parse(ok("status.mjs", dir, "--json"));
