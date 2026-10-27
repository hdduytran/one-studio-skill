// Warnings (never failures) about scene scripts that run but misbehave:
// - L(<expression>): tools that fill in VO line ids (S.line helpers, spec generators) only see literal ids,
//   so L(id) / L(`s02-${n}`) silently gets no timing.
// - a top-level `const top` / `let top`: scene scripts are classic scripts, where `top` is window.top
//   (read-only); the declaration throws and the whole timeline is lost.
import { existsSync, readFileSync } from "node:fs";
import { sceneEngine } from "./project.mjs";
import { sceneFile } from "./scenes.mjs";

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LITERAL_ARG = /^\s*(?:"[^"\\\n]*"|'[^'\\\n]*'|`[^`$\\]*`)\s*[,)]/;

// Code with strings, template literals and comments blanked (same length), so braces and names inside them are ignored.
export function blankLiterals(code) {
  let out = "";
  for (let i = 0; i < code.length; ) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    let end = -1;
    if (two === "//") end = code.indexOf("\n", i) < 0 ? code.length : code.indexOf("\n", i);
    else if (two === "/*") end = code.indexOf("*/", i + 2) < 0 ? code.length : code.indexOf("*/", i + 2) + 2;
    else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === "\\" ? 2 : 1;
      end = Math.min(code.length, j + 1);
    }
    if (end < 0) {
      out += c;
      i++;
    } else {
      out += code.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    }
  }
  return out;
}

export function scriptWarnings(code) {
  const warnings = [];
  const plain = blankLiterals(code);
  for (const m of plain.matchAll(/(?<![\w$.])L\s*\(/g)) {
    if (/\bfunction\s*$/.test(plain.slice(0, m.index))) continue;
    const arg = code.slice(m.index + m[0].length);
    if (LITERAL_ARG.test(arg)) continue;
    const cut = arg.search(/[,)]/);
    const shown = (cut < 0 ? arg.slice(0, 20) : arg.slice(0, cut)).trim() || "nothing";
    warnings.push(`L(${shown}): the line id is not a literal string, so its VO timing is never filled in; write the id itself, e.g. L("s02-1")`);
  }
  let depth = 0;
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i];
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (i === 0 || !/[\w$.]/.test(plain[i - 1]))) {
      const m = /^(const|let|var)\s+top\b/.exec(plain.slice(i, i + 20));
      if (m) warnings.push(`top-level "${m[1]} top": "top" is window.top in a scene script (the declaration ${m[1] === "var" ? "is ignored" : "throws and the timeline is lost"}); rename it (e.g. topY)`);
    }
  }
  return warnings;
}

// Inline scripts of one scene file (not JSON blocks, not src= scripts).
export function sceneScriptWarnings(html) {
  const out = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    if (/\bsrc\s*=/.test(m[1]) || /\btype\s*=\s*["']application\/(?:ld\+)?json/i.test(m[1])) continue;
    out.push(...scriptWarnings(m[2]));
  }
  return [...new Set(out)];
}

export function projectSceneWarnings(project) {
  return (project.storyboard?.scenes ?? []).flatMap((scene) => {
    if (sceneEngine(scene, project.studio) !== "hyperframes") return [];
    const file = sceneFile(project, scene.id);
    return existsSync(file) ? sceneScriptWarnings(readFileSync(file, "utf8")).map((w) => `scene ${scene.id}: ${w}`) : [];
  });
}
