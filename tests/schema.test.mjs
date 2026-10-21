import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../plugins/one-studio/skills/one-studio/scripts/lib/schema.mjs";
import { validateKind } from "../plugins/one-studio/skills/one-studio/scripts/lib/project.mjs";
import { readJson } from "./helpers.mjs";

test("validator: types, required, enum, additionalProperties, $ref", () => {
  const schema = {
    type: "object",
    required: ["a"],
    additionalProperties: false,
    properties: { a: { $ref: "#/$defs/n" }, b: { enum: ["x", "y"] }, c: { type: ["string", "null"] } },
    $defs: { n: { type: "integer", minimum: 1 } },
  };
  assert.deepEqual(validate(schema, { a: 2, b: "x", c: null }), []);
  const errors = validate(schema, { a: 0, b: "z", d: 1 });
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /\$\.a: must be >= 1/);
  assert.match(errors.join("\n"), /\$\.b: must be one of/);
  assert.match(errors.join("\n"), /\$\.d: unknown property/);
  assert.match(validate(schema, {}).join(), /missing required "a"/);
  assert.match(validate(schema, { a: 1.5 }).join(), /expected integer/);
});

test("validator: anyOf / oneOf", () => {
  const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
  assert.deepEqual(validate(schema, "s"), []);
  assert.equal(validate(schema, true).length, 1);
  assert.equal(validate({ anyOf: [{ type: "integer" }, { type: "number" }] }, 3).length, 0);
});

test("demo files validate against their schemas", () => {
  assert.deepEqual(validateKind("studio", readJson("examples/demo/studio.json")), []);
  assert.deepEqual(validateKind("storyboard", readJson("examples/demo/storyboard.json")), []);
  assert.deepEqual(validateKind("brand", readJson("examples/demo/brand/brand.json")), []);
});

test("storyboard schema rejects bad scenes", () => {
  const bad = { version: 1, scenes: [{ id: "S 1", type: "video", duration: 0 }] };
  const errors = validateKind("storyboard", bad).join("\n");
  assert.match(errors, /id: "S 1" does not match/);
  assert.match(errors, /type: must be one of/);
  assert.match(errors, /duration: must be > 0/);
});

test("brand schema rejects bad colours and missing tokens", () => {
  const brand = readJson("examples/demo/brand/brand.json");
  brand.colors.accent = "orange";
  delete brand.motion.duration;
  const errors = validateKind("brand", brand).join("\n");
  assert.match(errors, /colors\.accent/);
  assert.match(errors, /missing required "duration"/);
});
