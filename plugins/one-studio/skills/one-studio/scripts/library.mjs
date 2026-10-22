#!/usr/bin/env node
// The user's library of looks, mockup kits and playbooks, shared by every project (lib/library.mjs).
//   node library.mjs [<dir>]                              where the library is and what it holds
//   node library.mjs [<dir>] --presets                    every preset: plugin, library, cache
//   node library.mjs <project> --save-preset <name> [--about "…"]   the project's current look → <library>/presets/<name>.json
//   node library.mjs [<dir>] --kits                       kits, their components and problems
//   node library.mjs [<dir>] --kit-gallery <kit>          gallery page: <project>/review/kit-<kit>.html with the
//                                                         project's brand, else <library>/kits/<kit>/gallery.html
//   node library.mjs [<dir>] --playbooks                  built-in playbooks + the library's own
//   node library.mjs --init <folder>                      create <folder>/presets, kits, playbooks
//   node library.mjs [<dir>] --import-cache               copy presets from the cache folder into the library
// <dir> is where the lookup starts (default: the current folder); a project folder for project commands.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { describeLibrary, findLibrary, initLibrary, libraryPart, presetDirs } from "./lib/library.mjs";
import { presetFromBrand, savePreset, scanPresets } from "./lib/presets.mjs";
import { listKits, loadKit } from "./lib/kits.mjs";
import { listPlaybooks } from "./lib/playbooks.mjs";
import { galleryBrand, kitGalleryHtml } from "./lib/kit-gallery.mjs";

const USAGE = `usage: library.mjs [<dir>] [--presets | --kits | --playbooks | --kit-gallery <kit> | --import-cache]
       library.mjs <project> --save-preset <name> [--about "…"]
       library.mjs --init <folder>`;

const isProject = (dir) => existsSync(join(dir, "studio.json"));

export function summary(from) {
  const lib = findLibrary(from);
  const { presets, origin } = scanPresets({ from });
  const mine = Object.keys(presets).filter((n) => origin[n].source !== "plugin");
  return { library: lib, presets: mine, kits: listKits(lib).map((k) => k.name), playbooks: listPlaybooks(lib).playbooks.filter((p) => p.source === "library").map((p) => p.id) };
}

export function saveProjectPreset(dir, name, { about } = {}) {
  const project = loadProject(dir);
  if (!project.brand) throw new Error("this project has no brand.json yet");
  return savePreset(name, presetFromBrand(project.brand, about), { from: project.root });
}

// -> { file } the gallery page written for a kit.
export function writeKitGallery(from, name) {
  const lib = findLibrary(from);
  const kit = loadKit(lib, name);
  if (isProject(from)) {
    const project = loadProject(from);
    const file = join(project.root, "review", `kit-${name}.html`);
    mkdirSync(join(project.root, "review"), { recursive: true });
    writeFileSync(file, kitGalleryHtml(kit, { brand: project.brand, brandPath: project.brandPath, lang: project.studio.meta.language }));
    return { file, kit };
  }
  const file = join(kit.dir, "gallery.html");
  writeFileSync(file, kitGalleryHtml(kit, { brand: galleryBrand(kit.preset, { from }) }));
  return { file, kit };
}

// Copies cache presets that the library does not have yet; never overwrites. -> [name]
export function importCachePresets(from) {
  const lib = findLibrary(from);
  if (lib.source === "cache") throw new Error("no library found (only the cache folder): create one first, e.g. library.mjs --init <folder>");
  const [target, cache] = presetDirs(lib);
  if (!cache || !existsSync(cache)) return [];
  mkdirSync(target, { recursive: true });
  const copied = [];
  for (const f of readdirSync(cache).filter((x) => x.endsWith(".json"))) {
    if (existsSync(join(target, f))) continue;
    copyFileSync(join(cache, f), join(target, f));
    copied.push(f.slice(0, -5));
  }
  return copied;
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["presets", "kits", "playbooks", "import-cache", "help"], options: ["save-preset", "about", "kit-gallery", "init"] });
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.init) {
    const r = initLibrary(args.init);
    console.log(`✓ library at ${r.root}${r.created.length ? ` (created ${r.created.join(", ")})` : " (already there)"}`);
    console.log("  Projects find it when it is a folder named `library` above them, through a one-studio.library.json ({ \"path\": \"…\" }) above them, or with ONE_STUDIO_LIBRARY.");
    return;
  }
  const from = resolve(args._[0] ?? ".");
  const lib = findLibrary(from);
  const rel = (p) => relative(process.cwd(), p) || p;

  if (args["save-preset"]) {
    const r = saveProjectPreset(from, args["save-preset"], { about: args.about });
    console.log(`✓ preset ${args["save-preset"]} ${r.updated ? "updated" : "saved"}: ${r.file}${r.library.source === "cache" ? "\n  (no library found, so it went to the cache folder: library.mjs --init <folder> makes a durable one)" : ""}`);
    return;
  }
  if (args["kit-gallery"]) {
    const r = writeKitGallery(from, args["kit-gallery"]);
    console.log(`✓ ${rel(r.file)} (${r.kit.components.length} components)`);
    for (const i of r.kit.issues) console.log(`  ⚠ ${i}`);
    return;
  }
  if (args["import-cache"]) {
    const names = importCachePresets(from);
    console.log(names.length ? `✓ copied ${names.join(", ")} into ${libraryPart(lib, "presets")}` : "nothing to copy");
    return;
  }

  console.log(`library  ${describeLibrary(lib)}`);
  if (args.presets) {
    const { presets, origin } = scanPresets({ from });
    for (const [name, p] of Object.entries(presets)) console.log(`  ${name.padEnd(22)} ${origin[name].source.padEnd(8)} ${p.about ?? ""}${p.colors.surface ? ` · surface ${p.colors.surface}` : ""}`);
    return;
  }
  if (args.kits) {
    const kits = listKits(lib);
    if (!kits.length) console.log(`  no kits in ${libraryPart(lib, "kits")}`);
    for (const k of kits) {
      console.log(`  ${k.name}${k.about ? ` · ${k.about}` : ""}`);
      for (const c of k.components) console.log(`    ${c.name.padEnd(24)} ${c.title ?? ""}`);
      for (const i of k.issues) console.log(`    ⚠ ${i}`);
    }
    if (kits.length) console.log("  use: new-scene.mjs <project> <id> --kit <kit> [--component <name>] · preview: library.mjs <project> --kit-gallery <kit>");
    return;
  }
  if (args.playbooks) {
    const { playbooks, skipped } = listPlaybooks(lib);
    for (const p of playbooks) console.log(`  ${p.id.padEnd(22)} ${p.source.padEnd(8)} ${p.use}${p.signals ? `  [${p.signals}]` : ""}${p.issues?.length ? `  ⚠ ${p.issues.join("; ")}` : ""}`);
    for (const p of skipped) console.log(`  ⚠ ${rel(p.file)} skipped: "${p.id}" is a built-in playbook id; rename the file`);
    return;
  }
  const s = summary(from);
  console.log(`  presets    ${s.presets.join(", ") || "none"}`);
  console.log(`  kits       ${s.kits.join(", ") || "none"}`);
  console.log(`  playbooks  ${s.playbooks.join(", ") || "none"}`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
