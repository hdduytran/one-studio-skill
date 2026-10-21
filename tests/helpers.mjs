import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const SCRIPTS = resolve("plugins/one-studio/skills/one-studio/scripts");

export function run(script, ...args) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

export const tmp = () => mkdtempSync(join(process.env.ONE_STUDIO_TEST_TMP ?? tmpdir(), "one-studio-"));
export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
export const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

export const scene = (id, type = "text", extra = {}) => ({
  id,
  type,
  duration: 5,
  lines: [{ id: `${id}-1`, text: `Câu của ${id}.` }],
  ...extra,
});
