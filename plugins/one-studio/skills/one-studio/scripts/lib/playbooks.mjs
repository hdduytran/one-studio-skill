// Writers-room playbooks: the built-in ones (writers-room/playbooks/index.md) and the user's own in
// <library>/playbooks/<id>.md, same format (the nine headings below). A user playbook whose id is already
// built in is skipped: built-in ids keep their meaning in every project.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SKILL_DIR } from "./project.mjs";
import { libraryPart } from "./library.mjs";

export const WRITERS_ROOM_DIR = join(SKILL_DIR, "..", "writers-room");
export const PLAYBOOK_HEADINGS = ["Use when", "Viewer's question", "Story core questions", "Beat skeleton", "Hook types", "Visual modes", "Research needed", "Traps", "Review checklist"];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// Rows of the built-in index: | id | Use when | Signals |
export function builtInPlaybooks() {
  const index = readFileSync(join(WRITERS_ROOM_DIR, "playbooks", "index.md"), "utf8");
  return index.split("\n").map((l) => l.split("|").map((c) => c.trim())).filter((c) => c.length >= 5 && ID_RE.test(c[1]) && c[1] !== "id")
    .map(([, id, use, signals]) => ({ id, use, signals, source: "built-in", file: join(WRITERS_ROOM_DIR, "playbooks", `${id}.md`) }));
}

// First sentence under "## Use when"; "Signals:" line under it (optional) for matching requests.
function describe(text) {
  const section = /^## Use when\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const prose = section.split("\n").map((l) => l.trim()).filter((l) => l && !/^signals?:/i.test(l)).join(" ");
  const signals = /^signals?:\s*(.+)$/im.exec(section)?.[1].trim() ?? "";
  return { use: (/^(.+?[.!?])(\s|$)/.exec(prose)?.[1] ?? prose).slice(0, 160), signals };
}

export function userPlaybooks(lib) {
  const dir = libraryPart(lib, "playbooks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md") && ID_RE.test(f.slice(0, -3)) && f !== "index.md").sort().map((f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const missing = PLAYBOOK_HEADINGS.filter((h) => !headings.includes(h));
    return { id: f.slice(0, -3), ...describe(text), source: "library", file: join(dir, f), issues: missing.length ? [`missing sections: ${missing.join(", ")}`] : [] };
  });
}

// -> { playbooks: [built-in…, library…], skipped: [library playbooks whose id is built in] }
export function listPlaybooks(lib) {
  const builtIn = builtInPlaybooks();
  const ids = new Set(builtIn.map((p) => p.id));
  const mine = userPlaybooks(lib);
  return { playbooks: [...builtIn, ...mine.filter((p) => !ids.has(p.id))], skipped: mine.filter((p) => ids.has(p.id)) };
}

export const playbookFile = (lib, id) => listPlaybooks(lib).playbooks.find((p) => p.id === id)?.file ?? null;
