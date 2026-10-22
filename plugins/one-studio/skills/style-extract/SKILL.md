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
| 5 | Enhance & customize | `style-enhance.mjs D <slug>`, `style-set.mjs D <slug> key=value … [--lock k]`, `style-diff.mjs D <slug>`, `style-editor.mjs D <slug>` (see Step 5) | `style.enhance.json`, `style.custom.json`, `variants/<v>.json`; repeat step 4 after each round |
| 6 | Apply | `node "$S/scripts/style-apply.mjs" D <slug> [--variant v] [--as-preset name] [--keep] [--dry-run] [--allow-low-contrast]` | `brand.json` patched with `version` bumped, `studio.json → story.style`, `style-refs/<slug>/hints.json` |

Merge several references: `node "$S/scripts/style-merge.mjs" D <slug-a> <slug-b> [...] --as <slug>` (numbers: median; colours: only those found in at least 2 sources; other values: majority, a tie leaves the field out and it is listed as open; then run `style-draft.mjs D <slug> --check` and step 4).

### Step 4 · Compare

Run it with `--ratio` only when the user wants another frame than the reference's. Show `review/style-<slug>-compare.jpg` to the user and read out the tile order the script prints (the sheet has no captions when FFmpeg lacks `drawtext`), plus the heading and body font names. Works with no scenes in the project (gate 0). It renders stills only: no video, no approvals touched. Ask: "Style này đúng ý chưa? Mình áp dụng vào brand nhé?"

### Step 5 · Enhance & customize (loop)

Load `references/enhance-rules.md` first. Every command takes `--variant <v>` (except `style-enhance`) once a variant exists.

