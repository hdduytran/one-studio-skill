// Deterministic enhance rules: each looks at the effective style and returns a proposal
//   { id, title, why, patch, sample, variants?, parts?, locks? }
// `patch` is a partial card (same shape as a layer) whose fields are marked `guessed` with note "enhance:<id>".
// Nothing is written here: style-enhance.mjs shows the proposals and writes only the ones the user accepts.
// The rules are documented, with the thresholds, in skills/style-extract/references/enhance-rules.md.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { deltaE2000, hexToOklch, oklchToHex } from "./color.mjs";
import { AA_LARGE, AA_TEXT, contrastIssues, fixContrast, fixContrastOn, solidHex } from "./style-contrast.mjs";
import { PART_KINDS } from "./style-enhance-parts.mjs";
import { supportsVietnamese, vietnameseSibling } from "./style-fonts.mjs";
import { SERIES_OWNED, clone, deletePath, effectiveStyle, getPath, isLocked, layerUnits, lockedOf, provenanceKeys, readLayer, setPath, unitOf } from "./style-layers.mjs";
import { mergeBrandPatch, styleDir } from "./style-refs.mjs";

// Safe areas of TikTok / Reels chrome (lib/platforms.mjs), and the average sentence length used for pacing.
import { UI_ZONE } from "./platforms.mjs";
export { UI_ZONE };
export const WORDS_PER_SENTENCE = 12;
export const SERIES_COLOR_MIN_DELTA_E = 8;
const CAPTION_CHAR_WIDTH = 0.55; // average glyph width in em
export const MIN_CAPTION_CHARS = 10; // style schema minimum for captions.max_chars

// Everything the rules read, gathered once.
export function enhanceContext(project, slug) {
  const style = effectiveStyle(project, slug);
  const custom = readLayer(project, slug, "custom");
  const enhance = readLayer(project, slug, "enhance");
  const sd = styleDir(project, slug);
  return {
    project,
    slug,
    style,
    brand: mergeBrandPatch(project.brand, style.brand),
    vi: Boolean(project.studio.meta.language?.startsWith("vi")),
    lang: project.studio.meta.language,
    aspect: project.studio.format.aspect,
    series: project.studio.meta.series ?? null,
    locked: lockedOf([["custom", custom]]),
    own: new Set(layerUnits(custom)),
    rejected: new Set(enhance.rejected ?? []),
    hasVariant: (name) => existsSync(join(sd, "variants", `${name}.json`)),
    hasPart: (kind) => existsSync(join(sd, "parts", `${kind}.html`)) || (kind === "thumbnail" && existsSync(join(project.root, "scenes", "thumbnail.html"))),
  };
}

const guessed = (patch, id) => {
  const provenance = {};
  for (const u of layerUnits(patch)) for (const k of provenanceKeys(u, getPath(patch, u))) provenance[k] = { source: "guessed", note: `enhance:${id}` };
  return { ...patch, provenance };
};
// Removes what the user pinned or set by hand; null when nothing is left.
function permitted(ctx, patch) {
  const out = clone(patch);
  for (const u of layerUnits(out)) if (isLocked(ctx.locked, u) || ctx.own.has(u) || ctx.own.has(unitOf(u))) deletePath(out, u);
  return layerUnits(out).length ? out : null;
}
const oklch = (L, C, h) => oklchToHex({ L, C, h: (h + 360) % 360 });
const r2 = (n) => Math.round(n * 100) / 100;

function contrast(ctx) {
  const { colors = {}, captions } = ctx.brand;
  const issues = contrastIssues(colors, captions);
  const patch = {};
  const lines = [];
  // A text colour checked on both the page and the card surface gets one value that reads on both;
  // colors.surface is never a token here (it is a fill, not text).
  for (const token of [...new Set(issues.map((i) => i.token))]) {
    const mine = issues.filter((i) => i.token === token);
    const min = Math.max(...mine.map((i) => i.min));
    const bgs = token.startsWith("colors.") ? [...new Set([solidHex(colors.bg), ...(colors.surface && ["colors.fg", "colors.muted"].includes(token) ? [solidHex(colors.surface, solidHex(colors.bg))] : [])])] : [mine[0].bg];
    setPath(patch, `brand.${token}`, fixContrastOn(solidHex(mine[0].fg, mine[0].bg), bgs, min));
    for (const i of mine) lines.push(`${token.split(".")[1]}${i.on === "surface" ? " on surface" : ""} ${r2(i.ratio)} < ${i.min}`);
  }
  const p = permitted(ctx, patch);
  if (!p) return null;
  return { id: "contrast", sample: "data", patch: guessed(p, "contrast"), title: ctx.vi ? "Tăng độ tương phản chữ" : "Raise text contrast", why: ctx.vi ? `Chữ khó đọc trên nền (${lines.join(", ")}); chỉnh độ sáng, giữ nguyên màu để đạt WCAG AA (chữ thường 4.5, chữ lớn 3.0).` : `Text is hard to read on the background (${lines.join(", ")}); lightness is adjusted, hue kept, to reach WCAG AA (4.5 text, 3.0 large).` };
}

