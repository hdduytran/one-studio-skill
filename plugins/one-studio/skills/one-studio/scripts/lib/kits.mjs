// Mockup kits in the user's library: <library>/kits/<kit>/
//   kit.css               component styles using brand variables only (var(--c-*), var(--font-*), var(--u))
//   components/<name>.html markup snippets; an optional first-line comment <!-- title --> names them
//   kit.json               optional { "about": "…", "preset": "<preset for the gallery>" }
//   gallery.html           every component on one page (library.mjs --kit-gallery writes it)
// new-scene --kit copies kit.css into the scene inside <style data-kit="<kit>">, so the scene stays
// self-contained and the kit is part of the scene hash (a kit change re-opens only scenes refreshed with it).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { libraryPart } from "./library.mjs";
import { readJson } from "./project.mjs";

export const KIT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
// Literal colours break "brand variables only": the same kit must work with every brand.
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(\s*[\d.]/gi;

const stripLeadComment = (css) => css.replace(/^\s*\/\*[\s\S]*?\*\/\s*\n?/, "");
const titleOf = (html) => /^\s*<!--\s*([\s\S]*?)\s*-->/.exec(html)?.[1].split("\n")[0].trim() ?? null;

function readKit(dir, name) {
  const cssFile = join(dir, "kit.css");
  const meta = existsSync(join(dir, "kit.json")) ? readJson(join(dir, "kit.json")) : {};
  const rawCss = existsSync(cssFile) ? readFileSync(cssFile, "utf8") : "";
  const compDir = join(dir, "components");
  const components = existsSync(compDir)
    ? readdirSync(compDir).filter((f) => f.endsWith(".html")).sort().map((f) => {
        const html = readFileSync(join(compDir, f), "utf8");
        return { name: f.slice(0, -5), file: join(compDir, f), title: titleOf(html), html };
      })
    : [];
  const issues = [];
  if (!existsSync(cssFile)) issues.push("no kit.css");
  for (const [file, text] of [["kit.css", rawCss.replace(/\/\*[\s\S]*?\*\//g, "")], ...components.map((c) => [`components/${c.name}.html`, c.html.replace(/<!--[\s\S]*?-->/g, "")])]) {
    const hits = [...new Set(text.match(LITERAL_COLOUR) ?? [])];
    if (hits.length) issues.push(`${file}: literal colour ${hits.slice(0, 3).join(", ")} (use brand variables)`);
  }
  const about = meta.about ?? /^\s*\/\*\s*([^\n*]+)/.exec(rawCss)?.[1].trim() ?? null;
  return { name, dir, about, preset: meta.preset ?? null, css: stripLeadComment(rawCss).trimEnd(), components, issues };
}

export function listKits(lib) {
  const root = libraryPart(lib, "kits");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && KIT_NAME_RE.test(e.name))
    .map((e) => readKit(join(root, e.name), e.name));
}

export function loadKit(lib, name) {
  const kit = listKits(lib).find((k) => k.name === name);
  if (!kit) {
    const have = listKits(lib).map((k) => k.name);
    throw new Error(`no kit "${name}" in ${libraryPart(lib, "kits")}${have.length ? `; kits: ${have.join(", ")}` : " (no kits yet)"}`);
  }
  return kit;
}

export function kitComponent(kit, name) {
  const c = kit.components.find((x) => x.name === name);
  if (!c) throw new Error(`kit ${kit.name} has no component "${name}"; components: ${kit.components.map((x) => x.name).join(", ") || "none"}`);
  return c;
}

// The block that carries a kit inside a scene's <head>.
export const kitStyleBlock = (kit) => `<style data-kit="${kit.name}">\n/* kit ${kit.name} (copied from the library by new-scene --kit; refresh with new-scene <id> --kit ${kit.name}) */\n${kit.css}\n</style>\n`;
const KIT_BLOCK_RE = (name) => new RegExp(`<style\\b[^>]*\\bdata-kit\\s*=\\s*["']${name}["'][^>]*>[\\s\\S]*?<\\/style>\\n?`);

// Puts the kit's current CSS into a scene's HTML: replaces its block when present, else adds it before </head>.
export function withKit(html, kit) {
  const block = kitStyleBlock(kit);
  const re = KIT_BLOCK_RE(kit.name);
  if (re.test(html)) return html.replace(re, () => block);
  if (!html.includes("</head>")) throw new Error("scene has no </head> to put the kit styles in");
  return html.replace("</head>", () => `${block}</head>`);
}

// Component markup without its title comment, indented for the scene frame.
export const componentMarkup = (c) => c.html.replace(/^\s*<!--[\s\S]*?-->\s*\n?/, "").trimEnd().split("\n").map((l) => (l ? `    ${l}` : l)).join("\n");
