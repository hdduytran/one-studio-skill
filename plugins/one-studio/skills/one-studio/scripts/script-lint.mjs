#!/usr/bin/env node
// Lint script.md before the user is asked to approve it (gate 2). Prints only violations.
//   node script-lint.mjs <project-dir> [--json]
// Output line: script.md:LINE · rule · error|warn: message. Exit 1 when any error, else 0.
//
// Script format: "## sNN · title" scenes; "- " bullets = spoken sentences; "> key: value" lines =
// picture/sound (visual, camera, sfx, silence, source). Banned phrases live in data/slop-<lang>.json.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { DEFAULT_WPS, formatRate, speechRate, wordCount } from "./lib/speech-rate.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const MAX_SENTENCE_WORDS = 20;
const TIMING_LIMIT = 0.9;
const AV_KEYS = ["camera", "silence", "source", "sfx"];
const CONNECTOR = /(?<![\p{L}\p{N}])(và rồi|rồi thì|and then)(?![\p{L}\p{N}])/giu;
const NOT_FOR_EAR = /[\d%$€£₫&@#+=*\/\\<>°]/;


// Replace HTML comments by blank lines so line numbers stay right and template hints are ignored.
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));

export function parseScript(text) {
  const scenes = [];
  let cur = null;
  stripComments(text).split("\n").forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    if (t.startsWith("## ")) scenes.push((cur = { line, title: t.slice(3), bullets: [], meta: [] }));
    else if (!cur) return;
    else if (t.startsWith("- ")) cur.bullets.push({ line, text: t.slice(2).trim() });
    else {
      const m = t.match(/^>\s*([a-z]+)\s*:\s*(.*)$/i);
      if (m) cur.meta.push({ line, key: m[1].toLowerCase(), value: m[2].trim() });
    }
  });
  return scenes;
}

// Ids in the first column of research.md tables (r1, r2, …); header and separator rows skipped.
export function researchIds(text) {
  const ids = new Set();
  for (const row of stripComments(text ?? "").split("\n")) {
    if (!row.trim().startsWith("|")) continue;
    const id = row.split("|")[1]?.trim();
    if (id && id !== "id" && !/^[-: ]+$/.test(id)) ids.add(id);
  }
  return ids;
}

export function loadSlop(language) {
  const file = join(DATA, language === "vi" ? "slop-vi.json" : "slop-en.json");
  return JSON.parse(readFileSync(file, "utf8")).map((e) => ({ ...e, re: e.regex ? new RegExp(e.regex, "iu") : null }));
}

/**
 * Pure lint core. opts: { language, targetDuration, playbook, hasStory, research (research.md text),
 *   rate ({ wps, source, voice } from lib/speech-rate.mjs; default: the language's planning rate) }.
 * Returns [{ line, rule, severity: "error"|"warning", message }] sorted by line.
 */
export function lintText(text, opts = {}) {
  const { language = "vi", targetDuration = null, playbook = null, hasStory = false, research = null } = opts;
  const rate = opts.rate ?? { wps: DEFAULT_WPS[language] ?? DEFAULT_WPS.en, source: "default", voice: null };
  const scenes = parseScript(text);
  const out = [];
  const add = (line, rule, severity, message) => out.push({ line, rule, severity, message });

  // "Missing visual" is an error only for scripts written in the two-column format (camera/sfx/silence/source
  // lines or a recorded story); older one-column scripts predate the picture column and only get a warning.
  const isAv = hasStory || scenes.some((s) => s.meta.some((m) => AV_KEYS.includes(m.key)));
  const slop = loadSlop(language);
  const bullets = scenes.flatMap((s) => s.bullets);

  for (const b of bullets) {
    const lower = b.text.toLowerCase();
    for (const e of slop) {
      if (e.phrase ? lower.includes(e.phrase) : e.re.test(b.text)) {
        add(b.line, "slop", e.severity, `"${e.phrase ?? b.text.match(e.re)[0]}" is a filler phrase. ${e.replace}`);
      }
    }
    for (const sentence of b.text.split(/(?<=[.!?…])\s+/)) {
      const n = wordCount(sentence);
      if (n > MAX_SENTENCE_WORDS) add(b.line, "long-sentence", "warning", `${n} words (max ${MAX_SENTENCE_WORDS}). Split it: one breath, one idea.`);
    }
    const sym = b.text.match(NOT_FOR_EAR);
    if (sym) add(b.line, "write-for-ear", "warning", `"${sym[0]}" is not written for the ear. Spell it out or set a storyboard line \`say\`.`);
  }

  const connectors = bullets.flatMap((b) => [...b.text.matchAll(CONNECTOR)].map((m) => ({ line: b.line, word: m[1] })));
  if (connectors.length > 1) {
    add(connectors[1].line, "and-then", "error", `${connectors.length} beats joined by "${connectors[0].word}" (max 1). Use "but" or "therefore" so each beat causes the next.`);
  }

  for (const s of scenes) {
    if (!s.meta.some((m) => m.key === "visual" && m.value)) {
      add(s.line, "missing-visual", isAv ? "error" : "warning", `scene "${s.title}" has no "> visual:" line. Say what is on screen.`);
    }
  }

  if (!scenes.some((s) => s.meta.some((m) => m.key === "silence"))) {
    add(1, "no-silence", "warning", 'no "> silence:" anywhere. Give the picture one beat without voice.');
  }

  if (playbook === "news-recap") {
    const known = researchIds(research);
    for (const s of scenes) {
      const sources = s.meta.filter((m) => m.key === "source");
      if (s.bullets.length && !sources.length) {
        add(s.bullets[0].line, "missing-source", "error", `scene "${s.title}" states facts without "> source: <id>" (one line covers every bullet in the scene).`);
      }
      for (const m of sources) {
        for (const id of m.value.split(/[,\s]+/).filter(Boolean)) {
          if (!known.has(id)) add(m.line, "unknown-source", "error", `source "${id}" is not a row in research.md.`);
        }
      }
    }
  }

  if (targetDuration > 0) {
    const words = bullets.reduce((n, b) => n + wordCount(b.text), 0);
    const budget = rate.wps * targetDuration;
    if (words > TIMING_LIMIT * budget) {
      add(1, "too-long", "warning", `${words} words vs ${Math.round(budget)} that fit ${targetDuration}s at ${formatRate(rate)} (limit ${Math.round(TIMING_LIMIT * 100)}%). Cut the weakest beat.`);
    }
  }

  return out.sort((a, b) => a.line - b.line);
}

export function lintProject(project) {
  const path = join(project.root, "script.md");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  const researchPath = join(project.root, "research.md");
  const { studio } = project;
  return lintText(readFileSync(path, "utf8"), {
    language: studio.meta?.language,
    targetDuration: studio.format?.target_duration,
    playbook: studio.story?.playbook,
    hasStory: Boolean(studio.story),
    research: existsSync(researchPath) ? readFileSync(researchPath, "utf8") : null,
    rate: speechRate(project),
  });
}

export const formatViolation = (v) => `script.md:${v.line} · ${v.rule} · ${v.severity === "error" ? "error" : "warn"}: ${v.message}`;

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["json", "help"] });
  const dir = args._[0];
  if (args.help || !dir) {
    console.log("usage: script-lint.mjs <project-dir> [--json]");
    process.exit(dir ? 0 : 1);
  }
  const violations = lintProject(loadProject(dir));
  const errors = violations.filter((v) => v.severity === "error").length;
  if (args.json) console.log(JSON.stringify({ ok: errors === 0, violations }, null, 2));
  else for (const v of violations) console.log(formatViolation(v));
  process.exit(errors ? 1 : 0);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
