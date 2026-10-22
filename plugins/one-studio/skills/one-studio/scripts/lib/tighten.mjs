// Shorter storyboard durations once the real voice-over exists.
// build-audio only ever stretches a scene to fit its VO; a voice that reads faster than planned leaves seconds of
// dead air. tightenPlan proposes duration = VO (lead-in + sentences + pauses) + pad + the scene's scripted
// "> silence:", and nothing is written unless the user asked for it (build-audio --tighten --apply), because a new
// storyboard.json re-opens the storyboard approval.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { audioHash } from "./hash.mjs";
import { parseScript } from "../script-lint.mjs";

export const TIGHTEN_PAD = 1.2;
const MIN_GAIN = 0.3; // smaller savings are not worth a re-approval
const MIN_SCENE = 1.5;
const ceil1 = (n) => Math.ceil(n * 10 - 1e-9) / 10;

// Seconds of "> silence: 1.5s" per scene id. Scenes are matched by the "## s01 · title" id, else by order.
export function scriptedSilence(project) {
  const path = join(project.root, "script.md");
  const out = new Map();
  if (!existsSync(path)) return out;
  const ids = (project.storyboard?.scenes ?? []).map((s) => s.id);
  parseScript(readFileSync(path, "utf8")).forEach((sc, i) => {
    const named = /^([\w-]+)\s*·/.exec(sc.title)?.[1];
    const id = ids.includes(named) ? named : ids[i];
    const secs = sc.meta.filter((m) => m.key === "silence").reduce((n, m) => n + (parseFloat(m.value) || 0), 0);
    if (id && secs) out.set(id, (out.get(id) ?? 0) + secs);
  });
  return out;
}

// -> { rows: [{ id, duration, vo, silence, proposed, change }], saved } from the current audio/manifest.json.
export function tightenPlan(project, { pad = TIGHTEN_PAD } = {}) {
  const file = join(project.root, "audio", "manifest.json");
  if (!existsSync(file)) throw new Error("No voice-over yet: run build-audio.mjs first, then --tighten.");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.hash !== audioHash(project)) throw new Error("audio/manifest.json is out of date: run build-audio.mjs again, then --tighten.");
  const vo = new Map(manifest.scenes.map((s) => [s.id, s]));
  const silence = scriptedSilence(project);
  const rows = (project.storyboard?.scenes ?? []).map((s) => {
    const m = vo.get(s.id);
    const hasVo = Boolean(m?.lines?.length);
    const sil = silence.get(s.id) ?? 0;
    const proposed = hasVo ? Math.max(MIN_SCENE, ceil1(m.vo + pad + sil)) : s.duration;
    return { id: s.id, duration: s.duration, vo: hasVo ? m.vo : null, silence: sil, proposed, change: hasVo && s.duration - proposed >= MIN_GAIN };
  });
  const saved = Math.round(rows.filter((r) => r.change).reduce((n, r) => n + r.duration - r.proposed, 0) * 10) / 10;
  return { rows, saved, pad };
}

export function formatTighten(plan) {
  const out = ["| Scene | Storyboard | VO | Silence | Proposed |", "|---|---|---|---|---|"];
  for (const r of plan.rows) out.push(`| ${r.id} | ${r.duration}s | ${r.vo == null ? "–" : `${r.vo}s`} | ${r.silence ? `${r.silence}s` : "–"} | ${r.change ? `**${r.proposed}s**` : "keep"} |`);
  out.push(`Proposed = VO + ${plan.pad}s + scripted silence. Saves ${plan.saved}s.`);
  return out.join("\n");
}
