// The user's own library: looks (presets), mockup kits and story structures (playbooks) kept outside any one
// project and reused by all of them.
//   <library>/presets/<name>.json      brand presets (same shape as templates/brand-presets.json)
//   <library>/kits/<kit>/              kit.css + components/*.html (+ kit.json, gallery.html)
//   <library>/playbooks/<id>.md        writers-room playbooks (same format as the built-in ones)
// Found in this order:
//   1. ONE_STUDIO_LIBRARY
//   2. walking up from the project: a one-studio.library.json ({ "path": "…" }, default: its own folder), or a
//      folder named exactly `library` that holds presets/, kits/ or playbooks/ (like ../series for series)
//   3. the cache folder ${ONE_STUDIO_CACHE:-~/.cache/one-studio}, where presets lived before the library existed.
// The cache's presets/ is always read too (after the library), so presets saved there before, or a symlink to
// them, keep working.
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readJson } from "./project.mjs";
import { cacheDir } from "./vendor.mjs";

export const LIBRARY_FILE = "one-studio.library.json";
export const LIBRARY_PARTS = ["presets", "kits", "playbooks"];

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// A `library/` folder in dir that is really a one-studio library. The exact name is required: macOS disks
// ignore case, and ~/Library must never be taken for one.
function folderLibrary(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  if (!names.includes("library")) return null;
  const lib = join(dir, "library");
  return isDir(lib) && LIBRARY_PARTS.some((p) => isDir(join(lib, p))) ? lib : null;
}

// -> { root, source: "env" | "file" | "folder" | "cache", file? }. `from` may not exist yet (init-project).
export function findLibrary(from = process.cwd(), env = process.env) {
  if (env.ONE_STUDIO_LIBRARY) return { root: resolve(env.ONE_STUDIO_LIBRARY), source: "env" };
  let dir = resolve(from);
  for (;;) {
    const file = join(dir, LIBRARY_FILE);
    if (existsSync(file)) {
      let cfg;
      try {
        cfg = readJson(file);
      } catch (err) {
        throw new Error(`${file} is not valid JSON: ${err.message}`);
      }
      return { root: resolve(dir, typeof cfg?.path === "string" ? cfg.path : "."), source: "file", file };
    }
    const lib = folderLibrary(dir);
    if (lib) return { root: lib, source: "folder" };
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { root: cacheDir(), source: "cache" };
}

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
export const sameDir = (a, b) => real(a) === real(b);

export const libraryPart = (lib, part) => join(lib.root, part);

// Where presets are read from, first wins: the library, then the cache (when it is another folder).
export function presetDirs(lib) {
  const dirs = [libraryPart(lib, "presets")];
  const cache = join(cacheDir(), "presets");
  if (!sameDir(dirs[0], cache)) dirs.push(cache);
  return dirs;
}

export function describeLibrary(lib) {
  const how = { env: "ONE_STUDIO_LIBRARY", file: lib.file, folder: "library/ folder above the project", cache: "cache folder (no library found)" }[lib.source];
  return `${lib.root}  (${how})`;
}

// Creates the library folders (nothing is overwritten). -> { root, created: [part] }
export function initLibrary(root) {
  const created = [];
  for (const part of LIBRARY_PARTS) {
    const dir = join(resolve(root), part);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(part);
    }
  }
  return { root: resolve(root), created };
}
