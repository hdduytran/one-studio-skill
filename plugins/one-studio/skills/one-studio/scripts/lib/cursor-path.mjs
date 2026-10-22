// Human-like cursor movement, deterministic from a seed: a gentle arc with an ease-in-out speed profile.
import { sha256 } from "./project.mjs";

// mulberry32: tiny seeded PRNG.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedFor = (flow, id) => flow.seed ?? parseInt(sha256(`cursor:${id}`).slice(0, 8), 16);

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// Seconds the pointer needs to travel `dist` px: short hops are quick, long ones take up to ~1.1 s.
export const travelSeconds = (dist) => Math.min(1.1, 0.35 + dist / 1800);

// A pointer move as a curve: a gentle arc (quadratic Bezier bent sideways) with an ease-in-out speed profile.
export function moveSegment(from, to, t0, random) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const bend = (random() * 2 - 1) * 0.14 * dist;
  const ctrl = { x: (from.x + to.x) / 2 - (dy / (dist || 1)) * bend, y: (from.y + to.y) / 2 + (dx / (dist || 1)) * bend };
  return { t0, t1: t0 + travelSeconds(dist), from, to, ctrl };
}

// Position at time t: before the move it is `from`, after it `to`.
export function pointAt(seg, t) {
  const u = ease(Math.min(1, Math.max(0, (t - seg.t0) / (seg.t1 - seg.t0))));
  const k = 1 - u;
  return { x: k * k * seg.from.x + 2 * k * u * seg.ctrl.x + u * u * seg.to.x, y: k * k * seg.from.y + 2 * k * u * seg.ctrl.y + u * u * seg.to.y };
}

// Pointer position at any time from the recorded moves (it rests where the last move ended).
export function cursorAt(segments, start, t) {
  let pos = start;
  for (const seg of segments) {
    if (t < seg.t0) break;
    pos = pointAt(seg, t);
  }
  return pos;
}

export const easeScroll = ease;
