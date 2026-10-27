// A project under a folder with a library/: preset from the library, scenes from a mockup kit, a library
// playbook listed, keyframe stills rendered, and a 9:16 block next to the kit styles kept out of 16:9.
// Run: HYPERFRAMES_BROWSER_PATH=<headless_shell> npm run test:e2e
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, run, tmp, writeJson } from "../helpers.mjs";

const chrome = Boolean(process.env.HYPERFRAMES_BROWSER_PATH) || spawnSync("npx", ["--yes", "hyperframes@0.8.181", "browser", "path"], { encoding: "utf8" }).status === 0;
const ok = (script, ...args) => {
  const r = run(script, ...args);
  assert.equal(r.code, 0, `${script}\n${r.out}\n${r.err}`);
  return r.out;
};
// Mean colour of a 4×4 patch near the top-left corner (page background, clear of the centred component).
const corner = (png) => [...spawnSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=4:4:20:20,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout];
const still = (dir) => join(dir, readdirSync(dir).find((f) => f.endsWith(".png")));

test("library preset + kit scenes render, the library playbook is listed, 16:9 has no 9:16 leak", { skip: !chrome && "no Chrome for HyperFrames" }, () => {
  delete process.env.ONE_STUDIO_LIBRARY;
  const root = tmp();
  cpSync("examples/library", join(root, "library"), { recursive: true });
  const dir = join(root, "launch");
  ok("init-project.mjs", dir, "--lang", "vi", "--duration", "20", "--platform", "shorts", "--preset", "claude-duet-light");
  assert.equal(readJson(join(dir, "brand", "brand.json")).colors.surface, "#faf9f5");
  assert.match(ok("library.mjs", dir, "--playbooks"), /product-launch-short\s+library/);

  writeJson(join(dir, "storyboard.json"), { version: 1, scenes: [{ id: "s01", type: "text", duration: 3, lines: [] }, { id: "s02", type: "text", duration: 3, lines: [] }] });
  ok("prepare-project.mjs", dir);
  ok("new-scene.mjs", dir, "s01", "--kit", "claude-duet", "--component", "phone-lock-notification");
  ok("new-scene.mjs", dir, "s02", "--kit", "claude-duet", "--component", "approval-card");
  const file = join(dir, "scenes", "s01.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("</head>", '<style data-ratio="9:16">\n  #root { background: rgb(255, 0, 0) !important; }\n</style>\n</head>'));

  ok("keyframe-stills.mjs", dir, "--frames", "1");
  const [r, g, b] = corner(still(join(dir, "review", "s01")));
  assert.ok(!(r > 200 && g < 60 && b < 60), `16:9 still shows the 9:16 rule (${r},${g},${b})`);
  assert.ok(Math.abs(r - 0xcc) < 12 && Math.abs(b - 0xd8) < 12, "16:9 background is the preset's lavender");
  const [r9, g9] = corner(still(join(dir, "review", "9x16", "s01")));
  assert.ok(r9 > 200 && g9 < 60, "9:16 still has its rule");
  assert.equal(run("validate.mjs", dir).code, 0);
});
