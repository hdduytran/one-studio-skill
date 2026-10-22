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
| 4 | Compare | `node "$S/scripts/style-compare.mjs" D <slug> [--variant v] [--ratio 9:16] [--offline]` | `review/style-<slug>-compare.jpg`: row 1 reference frames, row 2 title / chart / caption samples in the style, row 3 colour tokens |
| 5 | Enhance & customize | `style-enhance.mjs D <slug>` (proposals with reasons, apply only what the user accepts), `style-set.mjs D <slug> key=value … [--lock key]`, `style-diff.mjs D <slug>`, `style-editor.mjs D <slug>` | `style.enhance.json`, `style.custom.json`; repeat step 4 after each round |
| 6 | Apply | `node "$S/scripts/style-apply.mjs" D <slug> [--variant v] [--as-preset name] [--keep] [--dry-run]` | `brand.json` patched with `version` bumped, `studio.json → story.style`, `style-refs/<slug>/hints.json` |

Merge several references: `node "$S/scripts/style-merge.mjs" D <slug-a> <slug-b> [...] --as <slug>` (numbers: median; colours: only those found in at least 2 sources; other values: majority, a tie leaves the field out and it is listed as open; then run `style-draft.mjs D <slug> --check` and step 4).

### Step 4 · Compare

Run it with `--ratio` only when the user wants another frame than the reference's. Show `review/style-<slug>-compare.jpg` to the user and read out the tile order the script prints (the sheet has no captions when FFmpeg lacks `drawtext`), plus the heading and body font names. Works with no scenes in the project (gate 0). It renders stills only: no video, no approvals touched. Ask: "Style này đúng ý chưa? Mình áp dụng vào brand nhé?"

### Step 6 · Apply

1. Only after step 4's sheet was shown and the user said an explicit OK in chat.
2. `style-apply.mjs D <slug> --dry-run` first: it prints how many approved scenes will need re-approval. If that number is above 0, tell the user and ask again ("N cảnh đã duyệt sẽ phải duyệt lại, tiếp tục không?") before the real run. The script itself never asks.
3. Run it for real. Add `--as-preset <name>` when the user wants to reuse the look in other projects (saved under the plugin cache, listed at gate 0; a plugin preset name is refused). Footage (`source.*`, `frames/`) is deleted unless `--keep` (or the fetch used it).
4. Then `prepare-project.mjs D` and, for existing scenes, `keyframe-stills.mjs` and re-approval.
5. `style-refs/<slug>/hints.json` (`storyboard`, `audio`, `writing`, `do_not_copy`) is read at gate 3 (shot length, visual modes, camera, SFX density, intro/outro) and gate 7 (loudness, music bed). `story.format` and `story.tone` are filled from the style only when empty; an approved writers-room choice is never overwritten.

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
