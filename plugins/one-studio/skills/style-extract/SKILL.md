---
name: style-extract
description: Extracts the visual and editing style (colours, fonts, pacing, transitions, captions, tone, music mood) of an existing video or link (YouTube, TikTok, Facebook, Instagram, local file) into a style card, shows 3 sample scenes in that style, lets the user enhance and customize it, then applies it to a one-studio project's brand. Used by one-studio at gate 0 ("lấy style từ video/link"); also use for "clone style", "extract style", "bắt chước style", "làm giống video này", "lấy style từ link", "copy phong cách video". Never copies footage, logos, music, voices or slogans.
---

# Style extract

Reads HOW a reference video looks and moves, never WHAT it shows. Output lands in the project's `style-refs/<slug>/`; later gates read `brand.json`, not this skill.

`$S` = the one-studio skill directory (`../one-studio`). `D` = the project dir. Talk to the user in their language. Scripts for steps 2-6 are listed with their commands; use only the ones that exist in `$S/scripts/`.

## Steps (in order)

| # | Step | Command | Result |
|---|---|---|---|
| 1 | Fetch | `node "$S/scripts/style-fetch.mjs" D <url\|file> [--slug s] [--from 0:00] [--to 1:30] [--max 90] [--keep]` | `style-refs/<slug>/source.*`, `info.json`, `subs.vtt?` |
| 2 | Analyze | `node "$S/scripts/style-analyze.mjs" D <slug>` | `metrics.json`, `frames/`, `review/style-<slug>-*.jpg` (2 contact sheets) |
| 3 | Read & map | look at the 2 sheets + `metrics.json`, load `references/reading-guide.md` and `references/mapping.md`; `style-draft.mjs D <slug>` | `style.json` (+ `STYLE.md`) |
| 4 | Compare | `node "$S/scripts/style-compare.mjs" D <slug> [--variant v]` | 3 sample scenes in the style, side by side with the reference sheet |
| 5 | Enhance & customize | `style-enhance.mjs D <slug>` (proposals with reasons, apply only what the user accepts), `style-set.mjs D <slug> key=value … [--lock key]`, `style-diff.mjs D <slug>`, `style-editor.mjs D <slug>` | `style.enhance.json`, `style.custom.json`; repeat step 4 after each round |
| 6 | Apply | `node "$S/scripts/style-apply.mjs" D <slug> [--variant v] [--as-preset name] [--keep] [--dry-run]` | `brand.json` patched with `version` bumped, `studio.json → story.style`, storyboard hints |

Merge several references: `style-merge.mjs D <slug-a> <slug-b> --as <slug>`.

## Consent (hard rules)

- A link is downloaded only when `studio.json → services.download` is `true`. Otherwise ask once ("Mình được tải video từ link này về máy để phân tích không?"), then set it. A local file needs no consent.
- Never install `yt-dlp` or any tool without asking. Never use browser cookies. A link that needs login: stop and tell the user to download it themselves and pass the file.
- Default analysed span is the first 90 s; `--from` / `--to` choose another.
- Approval to apply is the user's explicit OK in chat, after step 4.

## What is never taken

Footage and frames, logos, mascots and characters, slogans and on-screen copy, music, voices, the author's name. Anything of that kind seen goes to `do_not_copy` in `style.json`. Frames of the source stay in `style-refs/` and `review/`; nothing from `style-refs/` is copied to `assets/` or `out/`.

## Layout

`style-refs/<slug>/`: `source.<ext>` · `info.json` · `subs.vtt?` · `metrics.json` · `frames/` · `style.json` · `style.enhance.json` · `style.custom.json` · `STYLE.md`. Sheets live in `review/style-<slug>-*.jpg`. `style-refs/.gitignore` hides `*/source.*` and `*/frames/`; `source.*` is deleted after step 6 unless `--keep`.

`slug` = kebab-case of the video title or file name, `-2`, `-3` on clash (`lib/style-refs.mjs`).

## style.json

Schema `$S/schemas/style.schema.json`; validated by `node "$S/scripts/validate.mjs" D`.

- `brand` is a partial `brand.json` patch (colours, surface, typography, motion, transitions, captions).
- `storyboard` (shot length, visual modes, camera, SFX density, intro/outro), `writing` (format, tone, hook, words per minute), `audio` (LUFS, silence ratio, voice, nearest built-in music bed).
- `provenance` marks every field path (down to three segments, e.g. `brand.colors.primary`) as `measured` (script), `seen` (read from a frame), or `guessed`. Tell the user which fields are guesses.
- Fields in `style.custom.json` or locked are never overwritten by a re-extract or merge.

## Changing the brand

Applying a style bumps `brand.json → version`: say how many scenes must re-render and ask first (see one-studio `references/workflow-gates.md`).

## Context budget

Fetch + analyze: this file only. Read & map: the two reference files, 2 sheets, trimmed `metrics.json`, first 30 s of transcript. Enhance: `references/enhance-rules.md` and the `style-enhance` output. Customize: the `style-diff` table.
