#!/usr/bin/env node
// Turn an anatomy figure page (built with the anatomy skill's own build.mjs) into a standalone,
// inline-safe SVG for a video scene, and optionally inline it into scenes/<id>.html.
//   node anatomy-to-svg.mjs <figure.html|figure.svg> <out.anatomy.svg> [--theme dark|light]
//   node anatomy-to-svg.mjs <figure.html> --into <project-dir> <scene-id> [--theme dark|light]
// The figure's own CSS is kept but scoped (page rules for *, html, body, main are dropped), so it
// cannot restyle the scene. Parts keep their data-part attributes for GSAP:  S.enter('[data-part="needle"]').
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain, parseArgs } from "./lib/project.mjs";

function extractSvg(html) {
  const start = html.search(/<svg\b[^>]*class="[^"]*\biso-svg\b/);
  if (start < 0) throw new Error("No anatomy figure (<svg class=\"iso-svg\">) found");
  const re = /<svg\b|<\/svg>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === "</svg>" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + 6);
  }
  throw new Error("Unbalanced <svg> in figure");
}

// Keep only rules scoped to anatomy classes; drop global page rules.
export function scopeCss(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const selector = css.slice(i, open).trim();
    // Find the matching close brace (handles @media blocks).
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const block = css.slice(i, j).trim();
    const global = /^(?:\*|(?:html|body|main|:root)\b)/.test(selector) || /\.iso-(page|figure|plate|legend|keys?|swatch)\b/.test(selector);
    if (!global && !selector.startsWith("@")) out.push(block);
    i = j;
  }
  return out.join("\n");
}

export function anatomyToSvg(input, { theme = "dark" } = {}) {
  const text = readFileSync(input, "utf8");
  const svg = extractSvg(text);
  const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(text);
  const css = styleMatch ? scopeCss(styleMatch[1]) : "";
  const hasStyle = svg.includes("<style>");
  let open = /^<svg\b[^>]*>/.exec(svg)[0];
  let tag = open.replace(/class="([^"]*)"/, (m, c) => `class="${c.split(/\s+/).includes("iso") ? c : `${c} iso`}"`);
  tag = tag.includes("data-theme=") ? tag.replace(/data-theme="[^"]*"/, `data-theme="${theme}"`) : tag.replace(/^<svg\b/, `<svg data-theme="${theme}"`);
  return tag + (hasStyle || !css ? "" : `<style>${css}</style>`) + svg.slice(open.length);
}

export function inlineIntoScene(sceneFile, svg) {
  const html = readFileSync(sceneFile, "utf8");
  const re = /<!-- figure:start -->[\s\S]*?<!-- figure:end -->/;
  if (!re.test(html)) throw new Error(`${sceneFile} has no <!-- figure:start --> … <!-- figure:end --> markers (use the explainer template)`);
  writeFileSync(sceneFile, html.replace(re, `<!-- figure:start -->\n${svg}\n<!-- figure:end -->`));
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help"], options: ["theme", "into"] });
    const [input, a2, a3] = args._;
    if (args.help || !input || (!args.into && !a2)) {
      console.log("usage: anatomy-to-svg.mjs <figure.html|svg> <out.anatomy.svg> [--theme dark|light]\n       anatomy-to-svg.mjs <figure.html|svg> --into <project-dir> <scene-id>");
      process.exit(args.help ? 0 : 1);
    }
    const svg = anatomyToSvg(input, { theme: args.theme ?? "dark" });
    if (args.into) {
      const id = a2;
      const assetDir = join(args.into, "assets", id);
      mkdirSync(assetDir, { recursive: true });
      writeFileSync(join(assetDir, `${id}.anatomy.svg`), svg);
      const scene = join(args.into, "scenes", `${id}.html`);
      if (!existsSync(scene)) throw new Error(`${scene} not found: run new-scene.mjs first`);
      inlineIntoScene(scene, svg);
      console.log(`✓ figure inlined into ${scene} (${Math.round(svg.length / 1024)} KB); copy kept at assets/${id}/${id}.anatomy.svg`);
    } else {
      mkdirSync(dirname(a2), { recursive: true });
      writeFileSync(a2, svg);
      console.log(`✓ ${a2} (${Math.round(svg.length / 1024)} KB, parts: ${(svg.match(/data-part="/g) ?? []).length})`);
    }
    void a3;
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
