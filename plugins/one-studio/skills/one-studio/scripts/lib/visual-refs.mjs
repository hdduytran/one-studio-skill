// Cross-reference checks for the optional visual-mode fields of a storyboard
// (worlds, motifs, camera, handoff). Pure: takes the parsed storyboard, returns messages.
export function visualRefErrors(sb) {
  const errors = [];
  const worlds = sb.worlds ?? {};
  const motifIds = new Set((sb.motifs ?? []).map((m) => m.id));
  const dupMotifs = [...motifIds].filter((id) => (sb.motifs ?? []).filter((m) => m.id === id).length > 1);
  if (dupMotifs.length) errors.push(`storyboard: duplicate motif ids ${dupMotifs.join(", ")}`);
  const ids = sb.scenes.map((s) => s.id);
  sb.scenes.forEach((s, i) => {
    if (s.world && !(s.world in worlds)) {
      errors.push(`storyboard ${s.id}: world "${s.world}" is not declared in worlds (${Object.keys(worlds).join(", ") || "none"})`);
    }
    if (s.camera && !s.world) errors.push(`storyboard ${s.id}: camera needs a world`);
    for (const m of s.motif ?? []) {
      if (!motifIds.has(m)) errors.push(`storyboard ${s.id}: motif "${m}" is not declared in motifs`);
    }
    if (s.handoff && s.handoff.to_scene !== ids[i + 1]) {
      errors.push(`storyboard ${s.id}: handoff.to_scene "${s.handoff.to_scene}" must be the next scene (${ids[i + 1] ?? "none, this is the last scene"})`);
    }
  });
  errors.push(...continuityErrors(sb));
  return errors;
}

const sameValue = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
}
const show = (v) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

// Consecutive scenes in one world: [previous, next].
export function sameWorldPairs(sb) {
  const list = sb.scenes ?? [];
  return list.slice(1).map((s, i) => [list[i], s]).filter(([a, b]) => a.world && a.world === b.world);
}

// Which neighbours continue in the same world (their transition is forced to cut) and what the previous one leaves behind.
export function worldNeighbours(sb, id) {
  const pairs = sameWorldPairs(sb ?? { scenes: [] });
  const prev = pairs.find(([, b]) => b.id === id)?.[0];
  return { prev: Boolean(prev), next: pairs.some(([a]) => a.id === id), prevExit: prev?.exit_state ?? null };
}

// Pairs whose seam must be checked: same world, or an explicit handoff to the next scene.
export function seamPairs(sb) {
  const byId = new Map(sb.scenes.map((s) => [s.id, s]));
  const out = sameWorldPairs(sb).map(([a, b]) => ({ a: a.id, b: b.id, kind: "world" }));
  for (const s of sb.scenes) {
    if (s.handoff && byId.has(s.handoff.to_scene) && !out.some((p) => p.a === s.id && p.b === s.handoff.to_scene)) {
      out.push({ a: s.id, b: s.handoff.to_scene, kind: "handoff" });
    }
  }
  return out;
}

// The camera must end where the next scene's starts, and the world must be left as the next scene finds it.
function continuityErrors(sb) {
  const errors = [];
  for (const [a, b] of sameWorldPairs(sb)) {
    const pair = `${a.id} -> ${b.id} (world "${a.world}")`;
    if (a.camera?.to !== undefined && b.camera?.from !== undefined && !sameValue(a.camera.to, b.camera.from)) {
      errors.push(`storyboard ${pair}: ${a.id} camera.to ${show(a.camera.to)} must equal ${b.id} camera.from ${show(b.camera.from)}`);
    }
    if (a.exit_state && b.enter_state && !sameValue(a.exit_state, b.enter_state)) {
      errors.push(`storyboard ${pair}: ${a.id} exit_state ${show(a.exit_state)} must equal ${b.id} enter_state ${show(b.enter_state)}`);
    }
  }
  return errors;
}
