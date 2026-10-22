#!/usr/bin/env node
// Draft style-refs/<slug>/style.json from metrics.json, or list what is still open.
//   node style-draft.mjs <project-dir> <slug> [--force]   write the draft (refuses to overwrite an existing style.json)
//   node style-draft.mjs <project-dir> <slug> --check     validate style.json and list fields still missing or guessed
// The draft carries only what the numbers support. Fields that need eyes (surface, fonts, captions, visual
// modes, tone, hook, do_not_copy) are left out; read the sheets, fill them with source "seen", then run --check.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isMain, loadProject, parseArgs, readJson, writeJson } from "./lib/project.mjs";
import { styleDir, styleErrors } from "./lib/style-refs.mjs";
import { buildDraft, remainingFields } from "./lib/style-map.mjs";

// Writes the draft and returns { file, style, notes }.
export function draft(dir, slug, { force = false } = {}) {
  const sd = styleDir(dir, slug);
  const metricsFile = join(sd, "metrics.json");
  if (!existsSync(metricsFile)) throw new Error(`No metrics in ${sd} (run style-analyze.mjs first)`);
  const out = join(sd, "style.json");
  if (existsSync(out) && !force) throw new Error(`${out} already exists; it may hold fields read by eye. Use --force to replace it, or --check to review it`);
  const infoFile = join(sd, "info.json");
  const { style, notes } = buildDraft(readJson(metricsFile), existsSync(infoFile) ? readJson(infoFile) : {}, { slug });
  const errors = styleErrors(style, { slug });
  if (errors.length) throw new Error(`Draft is invalid (bug):\n  ${errors.join("\n  ")}`);
  writeJson(out, style);
  return { file: out, style, notes };
}

// Validates style.json (against the project brand when the folder is a project) -> { errors, open }.
export function check(dir, slug) {
  const file = join(styleDir(dir, slug), "style.json");
  if (!existsSync(file)) throw new Error(`No style at ${file} (run style-draft.mjs first)`);
  const style = readJson(file);
  let brand = null;
  try {
    brand = loadProject(dir).brand;
  } catch {
    // a bare folder without studio.json: schema and provenance checks still apply
  }
  return { errors: styleErrors(style, { slug, brand }), open: remainingFields(style) };
}

const line = (o) => `${o.state === "missing" ? "MISSING" : "GUESSED"} ${o.path} <- ${o.hint}${o.note ? ` (${o.note})` : ""}`;

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help", "check", "force"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-draft.mjs <project-dir> <slug> [--check | --force]");
      process.exit(dir && slug ? 0 : 1);
    }
    if (args.check) {
      const { errors, open } = check(dir, slug);
      for (const e of errors) console.log(`ERROR ${e}`);
      for (const o of open) console.log(line(o));
      console.log(errors.length ? `${errors.length} error(s)` : open.length ? `Valid; ${open.length} field(s) still to fill or confirm` : "Valid; nothing left to fill");
      process.exit(errors.length ? 1 : 0);
    }
    const { file, style, notes } = draft(dir, slug, { force: args.force });
    const fields = Object.keys(style.provenance).length;
    console.log(`Draft: ${file} (${fields} fields from measurements)`);
    for (const n of notes) console.log(`· ${n}`);
    for (const o of check(dir, slug).open) console.log(line(o));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