function diacritics(ctx) {
  if (!ctx.lang?.startsWith("vi")) return null;
  const patch = {};
  const names = [];
  for (const role of ["heading", "body"]) {
    const font = ctx.style.brand.typography?.[role];
    if (font && !supportsVietnamese(font)) {
      const next = vietnameseSibling(font);
      setPath(patch, `brand.typography.${role}`, next);
      names.push(`${role}: ${font.family} → ${next.family}`);
    }
  }
  const capFont = ctx.style.brand.captions?.font;
  if (capFont && !supportsVietnamese({ family: capFont })) {
    const next = vietnameseSibling({ family: capFont });
    setPath(patch, "brand.captions.font", next.family);
    names.push(`captions: ${capFont} → ${next.family}`);
  }
  const p = permitted(ctx, patch);
  return p && { id: "diacritics", sample: "title", patch: guessed(p, "diacritics"), title: ctx.vi ? "Đổi font có đủ dấu tiếng Việt" : "Use a font with full Vietnamese diacritics", why: ctx.vi ? `Font chưa xác nhận có bộ ký tự vietnamese (${names.join("; ")}). Thay bằng font cùng họ trong font-map.md.` : `Font not confirmed to ship the vietnamese subset (${names.join("; ")}); swapped for the closest verified row of font-map.md.` };
}

// Roles a style can leave out are derived from its own primary colour (hue turned, lightness moved); muted is a
// near-neutral in the background's hue.
function derive(role, colors) {
  const anchor = solidHex(colors.primary ?? colors.accent ?? colors.fg);
  const bg = solidHex(colors.bg);
  if (!anchor) return null;
  const a = hexToOklch(anchor);
  const darkBg = bg ? hexToOklch(bg).L < 0.5 : true;
  const hex = { secondary: () => oklch(a.L, a.C * 0.9, a.h + 40), accent: () => oklch(darkBg ? 0.8 : 0.58, Math.max(a.C, 0.12), a.h + 160), muted: () => oklch(darkBg ? 0.7 : 0.45, 0.025, bg ? hexToOklch(bg).h : a.h) }[role]();
  return bg ? fixContrast(hex, bg, role === "muted" ? AA_TEXT : AA_LARGE) : hex;
}

function tokenGaps(ctx) {
  const own = { ...(ctx.style.brand.colors ?? {}) };
  if (!own.primary && !own.accent && !own.fg) return null;
  const merged = { ...ctx.brand.colors, ...own };
  const patch = {};
  const added = [];
  for (const role of ["secondary", "accent", "muted"]) if (!own[role]) {
    const hex = derive(role, merged);
    if (hex) {
      setPath(patch, `brand.colors.${role}`, hex);
      merged[role] = hex;
      added.push(role);
    }
  }
  // Bars in the chart take primary, secondary, muted, accent in turn: look-alikes would read as one series.
  const solid = (r) => solidHex(merged[r]);
  const twins = ["secondary", "accent"].filter((r, i, all) => own[r] && ["primary", ...all.slice(0, i)].some((o) => solid(o) && solid(r) && deltaE2000(solid(o), solid(r)) < SERIES_COLOR_MIN_DELTA_E));
  for (const role of twins) {
    const hex = derive(role, { ...merged, primary: merged.primary ?? merged.fg });
    if (hex && hex !== merged[role]) setPath(patch, `brand.colors.${role}`, hex);
  }
  const p = permitted(ctx, patch);
  if (!p) return null;
  const roles = Object.keys(p.brand.colors).join(", ");
  return { id: "token-gaps", sample: "data", patch: guessed(p, "token-gaps"), title: ctx.vi ? "Bổ sung màu còn thiếu" : "Fill the missing colours", why: ctx.vi ? `Thiếu hoặc trùng màu cho ${roles}: suy ra từ màu chính (xoay hue, đổi độ sáng) để biểu đồ có đủ màu phân biệt.` : `Missing or look-alike colours for ${roles}: derived from the main colour (hue turned, lightness moved) so chart series stay distinct.` };
}

