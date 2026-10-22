// Credit (Claude token) and render-time estimate from the storyboard.
// Numbers are rough planning ranges, tuned in phase 8 against real runs.
import { existsSync, statSync } from "node:fs";
import { sceneHash, sceneSourceExists } from "./hash.mjs";
import { join } from "node:path";
import { SCENE_TYPES, SKILL_DIR, sceneEngine } from "./project.mjs";
import { captureFiles } from "./flow.mjs";

// Tokens Claude spends writing + fixing one scene, by cost level [low, high].
export const LEVEL_TOKENS = { low: [2000, 4000], medium: [5000, 9000], high: [15000, 30000] };
const HERO_EXPLAINER = [40000, 80000];
const REVIEW_IMAGE_TOKENS = 1600; // one contact sheet per scene at gate 5
const DEFAULT_REF_TOKENS = 1500; // reference not written yet
// Render seconds per output second on a typical laptop, plus fixed start-up per scene.
const RENDER_RATE = { hyperframes: 2, remotion: 4, lemo: 3 };
const RENDER_OVERHEAD = 5;
const CAPTURE_SECONDS = 30; // recording one flow: browser start-up plus the walk-through in real time

const refTokens = (rel) => {
  const path = join(SKILL_DIR, rel);
  return existsSync(path) ? Math.ceil(statSync(path).size / 4) : DEFAULT_REF_TOKENS;
};

export function estimate(project) {
  const sb = project.storyboard ?? { scenes: [] };
  const states = new Map((project.studio.scenes ?? []).map((s) => [s.id, s]));
  const credit = project.studio.credit ?? {};
  const rows = [];
  const refs = new Set();
  const deps = new Set();
  const flows = new Set(); // screen flows without a recording yet
  let ttsLines = 0;
  let ttsChars = 0;

  for (const scene of sb.scenes) {
    const info = SCENE_TYPES[scene.type];
    const state = states.get(scene.id);
    const hash = sceneSourceExists(project, scene) ? sceneHash(project, scene) : null;
    // Tokens are spent writing/fixing a scene; rendering costs only machine time.
    const authored = Boolean(hash && state?.approved_hash === hash);
    const rendered = Boolean(hash && state?.clip?.includes(hash) && existsSync(join(project.root, state.clip)));
    const cached = authored && rendered;
    const engine = sceneEngine(scene, project.studio);
    const range = scene.type === "explainer" && scene.explainer?.size === "hero" ? HERO_EXPLAINER : LEVEL_TOKENS[info.level];
    if (scene.type === "screen" && scene.screen?.flow && !existsSync(captureFiles(project, scene.screen.flow).events)) flows.add(scene.screen.flow);
    const lines = scene.lines ?? [];
    ttsLines += lines.length;
    ttsChars += lines.reduce((n, l) => n + (l.say ?? l.text).length, 0);
    if (!authored) {
      info.refs.forEach((r) => refs.add(r));
      info.deps.forEach((d) => deps.add(d));
    }
    rows.push({
      id: scene.id,
      type: scene.type,
      engine,
      level: info.level,
      duration: scene.duration,
      authored,
      rendered,
      cached,
      tokens: authored ? [0, 0] : range,
      renderSeconds: rendered ? 0 : Math.round(scene.duration * RENDER_RATE[engine] + RENDER_OVERHEAD),
    });
  }

  const build = rows.filter((r) => !r.authored);
  const refList = [...refs].map((path) => ({ path, tokens: refTokens(path) }));
  const refTotal = refList.reduce((n, r) => n + r.tokens, 0);
  const sum = (i) => build.reduce((n, r) => n + r.tokens[i], 0);
  const review = build.length * REVIEW_IMAGE_TOKENS;
  const tokens = [sum(0) + refTotal + review, Math.round((sum(1) + refTotal + review) * 1.3)];

  const services = [];
  if (ttsLines) {
    const allowed = project.studio.services?.tts;
    services.push(`TTS (local, OpenAI-compatible): ${ttsLines} sentence calls, ${ttsChars} chars${allowed ? "" : " — ask before first call"}`);
  }
  if (flows.size) services.push(`screen capture: record ${[...flows].join(", ")} (opens the flow URL in a browser${project.studio.services?.capture ? "" : " — ask before first capture"})`);
  for (const d of deps) services.push(`install/load: ${d}`);

  const warnings = [];
  const warnScenes = credit.warn_scenes ?? 8;
  if (build.length > warnScenes) warnings.push(`${build.length} scenes to build (> ${warnScenes}): consider trimming or splitting`);
  const heavy = [...new Set(build.map((r) => r.type).filter((t) => (credit.warn_types ?? ["3d", "character"]).includes(t)))];
  if (heavy.length) warnings.push(`heavy scene types: ${heavy.join(", ")} (high token cost, slower render)`);
  if (sb.scenes.some((s) => s.type === "explainer" && s.explainer?.size === "hero")) {
    warnings.push("explainer size 'hero' takes 2–4 h of work per anatomy's own sizing");
  }

  return {
    scenes: rows,
    toBuild: build.length,
    cached: rows.filter((r) => r.cached).length,
    duration: rows.reduce((n, r) => n + r.duration, 0),
    references: refList,
    tokens,
    reviewTokens: review,
    toRender: rows.filter((r) => !r.rendered).length,
    renderSeconds: rows.reduce((n, r) => n + r.renderSeconds, 0) + flows.size * CAPTURE_SECONDS,
    services,
    warnings,
  };
}

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function formatEstimate(e) {
  const out = [];
  out.push(`Credit estimate — ${e.toBuild} scene(s) to write/fix, ${e.toRender} to render, ${e.cached} cached, ${e.duration.toFixed(1)}s total`);
  out.push("");
  out.push("| Scene | Type | Engine | Cost | Tokens | Render |");
  out.push("|---|---|---|---|---|---|");
  for (const r of e.scenes) {
    const tok = r.authored ? "approved" : `${k(r.tokens[0])}–${k(r.tokens[1])}`;
    out.push(`| ${r.id} | ${r.type} | ${r.engine} | ${r.level} | ${tok} | ${r.rendered ? "cached" : `~${r.renderSeconds}s`} |`);
  }
  out.push("");
  out.push(`References to load (${e.references.length}): ${e.references.map((r) => `${r.path} (~${k(r.tokens)})`).join(", ") || "none"}`);
  out.push(`Keyframe review images: ~${k(e.reviewTokens)} tokens`);
  out.push(`Total Claude tokens: ~${k(e.tokens[0])}–${k(e.tokens[1])}`);
  out.push(`Local render time: ~${Math.ceil(e.renderSeconds / 60)} min`);
  if (e.services.length) out.push(`External / heavy: ${e.services.join("; ")}`);
  for (const w of e.warnings) out.push(`⚠ ${w}`);
  return out.join("\n");
}