1. **Enhance:** `style-enhance.mjs D <slug>` lists numbered proposals and draws `review/style-<slug>-enhance.jpg` (before | after per row; read out the tile order). Explain each in plain words, add at most 3 suggestions of your own (provenance `seen`), then `--accept 1,3` / `--reject 2` only as the user says.
2. **Customize by chat:** turn what the user says into `style-set.mjs D <slug> key=value … [--lock key]` using the table below. Read current values first with `style-diff.mjs D <slug> --get motion.duration`. A refused value (wrong type, bad hex) writes nothing: tell the user why. `--unset key` returns the layer below; `--lock key` pins a value so a re-extract or merge cannot change it (the script prints "kept by your choice: …").
3. **Customize by eye:** `style-editor.mjs D <slug> [--variant v]` writes `review/style-editor.html` (works from file://, offline). The user drags and picks, presses "Sao chép thay đổi" and pastes the one-line `style-set` command back; you run it. The page previews with CSS variables, so the compare sheet stays the thing they approve.
4. **Show:** after every change run `style-compare.mjs D <slug> [--variant v]`, show the sheet and `style-diff.mjs D <slug>` (field | extracted | current | layer | lock), ask again. Repeat until the user says OK.
5. **Close the gate:** `style-apply.mjs` only after the user's explicit OK on the latest sheet (Step 6).

Layers (later wins, field by field): `style.json` (extraction only) < `style.enhance.json` < `style.custom.json` (+ `locked`) < `variants/<v>.json`. Fonts, easing sets and music beds are written whole. `status.mjs` shows the style in use and marks it `!` when the effective card changed after the last apply. Re-running `style-draft --force` or `style-merge` never touches the upper layers.

| The user says | Run |
|---|---|
| "chậm hơn X%" / slower by X% | `motion.duration.fast`, `.base`, `.slow` each × (1 + X/100), 2 decimals; same for `motion.stagger` |
| "nhanh hơn X%" / faster | the same, ÷ (1 + X/100) |
| "cắt nhanh/chậm hơn" (shot length) | `storyboard.target_shot_seconds` × 0.8 / × 1.25 |
| "đậm hơn" / bolder, "mảnh hơn" / lighter | `typography.heading.weight` ± 100 (one of the font's weights in `font-map.md`) |
| "đổi font tiêu đề / nội dung sang X" | `typography.heading.family=X` / `typography.body.family=X`: only fonts in `references/font-map.md` |
| "nền sáng" / "nền tối" | variant: `style-enhance.mjs` (accept `variants`), then `style-compare.mjs --variant light` / `dark` |
| "màu nhấn / màu chính / màu nền là #…" | `colors.accent=#…`, `colors.primary=#…`, `colors.bg=#…` (check the badge: text pairs ≥ 4.5) |
| "phụ đề to/nhỏ hơn" | `captions.size` × 1.15 / × 0.87 |
| "phụ đề lên giữa / lên trên / xuống dưới" | `captions.position=middle` / `top` / `bottom` |
| "kính mờ" / glass, "phẳng" / flat | `surface=glass` / `surface=flat` |
| "chuyển cảnh mượt / cắt gắt" | `transitions.default=fade` / `cut` |
| "giữ nguyên X, đừng đổi" | `--lock <key of X>` |
| "bỏ chỉnh sửa X, về như video gốc" | `--unset <key of X>` |
| "giống bản gốc hơn / giống brand hiện tại hơn" | the editor's "độ giống gốc" slider (colours blend in OKLCH, numbers linearly, enums switch at 50%) |

### Step 6 · Apply

1. Only after the latest step 4 sheet (with the variant, if one is used) was shown and the user said an explicit OK in chat. Customizing or enhancing never applies anything by itself.
2. `style-apply.mjs D <slug> --dry-run` first: it prints how many approved scenes will need re-approval. If that number is above 0, tell the user and ask again ("N cảnh đã duyệt sẽ phải duyệt lại, tiếp tục không?") before the real run. The script itself never asks.
3. The script refuses (exit 1, nothing written) when text/background pairs fail WCAG AA. Tell the user, offer the `contrast` proposal (`style-enhance.mjs D <slug>` lists it as `[contrast]`; then `--accept <its number>`) or new colours via `style-set`, then run `style-compare` again. Add `--allow-low-contrast` only when the user insists after hearing the reason.
4. Run it for real. Add `--as-preset <name>` when the user wants to reuse the look in other projects (saved under the plugin cache, listed at gate 0; a plugin preset name is refused). Footage (`source.*`, `frames/`) is deleted unless `--keep` (or the fetch used it).
5. Then `prepare-project.mjs D` and, for existing scenes, `keyframe-stills.mjs` and re-approval.
6. `style-refs/<slug>/hints.json` (`applied_hash`, `storyboard`, `audio`, `writing`, `do_not_copy`) is read at gate 3 (shot length, visual modes, camera, SFX density, intro/outro) and gate 7 (loudness, music bed). `story.format` and `story.tone` are filled from the style only when empty; an approved writers-room choice is never overwritten.

## Consent (hard rules)

- A link is downloaded only when `studio.json → services.download` is `true`. Otherwise ask once ("Mình được tải video từ link này về máy để phân tích không?"), then set it. A local file needs no consent.
- Never install `yt-dlp` or any tool without asking. Never use browser cookies. A link that needs login: stop and tell the user to download it themselves and pass the file.
- Default analysed span is the first 90 s; `--from` / `--to` choose another.
- Approval to apply is the user's explicit OK in chat, after step 4.

## What is never taken

Footage and frames, logos, mascots and characters, slogans and on-screen copy, music, voices, the author's name. Anything of that kind seen goes to `do_not_copy` in `style.json`. Frames of the source stay in `style-refs/` and `review/`; nothing from `style-refs/` is copied to `assets/` or `out/`.

## Layout

`style-refs/<slug>/`: `source.<ext>` · `info.json` · `subs.vtt?` · `metrics.json` · `frames/` · `style.json` · `style.enhance.json` · `style.custom.json` · `variants/<v>.json` · `parts/*.html` (generated scenes) · `STYLE.md`. The editor page is `review/style-editor.html` (+ `review/style-editor/`). Sheets live in `review/style-<slug>-*.jpg`. `style-refs/.gitignore` hides `*/source.*` and `*/frames/`; `source.*` is deleted after step 6 unless `--keep`.

`slug` = kebab-case of the video title or file name, `-2`, `-3` on clash (`lib/style-refs.mjs`).

## style.json

Schema `$S/schemas/style.schema.json`; validated by `node "$S/scripts/validate.mjs" D`.

- `brand` is a partial `brand.json` patch (colours, surface, typography, motion, transitions, captions).
- `storyboard` (shot length, visual modes, camera, SFX density, intro/outro), `writing` (format, tone, hook, words per minute), `audio` (LUFS, silence ratio, voice, nearest built-in music bed).
- `provenance` marks every field path (down to three segments, e.g. `brand.colors.primary`) as `measured` (script), `seen` (read from a frame), or `guessed`. Tell the user which fields are guesses.
- Fields in `style.custom.json` or locked are never overwritten by a re-extract or merge; consumers read the effective style (`lib/style-layers.mjs`: `effectiveStyle(dir, slug, variant?)`).

## Changing the brand

Applying a style bumps `brand.json → version`: say how many scenes must re-render and ask first (see one-studio `references/workflow-gates.md`).

## Context budget

Fetch + analyze: this file only. Read & map: the two reference files, 2 sheets, trimmed `metrics.json`, first 30 s of transcript. Enhance: `references/enhance-rules.md` and the `style-enhance` output. Customize: the `style-diff` table.