function paceVsVoice(ctx) {
  const wpm = ctx.style.writing?.words_per_minute;
  const target = ctx.style.storyboard?.target_shot_seconds;
  if (!ctx.style.audio?.has_voice || !wpm || target === undefined) return null;
  const sentence = WORDS_PER_SENTENCE / (wpm / 60);
  if (target >= sentence) return null;
  const next = Math.ceil(sentence * 10 - 1e-9) / 10;
  const p = permitted(ctx, { storyboard: { target_shot_seconds: next } });
  return p && { id: "pace-vs-voice", sample: null, patch: guessed(p, "pace-vs-voice"), title: ctx.vi ? "Kéo dài shot cho kịp lời đọc" : "Lengthen shots to fit the voice", why: ctx.vi ? `Shot ${target}s ngắn hơn thời gian đọc một câu ~${WORDS_PER_SENTENCE} từ (${r2(sentence)}s ở ${wpm} từ/phút); đề xuất ${next}s.` : `Shots of ${target}s are shorter than reading a ~${WORDS_PER_SENTENCE}-word sentence (${r2(sentence)}s at ${wpm} wpm); proposing ${next}s.` };
}

function captionSafeZone(ctx) {
  if (ctx.aspect !== "9:16" && ctx.style.writing?.format !== "short-vertical") return null;
  const cap = ctx.brand.captions ?? {};
  const size = cap.size ?? 44;
  const fitChars = Math.floor(((1 - 2 * UI_ZONE.right) * 1080) / (CAPTION_CHAR_WIDTH * size));
  // Never below the schema minimum: a larger size than that allows is left to the size field, not to a broken patch.
  const maxChars = Math.max(MIN_CAPTION_CHARS, fitChars);
  const patch = {};
  const notes = [];
  if ((cap.position ?? "bottom") === "bottom") {
    setPath(patch, "brand.captions.position", "middle");
    notes.push(ctx.vi ? `phụ đề nằm trong ${UI_ZONE.bottom * 100}% đáy khung (thanh tên/nút của TikTok, Reels)` : `captions sit in the bottom ${UI_ZONE.bottom * 100}% (TikTok / Reels UI)`);
  }
  if (cap.max_chars && cap.max_chars > maxChars) {
    setPath(patch, "brand.captions.max_chars", maxChars);
    notes.push(ctx.vi ? `dòng rộng quá, chạm ${UI_ZONE.right * 100}% mép phải; giới hạn ${maxChars} ký tự` : `lines reach the right ${UI_ZONE.right * 100}% rail; capped at ${maxChars} characters`);
  }
  const p = permitted(ctx, patch);
  return p && { id: "caption-safe-zone", sample: "caption", ratio: "9:16", patch: guessed(p, "caption-safe-zone"), title: ctx.vi ? "Đưa phụ đề ra khỏi vùng giao diện 9:16" : "Move captions out of the 9:16 UI zone", why: ctx.vi ? `Video dọc: ${notes.join("; ")}.` : `Vertical video: ${notes.join("; ")}.` };
}

function missingParts(ctx) {
  const b = ctx.brand;
  const missing = PART_KINDS.filter((k) => !ctx.hasPart(k) && !(k === "lower-third" && b.lower_third) && !(["intro", "outro"].includes(k) && b[k]?.enabled));
  if (!missing.length) return null;
  const hint = (kind) => (ctx.vi ? `${kind === "intro" ? "Mở đầu" : "Kết"} ~3s: tiêu đề bằng font heading của style trên màu nền, fade vào/ra` : `${kind === "intro" ? "Opening" : "Closing"} ~3s: title in the style's heading font on the background colour, fade in/out`);
  const story = {};
  for (const kind of ["intro", "outro"]) if (missing.includes(kind) && !ctx.style.storyboard?.[kind]) story[kind] = hint(kind);
  const p = Object.keys(story).length ? permitted(ctx, { storyboard: story }) : null;
  return { id: "missing-parts", sample: "parts", patch: p ? guessed(p, "missing-parts") : {}, parts: missing, title: ctx.vi ? "Sinh phần còn thiếu theo style" : "Generate the missing parts", why: ctx.vi ? `Chưa có ${missing.join(", ")}: tạo scene mẫu dùng màu và font của style, lưu ở style-refs/${ctx.slug}/parts/.` : `No ${missing.join(", ")} yet: scene templates built from the style's colours and fonts, saved to style-refs/${ctx.slug}/parts/.` };
}

