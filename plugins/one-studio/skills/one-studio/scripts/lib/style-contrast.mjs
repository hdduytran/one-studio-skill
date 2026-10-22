// WCAG contrast checks for the text/background pairs the sample scenes use, and the lightness fix that
// keeps hue and chroma. Pure functions on hex strings.
import { contrastRatio, hexToOklch, hexToRgb, oklchToHex, rgbToHex } from "./color.mjs";

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
// Headroom so rounding to 8-bit hex never lands just under the line.
const HEADROOM = 0.05;
export const DEFAULT_CAPTION = { color: "#ffffff", background: "rgba(0,0,0,0.55)" };

// Text colours of the samples against the page: body text and muted labels need 4.5, big numbers, headings in a
// brand colour and bars need the large-text 3.0. The caption pair is checked on its own box.
export const SAMPLE_PAIRS = [
  { fg: "fg", min: AA_TEXT },
  { fg: "muted", min: AA_TEXT },
  { fg: "primary", min: AA_LARGE },
  { fg: "secondary", min: AA_LARGE },
  { fg: "accent", min: AA_LARGE },
];

// "#rgb", "#rrggbb", "#rrggbbaa" or "rgba(r,g,b,a)" composited over `over` -> "#rrggbb", or null when unreadable.
export function solidHex(value, over = "#000000") {
  const v = String(value ?? "").trim();
  let rgb;
  let alpha = 1;
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (fn) {
    rgb = [fn[1], fn[2], fn[3]].map(Number);
    if (fn[4] !== undefined) alpha = Number(fn[4]);
  } else if (/^#[0-9a-f]{8}$/i.test(v)) {
    rgb = hexToRgb(v.slice(0, 7));
    alpha = parseInt(v.slice(7), 16) / 255;
  } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) rgb = hexToRgb(v);
  else return null;
  const back = hexToRgb(over);
  return rgbToHex(rgb.map((c, i) => c * alpha + back[i] * (1 - alpha)));
}

// -> [{ token, fg, bg, ratio, min }] for pairs under their minimum. `token` is the colour to change.
export function contrastIssues(colors, captions = {}) {
  const issues = [];
  const bg = solidHex(colors.bg);
  if (!bg) return issues;
  for (const { fg, min } of SAMPLE_PAIRS) {
    const hex = solidHex(colors[fg], bg);
    if (hex && contrastRatio(hex, bg) < min) issues.push({ token: `colors.${fg}`, fg: colors[fg], bg, ratio: contrastRatio(hex, bg), min });
  }
  const box = solidHex(captions.background ?? DEFAULT_CAPTION.background, bg);
  const text = solidHex(captions.color ?? DEFAULT_CAPTION.color, box ?? bg);
  if (box && text && contrastRatio(text, box) < AA_TEXT) issues.push({ token: "captions.color", fg: captions.color ?? DEFAULT_CAPTION.color, bg: box, ratio: contrastRatio(text, box), min: AA_TEXT });
  return issues;
}

// Smallest lightness move (OKLCH) that reaches `min` on `bg`, keeping hue; chroma is reduced only when the
// gamut leaves no other way. Returns the colour unchanged when it already passes.
export function fixContrast(fg, bg, min) {
  const target = min + HEADROOM;
  if (contrastRatio(fg, bg) >= min) return fg;
  const { L, C, h } = hexToOklch(fg);
  for (const scale of [1, 0.75, 0.5, 0.25, 0]) {
    let best = null;
    for (const dir of [1, -1]) {
      for (let step = 1; step <= 200; step++) {
        const l = L + (dir * step) / 200;
        if (l < 0 || l > 1) break;
        const hex = oklchToHex({ L: l, C: C * scale, h });
        if (contrastRatio(hex, bg) >= target) {
          if (!best || step < best.step) best = { hex, step };
          break;
        }
      }
    }
    if (best) return best.hex;
  }
  return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000";
}
