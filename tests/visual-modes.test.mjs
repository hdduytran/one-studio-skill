import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { validateKind } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { visualRefErrors } from "../plugins/one-studio/skills/one-studio/scripts/lib/visual-refs.mjs";
import { readJson } from "./helpers.mjs";

const MODES_DIR = "plugins/one-studio/skills/writers-room/visual-modes";
const sc = (id, extra = {}) => ({ id, type: "diagram", duration: 5, ...extra });
const rich = () => ({
  version: 1,
  worlds: { city: { file: "worlds/city.html", size: { w: 4000, h: 2400 } } },
  motifs: [{ id: "invoice", selector: "#inv", note: "crumpled to flat" }],
  scenes: [
    sc("s01", {
      mode: "world-camera",
      world: "city",
      camera: { from: "a", to: { x: 10, y: 20, zoom: 2 }, move: "fly", ease: "power2.inOut", at: 0, dur: 3 },
      exit_state: { sat: "signal" },
      motif: ["invoice"],
      handoff: { selector: "#inv", to_scene: "s02" },
      motion: "stepped-12",
      lines: [
        { id: "s01-1", text: "Hi.", kind: "quote", speaker: "Ada", source: ["r1", "r2"] },
        { id: "s01-2", text: "Yes.", kind: "fact", source: "r1" },
      ],
    }),
    sc("s02", { mode: "match-cut-motif" }),
  ],
});

test("storyboard without visual fields stays valid", () => {
  assert.deepEqual(validateKind("storyboard", readJson("examples/demo/storyboard.json")), []);
});

test("storyboard with worlds, camera, motifs and line kinds is valid", () => {
  const sb = rich();
  assert.deepEqual(validateKind("storyboard", sb), []);
  assert.deepEqual(visualRefErrors(sb), []);
});

test("schema rejects unknown mode, camera move and line kind", () => {
  const sb = rich();
  sb.scenes[0].mode = "sparkle";
  sb.scenes[0].camera.move = "teleport";
  sb.scenes[0].lines[0].kind = "rumour";
  const errors = validateKind("storyboard", sb).join("\n");
  assert.match(errors, /mode: must be one of/);
  assert.match(errors, /camera\.move: must be one of/);
  assert.match(errors, /kind: must be one of/);
});

test("cross-checks reject bad world, motif, handoff and orphan camera", () => {
  const sb = rich();
  sb.scenes[0].world = "moon";
  sb.scenes[0].motif = ["ghost"];
  sb.scenes[0].handoff.to_scene = "s09";
  sb.scenes[1].camera = { to: "a" };
  const errors = visualRefErrors(sb).join("\n");
  assert.match(errors, /s01: world "moon" is not declared/);
  assert.match(errors, /s01: motif "ghost" is not declared/);
  assert.match(errors, /s01: handoff\.to_scene "s09" must be the next scene \(s02\)/);
  assert.match(errors, /s02: camera needs a world/);
});

test("every mode id has a mode file and an index line", () => {
  const schema = readJson("plugins/one-studio/skills/one-studio/schemas/storyboard.schema.json");
  const ids = schema.$defs.visualMode.enum;
  const files = readdirSync(MODES_DIR).filter((f) => f !== "index.md").map((f) => f.replace(/\.md$/, ""));
  assert.deepEqual([...files].sort(), [...ids].sort());
  const index = readFileSync(`${MODES_DIR}/index.md`, "utf8");
  for (const id of ids) {
    assert.ok(index.includes(`\`${id}\``), `index lists ${id}`);
    assert.ok(readFileSync(`${MODES_DIR}/${id}.md`, "utf8").split("\n").length <= 60, `${id} is at most 60 lines`);
  }
});

test("stepped-12 holds the same time inside a step and advances between steps", () => {
  const ctx = { window: {}, document: { currentScript: null } };
  vm.runInNewContext(readFileSync("plugins/one-studio/skills/one-studio/templates/hyperframes-project/assets/os.js", "utf8"), ctx);
  const { stepTime } = ctx.window.OS;
  assert.equal(stepTime(0.1), stepTime(0.1 + 1 / 60));
  assert.equal(stepTime(0.1), 1 / 12);
  assert.equal(stepTime(0.25), 0.25, "exact grid time stays on its step");
  assert.equal(stepTime(0.0), 0);
  assert.ok(stepTime(1 / 12 + 1 / 30) < 2 / 12);
  assert.ok(stepTime(2 / 12) > stepTime(2 / 12 - 1 / 30));
});
