#!/usr/bin/env node
// Check the tools this project (or a named tool) needs, and print how to install what is missing.
// Never installs anything: ask the user, then run the printed command.
//   node check-external.mjs <project-dir>            everything the storyboard needs
//   node check-external.mjs --tool anatomy|lemo|remotion|hyperframes|ffmpeg [<project-dir>]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_VERSIONS, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { lemoLib } from "./lib/engines.mjs";

const has = (bin, args = ["-version"]) => spawnSync(bin, args, { encoding: "utf8" }).status === 0;

function findSkill(name) {
  const roots = [
    process.env[`ONE_STUDIO_${name.toUpperCase()}`],
    join(homedir(), ".claude", "skills", name),
    join(homedir(), ".agents", "skills", name),
    join(process.cwd(), ".claude", "skills", name),
  ].filter(Boolean);
  for (const r of roots) if (existsSync(join(r, "SKILL.md"))) return r;
  // Plugin installs: ~/.claude/plugins/**/skills/<name>/SKILL.md (two levels deep is enough in practice).
  const plugins = join(homedir(), ".claude", "plugins");
  const stack = existsSync(plugins) ? [[plugins, 0]] : [];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    if (existsSync(join(dir, "skills", name, "SKILL.md"))) return join(dir, "skills", name);
    if (depth < 4) for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) stack.push([join(dir, d.name), depth + 1]);
  }
  return null;
}

export const CHECKS = {
  ffmpeg: () => {
    const ok = has("ffmpeg") && has("ffprobe");
    const libass = ok && /\bsubtitles\b/.test(spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout);
    return { ok, detail: ok ? `ffmpeg found${libass ? ", libass ok" : ", NO libass (captions cannot be burned; use mux/sidecar)"}` : "missing", install: "macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg" };
  },
  hyperframes: () => {
    const v = ENGINE_VERSIONS.hyperframes;
    const chrome = process.env.HYPERFRAMES_BROWSER_PATH;
    return { ok: has("npx", ["--version"]), detail: `npx hyperframes@${v}${chrome ? `, Chrome ${chrome}` : ""}`, install: `npx --yes hyperframes@${v} browser ensure   (downloads Chrome Headless Shell; or set HYPERFRAMES_BROWSER_PATH)` };
  },
  anatomy: () => {
    const dir = findSkill("anatomy");
    return { ok: Boolean(dir), detail: dir ?? "skill not found", install: "npx skills add wheresryan22/anatomy -g -a claude-code   (or git clone https://github.com/wheresryan22/anatomy and set ONE_STUDIO_ANATOMY)" };
  },
  lemo: () => {
    const lib = lemoLib();
    const core = existsSync(join(lib, "core", "render", "video.mjs"));
    const deps = existsSync(join(lib, "node_modules", "playwright-core"));
    return {
      ok: core && deps,
      detail: core ? (deps ? `library at ${lib}` : `library at ${lib}, npm deps missing`) : `not found at ${lib}`,
      install: core
        ? `cd "${lib}" && npm install   (or: sh plugin/skills/lemo-opuscar/scripts/setup.sh deps)`
        : "git clone https://github.com/lemomo-ai/lemo-opuscar ~/lemo-opuscar && cd ~/lemo-opuscar && npm install   (~350 MB with deps; set ONE_STUDIO_LEMO_LIB if elsewhere)",
    };
  },
  remotion: (project) => {
    const dir = project ? join(project.root, "remotion") : null;
    const scaffold = dir && existsSync(join(dir, "package.json"));
    const deps = dir && existsSync(join(dir, "node_modules", "remotion"));
    return {
      ok: Boolean(scaffold && deps),
      detail: !dir ? "needs a project" : !scaffold ? "no remotion/ folder" : deps ? "installed" : "dependencies missing",
      install: !scaffold ? "node new-remotion.mjs <project>, then npm install in <project>/remotion (~300 MB)" : `cd "${dir}" && npm install   (~300 MB)`,
    };
  },
};

export function neededTools(project) {
  const need = new Set(["ffmpeg", "hyperframes"]);
  for (const s of project.storyboard?.scenes ?? []) {
    if (s.type === "explainer") need.add("anatomy");
    const e = sceneEngine(s, project.studio);
    if (e === "lemo") need.add("lemo");
    if (e === "remotion") need.add("remotion");
  }
  return [...need];
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["json", "help"], options: ["tool"] });
    const dir = args._[0];
    if (args.help || (!dir && !args.tool)) {
      console.log("usage: check-external.mjs <project-dir> | --tool anatomy|lemo|remotion|hyperframes|ffmpeg [<project-dir>]");
      process.exit(args.help ? 0 : 1);
    }
    const project = dir ? loadProject(dir) : null;
    const tools = args.tool ? [args.tool] : neededTools(project);
    const results = tools.map((t) => {
      if (!CHECKS[t]) throw new Error(`unknown tool ${t}`);
      return { tool: t, ...CHECKS[t](project) };
    });
    if (args.json) console.log(JSON.stringify(results, null, 2));
    else for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.tool.padEnd(12)} ${r.detail}${r.ok ? "" : `\n    install: ${r.install}`}`);
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
