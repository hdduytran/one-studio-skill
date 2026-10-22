// Palette extraction: k-means in OKLab over sampled frame pixels with a fixed seed (same input, same palette).
import { oklabToOklch, oklabToRgb, rgbToHex, rgbToOklab } from "./color.mjs";

export const SEED = 20261022;
const MAX_POINTS = 24000;
const MERGE_DIST = 0.04; // OKLab distance under which two clusters count as one colour
const MIN_WEIGHT = 0.02;

// Small deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pixels of one raw rgb24 frame that carry style (not overlays): drops the caption band at the bottom
// and, for TikTok, the four corners where the moving watermark sits. `border` marks the outer 10% ring.
export function framePixels(buf, w, h, { platform = "other", captionBand = 0.18 } = {}) {
  const out = [];
  const cornerW = Math.round(w * 0.3);
  const cornerH = Math.round(h * 0.14);
  const maxY = Math.floor(h * (1 - captionBand));
  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < w; x++) {
      if (platform === "tiktok" && (x < cornerW || x >= w - cornerW) && (y < cornerH || y >= maxY - cornerH)) continue;
      const i = (y * w + x) * 3;
      const border = x < w * 0.1 || x >= w * 0.9 || y < h * 0.1 || y >= maxY - h * 0.1;
      out.push({ lab: rgbToOklab([buf[i], buf[i + 1], buf[i + 2]]), border });
    }
  }
  return out;
}

const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

function nearest(p, cents) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < cents.length; i++) {
    const d = dist2(p, cents[i]);
    if (d < bd) [bd, best] = [d, i];
  }
  return [best, bd];
}

// Seeded k-means++ init, then Lloyd iterations. Stops adding centroids once every point is covered.
function kmeans(points, k, rand) {
  const cents = [points[Math.floor(rand() * points.length)].slice()];
  while (cents.length < k) {
    const d = points.map((p) => nearest(p, cents)[1]);
    const total = d.reduce((a, b) => a + b, 0);
    if (total < 1e-9) break;
    let r = rand() * total;
    let idx = 0;
    while (idx < d.length - 1 && (r -= d[idx]) > 0) idx++;
    cents.push(points[idx].slice());
  }
  for (let it = 0; it < 30; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      const s = sums[nearest(p, cents)[0]];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    let moved = 0;
    sums.forEach((s, i) => {
      if (!s[3]) return;
      const c = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved += dist2(c, cents[i]);
      cents[i] = c;
    });
    if (moved < 1e-10) break;
  }
  return cents;
}

// pixels: [{lab, border}] -> { palette: [{hex, weight, L, C, h}], bg_luma, saturation }.
// The background is the biggest cluster among border pixels, flagged `bg: true`, so accents rank without it.
export function extractPalette(pixels, { k = 6, seed = SEED } = {}) {
  if (!pixels.length) return { palette: [], bg_luma: null, saturation: null };
  const step = Math.max(1, Math.ceil(pixels.length / MAX_POINTS));
  const sample = pixels.filter((_, i) => i % step === 0);
  const labs = sample.map((p) => p.lab);
  let cents = kmeans(labs, k, rng(seed));
  // Merge clusters that are perceptually one colour, then recompute assignments.
  cents = cents.filter((c, i) => !cents.slice(0, i).some((o) => Math.sqrt(dist2(c, o)) < MERGE_DIST));
  const count = cents.map(() => 0);
  const borderCount = cents.map(() => 0);
  const sum = cents.map(() => [0, 0, 0]);
  sample.forEach((p, i) => {
    const c = nearest(labs[i], cents)[0];
    count[c]++;
    if (p.border) borderCount[c]++;
    for (let j = 0; j < 3; j++) sum[c][j] += labs[i][j];
  });
  const bgIdx = borderCount.indexOf(Math.max(...borderCount));
  const entries = cents
    .map((_, i) => {
      if (!count[i]) return null;
      const lab = sum[i].map((v) => v / count[i]);
      const lch = oklabToOklch(lab);
      return { hex: rgbToHex(oklabToRgb(lab)), weight: count[i] / sample.length, L: +lch.L.toFixed(3), C: +lch.C.toFixed(3), h: +lch.h.toFixed(1), bg: i === bgIdx };
    })
    .filter((e) => e && (e.weight >= MIN_WEIGHT || e.bg))
    .sort((a, b) => b.weight - a.weight || (a.hex < b.hex ? -1 : 1));
  const total = entries.reduce((a, e) => a + e.weight, 0);
  for (const e of entries) e.weight = +(e.weight / total).toFixed(3);
  const bg = entries.find((e) => e.bg);
  return { palette: entries, bg_luma: bg ? bg.L : null, saturation: +entries.reduce((a, e) => a + e.C * e.weight, 0).toFixed(3) };
}