function seriesLock(ctx) {
  if (!ctx.series || SERIES_OWNED.every((u) => ctx.locked.includes(u))) return null;
  return { id: "series-lock", sample: null, patch: {}, locks: SERIES_OWNED, title: ctx.vi ? "Giữ nguyên logo, giọng, intro/outro của series" : "Keep the series logo, voice, intro and outro", why: ctx.vi ? `brand.json dùng chung cho series "${ctx.series}": style chỉ đổi màu, font, chuyển động, phụ đề; ${SERIES_OWNED.map((u) => u.slice(6)).join(", ")} được khoá.` : `brand.json is shared by series "${ctx.series}": the style changes colours, fonts, motion and captions only; ${SERIES_OWNED.map((u) => u.slice(6)).join(", ")} are locked.` };
}

// light <-> dark: bg and fg swap sides, every other colour stays unless it would fail the contrast check.
function variantRule(ctx) {
  const c = ctx.brand.colors;
  const [bg, fg] = [solidHex(c.bg), solidHex(c.fg)];
  if (!bg || !fg) return null;
  const [b, f] = [hexToOklch(bg), hexToOklch(fg)];
  const name = b.L < 0.5 ? "light" : "dark";
  if (ctx.hasVariant(name)) return null;
  const colors = name === "light" ? { bg: oklch(0.97, Math.min(b.C, 0.02), b.h), fg: oklch(Math.min(Math.max(1 - f.L, 0.2), 0.3), f.C, f.h) } : { bg: oklch(0.18, Math.min(b.C, 0.03), b.h), fg: oklch(Math.max(Math.min(1 - f.L, 0.97), 0.9), Math.min(f.C, 0.02), f.h) };
  // Cards follow the page: a near-white panel on the light side, a raised dark panel on the dark side.
  const sf = solidHex(c.surface);
  if (sf) {
    const s = hexToOklch(sf);
    colors.surface = name === "light" ? oklch(0.99, Math.min(s.C, 0.02), s.h) : oklch(0.25, Math.min(s.C, 0.03), s.h);
  }
  for (const role of ["primary", "secondary", "accent", "muted"]) {
    const hex = solidHex(c[role]);
    if (!hex) continue;
    const fixed = fixContrast(hex, colors.bg, role === "muted" ? AA_TEXT : AA_LARGE);
    if (fixed !== hex) colors[role] = fixed;
  }
  const patch = { brand: { colors } };
  return { id: "variants", sample: "title", patch: {}, variants: { [name]: guessed(patch, "variants") }, title: ctx.vi ? `Tạo biến thể ${name === "light" ? "nền sáng" : "nền tối"} (${name})` : `Create a ${name} variant`, why: ctx.vi ? `Style đang nền ${name === "light" ? "tối" : "sáng"}: đảo độ sáng nền và chữ, giữ màu nhấn nếu vẫn đủ tương phản. Dùng với --variant ${name}.` : `The style has a ${name === "light" ? "dark" : "light"} background: background and text swap lightness, accents stay when contrast holds. Use with --variant ${name}.` };
}

export const RULES = [contrast, diacritics, tokenGaps, paceVsVoice, captionSafeZone, missingParts, seriesLock, variantRule];

// Proposals that still apply (not rejected before). Each keeps the number of its rule (position in RULES), so
// accepting or rejecting one never renumbers the others; a proposal that no longer applies leaves a gap.
export function proposeEnhancements(ctx) {
  return RULES.map((rule, i) => {
    const p = rule(ctx);
    return p && { ...p, n: i + 1 };
  }).filter((p) => p && !ctx.rejected.has(p.id));
}
