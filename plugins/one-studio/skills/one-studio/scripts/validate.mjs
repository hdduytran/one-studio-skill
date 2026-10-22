#!/usr/bin/env node
// Validate one-studio files against their schemas.
//   node validate.mjs <project-dir>                 studio.json + storyboard.json + brand + cross-file checks
//   node validate.mjs <file.json> [--schema kind]   one file; kind inferred from the name (studio|storyboard|brand)
// Exit 0 when valid, 1 when not.
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { screenErrors } from "./lib/flow.mjs";
import { styleProjectResults } from "./lib/style-refs.mjs";
import { crossCheck, loadProject, parseArgs, readJson, validateKind } from "./lib/project.mjs";

const KINDS = ["studio", "storyboard", "brand"];

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["json", "help"], options: ["schema"] });
  const target = args._[0];
  if (args.help || !target) {
    console.log("usage: validate.mjs <project-dir | file.json> [--schema studio|storyboard|brand] [--json]");
    process.exit(target ? 0 : 1);
  }
  if (!existsSync(target)) fail(`Not found: ${target}`);

  const results = [];
  if (statSync(target).isDirectory()) {
    validateProject(target, results);
  } else if (!args.schema && basename(target) === "studio.json") {
    // A manifest is validated together with its project, so references are checked too.
    validateProject(dirname(target), results);
  } else {
    const kind = args.schema ?? KINDS.find((k) => basename(target).startsWith(k));
    if (!KINDS.includes(kind)) fail(`Cannot infer schema for ${target}; pass --schema ${KINDS.join("|")}`);
    results.push({ file: target, errors: validateKind(kind, readJson(target)) });
  }

  const ok = results.every((r) => r.errors.length === 0);
  if (args.json) console.log(JSON.stringify({ ok, results }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.errors.length ? "✗" : "✓"} ${r.file}`);
      for (const e of r.errors) console.log(`    ${e}`);
    }
    console.log(ok ? "valid" : "invalid");
  }
  process.exit(ok ? 0 : 1);
}

function validateProject(dir, results) {
  const project = loadProject(dir);
  results.push({ file: project.studioPath, errors: validateKind("studio", project.studio) });
  if (project.storyboard) {
    results.push({ file: project.storyboardPath, errors: validateKind("storyboard", project.storyboard) });
  }
  if (project.brand) results.push({ file: project.brandPath, errors: validateKind("brand", project.brand) });
  results.push(...styleProjectResults(project));
  results.push({ file: `${join(project.root)} (cross-file)`, errors: [...crossCheck(project), ...screenErrors(project)] });
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

try {
  main();
} catch (err) {
  fail(err.message);
}
