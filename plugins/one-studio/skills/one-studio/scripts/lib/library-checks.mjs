// What validate.mjs reports about a project's use of the user library. Warnings only: a scene carries its kit
// CSS and a brand its preset's values, so a library that is missing (another machine) never breaks a project.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describeLibrary, findLibrary } from "./library.mjs";
import { kitStyleBlock, listKits } from "./kits.mjs";
import { listPlaybooks } from "./playbooks.mjs";
import { scanPresets } from "./presets.mjs";

const KIT_USE_RE = /<style\b[^>]*\bdata-kit\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/style>\n?/g;

// -> { file, errors: [], warnings: [] }
export function libraryResult(project) {
  const warnings = [];
  let lib;
  try {
    lib = findLibrary(project.root);
  } catch (err) {
    return { file: "library", errors: [err.message], warnings };
  }
  const kits = new Map(listKits(lib).map((k) => [k.name, k]));
  for (const k of kits.values()) for (const i of k.issues) warnings.push(`kit ${k.name}: ${i}`);

  const preset = project.brand?.preset;
  if (preset && !(preset in scanPresets({ from: project.root }).presets)) warnings.push(`brand.preset "${preset}" is not a plugin or library preset here (the brand keeps its values; compare-presets cannot show it)`);

  const playbook = project.studio.story?.playbook;
  if (playbook) {
    const { playbooks, skipped } = listPlaybooks(lib);
    if (!playbooks.some((p) => p.id === playbook)) warnings.push(`story.playbook "${playbook}" is neither built in nor in ${lib.root}/playbooks`);
    for (const p of skipped) warnings.push(`library playbook ${p.id}.md is skipped: a built-in playbook has that id`);
    for (const p of playbooks.filter((x) => x.source === "library" && x.id === playbook)) for (const i of p.issues) warnings.push(`playbook ${p.id}: ${i}`);
  }

  for (const scene of project.storyboard?.scenes ?? []) {
    const file = join(project.root, "scenes", `${scene.id}.html`);
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(KIT_USE_RE)) {
      const kit = kits.get(m[1]);
      if (!kit) warnings.push(`scene ${scene.id} uses kit ${m[1]}, which is not in this library (the scene still has its copy)`);
      else if (m[0] !== kitStyleBlock(kit)) warnings.push(`scene ${scene.id}: kit ${m[1]} changed since the scene copied it; new-scene.mjs <dir> ${scene.id} --kit ${m[1]} refreshes it (the scene re-opens for review)`);
    }
  }
  return { file: `library ${describeLibrary(lib)}`, errors: [], warnings };
}
