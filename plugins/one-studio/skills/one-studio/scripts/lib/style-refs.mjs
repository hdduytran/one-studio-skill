// Layout and validation helpers for style-refs/<slug>/ (styles extracted from reference videos).
//   style-refs/<slug>/source.<ext> info.json subs.vtt metrics.json frames/ style.json style.enhance.json
//                     style.custom.json STYLE.md
// Callers pass either a project root (string) or a loadProject() result.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, validateKind } from "./project.mjs";

export const STYLE_REFS_DIR = "style-refs";
// Reference footage must never be committed or shipped: only the derived cards are kept.
export const GITIGNORE_LINES = ["*/source.*", "*/frames/"];

const rootOf = (project) => (typeof project === "string" ? project : project.root);
export const styleRefsDir = (project) => join(rootOf(project), STYLE_REFS_DIR);
export const styleDir = (project, slug) => join(styleRefsDir(project), slug);

// kebab-case ASCII slug from a video title or file name (Vietnamese diacritics folded).
export function slugify(hint) {
  const slug = String(hint ?? "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "style";
}

// Existing style slugs of a project (directories under style-refs/).
export function listStyleSlugs(project) {
  const dir = styleRefsDir(project);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

// Unused slug for `hint`: base, then base-2, base-3, ...
export function newSlug(project, hint) {
  const taken = new Set(listStyleSlugs(project));
  const base = slugify(hint);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// Creates style-refs/.gitignore with the footage patterns; adds missing lines, never rewrites others.
// Returns true when the file changed.
export function ensureGitignore(project) {
  const dir = styleRefsDir(project);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(current.split(/\r?\n/));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return false;
  const sep = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(file, current + sep + missing.join("\n") + "\n");
  return true;
}

// Fields the card must account for in `provenance`: dotted paths down to three segments
// (brand.colors.primary, brand.typography.heading, audio.music.bpm); deeper values belong to their parent.
const PROVENANCE_DEPTH = 3;
function leafPaths(value, prefix, out) {
  if (value && typeof value === "object" && !Array.isArray(value) && prefix.split(".").length < PROVENANCE_DEPTH) {
    for (const [k, v] of Object.entries(value)) leafPaths(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.push(prefix);
  return out;
}

// Problems with one style card: schema errors, slug/dir mismatch, fields without provenance,
// provenance for fields that do not exist, and a brand patch that breaks brand.json once merged.
export function styleErrors(style, { slug, brand } = {}) {
  const errors = validateKind("style", style);
  if (errors.length) return errors;
  if (slug && style.slug !== slug) errors.push(`style.slug "${style.slug}" does not match folder "${slug}"`);
  const fields = ["brand", "storyboard", "writing", "audio"].flatMap((k) => (style[k] ? leafPaths(style[k], k, []) : []));
  for (const f of fields) if (!style.provenance[f]) errors.push(`provenance: missing entry for ${f}`);
  for (const p of Object.keys(style.provenance)) if (!fields.includes(p)) errors.push(`provenance: "${p}" is not a field of this card`);
  if (brand) errors.push(...mergedBrandErrors(brand, style.brand));
  return errors;
}

// Shallow-per-section merge of a style's brand patch over a brand kit, then schema-checked.
export function mergeBrandPatch(brand, patch) {
  const out = { ...brand };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...brand[k], ...v } : v;
  }
  return out;
}

export function mergedBrandErrors(brand, patch) {
  return validateKind("brand", mergeBrandPatch(brand, patch)).map((e) => `merged brand ${e}`);
}

// Reads and validates style-refs/<slug>/style.json; throws with every problem listed.
export function loadStyle(project, slug) {
  const file = join(styleDir(project, slug), "style.json");
  if (!existsSync(file)) throw new Error(`No style "${slug}" (expected ${file})`);
  const style = readJson(file);
  const errors = styleErrors(style, { slug, brand: typeof project === "object" ? project.brand : null });
  if (errors.length) throw new Error(`Invalid style ${file}:\n  ${errors.join("\n  ")}`);
  return style;
}

// validate.mjs hook: one result per style-refs/<slug>/style.json (none when the folder is absent).
export function styleProjectResults(project) {
  return listStyleSlugs(project)
    .filter((slug) => existsSync(join(styleDir(project, slug), "style.json")))
    .map((slug) => {
      const file = join(styleDir(project, slug), "style.json");
      let errors;
      try {
        errors = styleErrors(readJson(file), { slug, brand: project.brand });
      } catch (err) {
        errors = [err.message];
      }
      return { file, errors };
    });
}
