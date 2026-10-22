import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKind } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { readJson } from "./helpers.mjs";

const demo = () => readJson("examples/demo/studio.json");

test("studio schema accepts a project without story (backward compatible)", () => {
  const studio = demo();
  delete studio.story;
  assert.deepEqual(validateKind("studio", studio), []);
});

test("studio schema accepts story choices and web/capture services", () => {
  const studio = demo();
  studio.story = { playbook: "concept-explainer", format: "short-vertical", tone: "warm", modes: ["world-camera", "kinetic-type"] };
  studio.services = { ...studio.services, web: true, capture: false };
  assert.deepEqual(validateKind("studio", studio), []);
  studio.story = { playbook: "news-recap" };
  assert.deepEqual(validateKind("studio", studio), []);
});

test("studio schema rejects malformed story", () => {
  const studio = demo();
  studio.story = { playbook: "Bad Id", modes: ["a", "a"], extra: 1 };
  const errors = validateKind("studio", studio).join("\n");
  assert.match(errors, /story\.playbook/);
  assert.match(errors, /story\.modes/);
  assert.match(errors, /story\.extra: unknown property/);
  studio.story = { modes: "world-camera" };
  assert.match(validateKind("studio", studio).join(), /story\.modes/);
  studio.story = {};
  studio.services = { web: "yes" };
  assert.match(validateKind("studio", studio).join(), /services\.web/);
});
