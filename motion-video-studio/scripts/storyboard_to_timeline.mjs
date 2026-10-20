#!/usr/bin/env node
// Print the frame-accurate timeline for a project's storyboard.json and flag problems
// (VO longer than its scene, missing measured audio, clamped transitions, unknown components).
// Uses the project's own src/lib/timeline.ts so the numbers match the render exactly.
//
// Usage: node storyboard_to_timeline.mjs <project-dir> [--json]
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = resolve(process.argv[2] ?? ".");
const asJson = process.argv.includes("--json");
const sbPath = join(dir, "storyboard.json");
if (!existsSync(sbPath)) {
  console.error(`No storyboard.json in ${dir}`);
  process.exit(1);
}
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
// Node ≥ 22.18 strips TypeScript types natively.
const { buildTimeline } = await import(pathToFileURL(join(dir, "src/lib/timeline.ts")).href);
const tl = buildTimeline(sb);

// Unknown components: compare against keys registered in src/scenes/index.ts.
const registry = readFileSync(join(dir, "src/scenes/index.ts"), "utf8");
const registered = new Set([...registry.matchAll(/^\s+(\w+),\s*$/gm)].map((m) => m[1]));
for (const s of sb.scenes) {
  if (!registered.has(s.component)) tl.warnings.push(`Scene "${s.id}": component "${s.component}" is not registered in src/scenes/index.ts`);
  for (const key of ["src", "logo"]) {
    const v = s.props?.[key];
    if (typeof v === "string" && !/^https?:/.test(v) && !existsSync(join(dir, "public", v))) tl.warnings.push(`Scene "${s.id}": props.${key} "${v}" not found in public/`);
  }
  for (const cue of s.sfx ?? []) {
    if (!/^https?:/.test(cue.src) && !existsSync(join(dir, "public", cue.src))) tl.warnings.push(`Scene "${s.id}": sfx "${cue.src}" not found in public/`);
  }
  if (s.vo?.src && !existsSync(join(dir, "public", s.vo.src))) tl.warnings.push(`Scene "${s.id}": vo.src "${s.vo.src}" not found in public/`);
}
const music = sb.audio?.music?.src;
if (music && !/^https?:/.test(music) && !existsSync(join(dir, "public", music))) tl.warnings.push(`Music "${music}" not found in public/`);

if (asJson) {
  console.log(JSON.stringify(tl, null, 2));
} else {
  const f2s = (f) => (f / tl.fps).toFixed(2).padStart(6) + "s";
  console.log(`${sb.meta.title ?? "Untitled"} — ${tl.width}×${tl.height} @ ${tl.fps}fps — ${tl.durationInFrames} frames (${(tl.durationInFrames / tl.fps).toFixed(2)}s)\n`);
  console.log("  #  id                  component         start    end    len  trans  vo");
  tl.scenes.forEach((s, i) => {
    const end = s.startFrame + s.durationInFrames;
    console.log(
      `${String(i + 1).padStart(3)}  ${s.id.padEnd(18).slice(0, 18)}  ${s.component.padEnd(16).slice(0, 16)} ${f2s(s.startFrame)} ${f2s(end)} ${String(s.durationInFrames).padStart(5)}f ${String(s.transitionFrames).padStart(4)}f  ${s.vo?.src ? "audio" : s.vo?.text ? "text" : "-"}`,
    );
  });
  if (tl.warnings.length) {
    console.log(`\n⚠ ${tl.warnings.length} warning(s):`);
    for (const w of tl.warnings) console.log("  - " + w);
  } else console.log("\n✓ No timing problems found");
}
process.exit(tl.warnings.some((w) => /not found|not registered|no duration/.test(w)) ? 2 : 0);
