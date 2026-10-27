// Target platforms: 9:16 exports for Shorts / TikTok / Reels, captions out of their UI, length limits, ratio previews.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readJson, run, tmp } from "./helpers.mjs";
import { captionSafe, missingRatios, parsePlatforms, platformWarnings } from "../plugins/one-studio/skills/one-studio/scripts/lib/platforms.mjs";
import { captionStyle } from "../plugins/one-studio/skills/one-studio/scripts/concat-and-mix.mjs";
import { ratioSettings } from "../plugins/one-studio/skills/one-studio/scripts/lib/ratio-render.mjs";

test("platform names parse, vertical ones ask for a 9:16 export and warn past their length limit", () => {
  assert.deepEqual(parsePlatforms("Shorts, tiktok,shorts"), ["shorts", "tiktok"]);
  assert.throws(() => parsePlatforms("myspace"), /unknown "myspace"/);
  assert.deepEqual(missingRatios({ aspect: "16:9", exports: ["16:9"], platforms: ["youtube", "shorts", "reels"] }), ["9:16"]);
  assert.deepEqual(missingRatios({ aspect: "9:16", exports: ["9:16"], platforms: ["tiktok"] }), []);
  assert.deepEqual(platformWarnings({ format: { target_duration: 200, platforms: ["shorts", "tiktok"] } }), ["YouTube Shorts accepts at most 180s; the target is 200s"]);
});

test("init --platform shorts adds the 9:16 export and records the platform", () => {
  const dir = join(tmp(), "p");
  const r = run("init-project.mjs", dir, "--platform", "shorts", "--duration", "65");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /YouTube Shorts → added export 9:16/);
  const st = readJson(join(dir, "studio.json"));
  assert.deepEqual(st.format.exports, ["16:9", "9:16"]);
  assert.deepEqual(st.format.platforms, ["shorts"]);
  assert.equal(run("validate.mjs", dir).code, 0);
  assert.notEqual(run("init-project.mjs", join(tmp(), "q"), "--platform", "vine").code, 0);
});

test("9:16 captions keep out of the Shorts / TikTok UI only when such a platform is the target", () => {
  const project = { studio: { format: { platforms: ["shorts"] } } };
  assert.ok(captionSafe(project, 1080, 1920));
  assert.ok(!captionSafe(project, 1920, 1080), "landscape: no UI overlay");
  assert.ok(!captionSafe({ studio: { format: { platforms: ["youtube"] } } }, 1080, 1920));
  const plain = captionStyle({}, 1080, 1920);
  const safe = captionStyle({}, 1080, 1920, { safe: true });
  assert.match(plain, /MarginV=17(,|$)/);
  assert.match(safe, /MarginV=66,MarginL=46,MarginR=46/);
});

test("ratio previews keep the short side at preview_height", () => {
  const studio = { format: { width: 1920, height: 1080, fps: 30 }, render: { preview_height: 540 } };
  assert.deepEqual([ratioSettings(studio, "9:16", "preview").width, ratioSettings(studio, "9:16", "preview").height], [540, 960]);
  assert.deepEqual([ratioSettings(studio, "9:16", "final").width, ratioSettings(studio, "9:16", "final").height], [1080, 1920]);
});
