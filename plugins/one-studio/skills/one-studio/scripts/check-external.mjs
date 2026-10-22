#!/usr/bin/env node
// Check the tools this project (or a named tool) needs, and print how to install what is missing.
// Never installs anything: ask the user, then run the printed command.
//   node check-external.mjs <project-dir>            everything the storyboard needs
//   node check-external.mjs --tool anatomy|lemo|remotion|hyperframes|ffmpeg|capture|yt-dlp [<project-dir>]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_VERSIONS, isMain, loadProject, parseArgs, sceneEngine } from "./lib/project.mjs";
import { lemoLib } from "./lib/engines.mjs";
import { hasDrawtext, hasLibass } from "./lib/ffmpeg.mjs";
import { captionSetting } from "./lib/captions.mjs";
import { cdpAvailable, findChrome } from "./lib/cdp.mjs";
import { INSTALL_HELP as YTDLP_INSTALL, findYtdlp } from "./lib/ytdlp.mjs";
import { listStyleSlugs, styleDir } from "./lib/style-refs.mjs";

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
  // Missing libass / drawtext never block: captions fall back to mux, contact sheets lose their labels.
  ffmpeg: (project) => {
    const ok = has("ffmpeg") && has("ffprobe");
    const libass = ok && hasLibass();
    const drawtext = ok && hasDrawtext();
    const wantsBurn = project ? captionSetting(project) === "burn" : false;
    const parts = [
      libass ? "libass ok" : `NO libass (burned captions impossible${wantsBurn ? ": this project's burn captions will be muxed as a soft track + .srt" : "; use mux/sidecar"})`,
      drawtext ? "drawtext ok" : "NO drawtext (contact sheets without labels)",
    ];
    return { ok, detail: ok ? `ffmpeg found, ${parts.join(", ")}` : "missing", install: "macOS: brew install ffmpeg (core formula may lack libass/freetype: the homebrew-ffmpeg/ffmpeg tap or a static build has them) · Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg" };
  },
  hyperframes: () => {
    const v = ENGINE_VERSIONS.hyperframes;
    const chrome = process.env.HYPERFRAMES_BROWSER_PATH;
    return { ok: has("npx", ["--version"]), detail: `npx hyperframes@${v}${chrome ? `, Chrome ${chrome}` : ""}`, install: `npx --yes hyperframes@${v} browser ensure   (downloads Chrome Headless Shell; or set HYPERFRAMES_BROWSER_PATH)` };
  },
  // Screen capture drives Chrome over the DevTools protocol with Node's own WebSocket: no automation package to install.
  capture: (project) => {
    const chrome = findChrome();
    const ws = cdpAvailable();
    const consent = project ? project.studio.services?.capture === true : null;
    const detail = [
      chrome ? `Chrome ${chrome}` : "NO Chrome",
      ws ? `Node ${process.version} (WebSocket ok)` : `Node ${process.version}: needs 22+ for the built-in WebSocket`,
      consent === null ? "" : consent ? "services.capture on" : "services.capture off (ask the user, then set it in studio.json)",
    ].filter(Boolean).join(", ");
    return {
      ok: Boolean(chrome && ws && has("ffmpeg")),
      detail,
      install: !chrome ? "npx --yes hyperframes@" + ENGINE_VERSIONS.hyperframes + " browser ensure   (or set ONE_STUDIO_CHROME / HYPERFRAMES_BROWSER_PATH to a Chrome binary)" : "Use Node 22+ (nvm install 22) and FFmpeg",
    };
  },
  // Only needed to fetch a reference link for style-extract; local files never need it.
  "yt-dlp": (project) => {
    const bin = findYtdlp();
    const consent = project ? project.studio.services?.download === true : null;
    const detail = [bin ? `yt-dlp found (${bin})` : "NO yt-dlp", consent === null ? "" : consent ? "services.download on" : "services.download off (ask the user, then set it in studio.json)"].filter(Boolean).join(", ");
    return { ok: Boolean(bin), detail, install: `${YTDLP_INSTALL}   (ask the user first; or download the video yourself and pass the file)` };
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
    if (s.type === "screen") need.add("capture");
  }
  // A style reference recorded from a link whose footage is not on disk yet.
  for (const slug of listStyleSlugs(project)) {
    const dir = styleDir(project, slug);
    if (!existsSync(join(dir, "info.json"))) continue;
    let info;
    try {
      info = JSON.parse(readFileSync(join(dir, "info.json"), "utf8"));
    } catch {
      continue;
    }
    if (info.url && !readdirSync(dir).some((f) => f.startsWith("source."))) need.add("yt-dlp");
  }
  return [...need];
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["json", "help"], options: ["tool"] });
    const dir = args._[0];
    if (args.help || (!dir && !args.tool)) {
      console.log("usage: check-external.mjs <project-dir> | --tool anatomy|lemo|remotion|hyperframes|ffmpeg|capture|yt-dlp [<project-dir>]");
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
