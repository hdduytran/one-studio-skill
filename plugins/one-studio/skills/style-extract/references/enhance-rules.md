# Enhance rules

`style-enhance.mjs D <slug>` runs these rules on the **effective** style (extracted card, then accepted proposals, then the user's own choices) and prints a numbered list plus `review/style-<slug>-enhance.jpg` (one row per proposal that changes a sample: before | after; the script prints the tile order). Nothing is written until the user accepts: `--accept 1,3` (or `all`), `--reject 2` (never proposed again). The numbers are positions in the list you just printed, so list first, then accept. A field the user locked or set by hand is never proposed again.

Every proposal is a patch marked `guessed` with note `enhance:<rule>`. Accepted patches go to `style.enhance.json` (variants to `variants/<v>.json`, generated scenes to `parts/`); `style.json` is never touched.

## The rules

| Rule | Fires when | Patch |
|---|---|---|
| `contrast` | a text pair of the samples is under WCAG AA: `fg`, `muted` on `bg` under 4.5; `primary`, `secondary`, `accent` (large text, bars) under 3.0; caption text on its box under 4.5 | lightness (OKLCH) of the text-side colour only, hue and chroma kept; the background never moves |
| `diacritics` | project language is Vietnamese and heading, body or caption font is not a `verified` row of `font-map.md` (and is not the user's own font file) | same-class verified row (geometric -> Be Vietnam Pro, grotesk -> Inter), else Be Vietnam Pro |
| `token-gaps` | the style lacks `secondary`, `accent` or `muted`, or `secondary`/`accent` is within ΔE2000 8 of an earlier chart colour | secondary: primary hue +40; accent: hue +160 and chroma at least 0.12; muted: near-neutral in the background's hue; each passes contrast |
| `pace-vs-voice` | the style has a voice and `target_shot_seconds` is under the time to speak 12 words at `words_per_minute` | `target_shot_seconds` = that time, rounded up to 0.1 s |
| `caption-safe-zone` | 9:16 project (or a `short-vertical` style) and captions sit at the bottom (TikTok / Reels UI covers the bottom 20% and right 12%), or `max_chars` is wider than the middle 76% | `captions.position: middle`; `max_chars` capped to fit |
| `missing-parts` | no lower third, intro, outro or thumbnail in the brand, the project or `parts/` | scene files in `style-refs/<slug>/parts/` built from brand variables (copy one to `scenes/` and add it to the storyboard); `storyboard.intro` / `outro` text hints |
| `series-lock` | the project belongs to a series | `locked` in `style.custom.json`: logo, voice, intro, outro, lower third stay the series'; the style only changes colours, fonts, motion, captions |
| `variants` | no `light` / `dark` variant yet | `variants/light.json` (for a dark style) or `dark.json`: background and text swap lightness, accents kept unless they fail contrast; use with `--variant` |

Thresholds and sizes live in `lib/style-enhance.mjs` and `lib/style-contrast.mjs`; this table is the contract, keep both in step.

## How to present them

1. Run `style-enhance.mjs D <slug>`, show the sheet, read out the tile order.
2. For each proposal, one or two plain sentences in the user's language: what is wrong, what changes, what they gain. Example: "Chữ phụ đang xám nhạt trên nền xám, khó đọc trên điện thoại. Mình làm nó đậm hơn một chút, vẫn cùng tông màu."
3. Say which numbers are only numbers or locks (no picture).
4. Ask which to accept. Never accept on the user's behalf.
5. `--accept …`, then `style-compare.mjs` (add `--variant light` after accepting the variant), show it, ask again.

## Your own suggestions (at most 3)

Besides the rules, add up to 3 suggestions from looking at the sheets (a font weight that looks too thin, a caption box that hides the subject, an accent that clashes). Say they are your opinion, not a rule. If accepted, apply them with `style-set.mjs` (provenance `seen`); never write the layer files by hand.

## Customizing by chat

Use `style-diff.mjs D <slug> --get motion.duration,captions` for current values before computing a relative change. The phrase table is in `SKILL.md`.
