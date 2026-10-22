# Tester report: style-extract (phase 7)

Date 2026-10-22 · branch `feat/style-extract` · macOS, FFmpeg 8 (no drawtext/libass), Chrome present, yt-dlp absent, no network used.

## Results

| Command | Result |
|---|---|
| `npm test` | 226/227. Only fail: "caption choice ... without libass" (pre-existing, this FFmpeg has no libass) |
| `npm run test:e2e` | 4/5 in the full run: world, 2D/3D flow, style (new) pass. `screen.test.mjs` ("two renders of the same scene differ") is flaky and unrelated to this work: it failed in the full run and 1 of 3 solo runs with these changes, and passed with all changes stashed. It touches no style file; frame hashes differ in the last frames of a real Chrome render. Needs its own look |
| `npm run validate:demo` / `validate:gps` | valid / valid |
| `npm run validate:plugin` | passed (`claude` CLI available) |
| new `tests/e2e/style.test.mjs` | pass (~9 s); skips cleanly without Chrome/FFmpeg |

Phase-7 changes under test: `style-apply` refuses WCAG AA failures (`--allow-low-contrast` overrides, nothing written on refusal, dry-run too); `status.mjs` shows `style <slug>` and marks `!` when the effective card changed after apply (hash stored as `applied_hash` in `style-refs/<slug>/hints.json`); `validate.mjs` checks `story.style` slug and variant exist; README section "Lấy style từ video" + yt-dlp row + `ONE_STUDIO_YTDLP`; SKILL.md apply step updated.

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `npm test` green offline, tests for schema, metrics, colour snap, layers, enhance, style-set round trip, preset cache | PASS (with known baseline fail) | 226/227; the one failure is the libass caption test from before this work. Suites: style-refs, style-analyze, style-draft, style-apply, style-customize, style-fetch |
| 2 | Cuts within 1 frame, dominant colour ΔE2000 ≤ 3, identical `metrics.json` over two runs | PASS | style-analyze tests "cuts, ASL, palette, fade, silence and sheets on a clip with known content" and "same input gives identical metrics apart from the timestamp" |
| 3 | 60 s local clip: metrics + sheets in < 30 s | PASS | 90 s 960x540 clip: fetch 4.4 s + analyze 3.0 s wall. Only the `frames` sheet appeared (one shot, so no cut sheet) |
| 4 | `style.json` valid, each field has `source` | PASS | style-refs tests (provenance required, stray entries rejected); `style-draft --check` on the manual run printed "Valid" |
| 5 | Link only with `services.download`; login stops with guidance; no cookies | PARTIAL | Tests: no consent stops before looking for yt-dlp; `buildArgs` has no cookies; stderr classes map to the login message; a stub binary covers the download path. A real yt-dlp run was NOT done (not installed, no network). See manual commands below |
| 6 | Re-extract / merge never overwrite custom or locked fields | PASS | tests "style-draft --force after style-set keeps custom and locked values", "style-merge reads its sources through their layers", "layers ..." |
| 7 | Enhance proposals have reason + before/after image, applied only when accepted; applied style passes AA | PASS | enhance tests (before/after row per visual proposal, `--accept` only), new test "style-apply refuses pairs under WCAG AA and writes nothing"; e2e: refused -> accept `[contrast]` -> apply succeeds. Manual run: refused with muted 1.2, accent 1.4; accepted proposal 1, applied |
| 8 | Editor works from file://, offline; copied `style-set` line reproduces displayed values | PASS | tests "round trip: a blended change set becomes a style-set command ...", "editor page in headless Chrome: no network request ..." |
| 9 | Apply changes only `brand.json` (+ `story.style`, hints), bumps version, nothing from `style-refs/` into `assets/`, preset in cache and listed | PASS | apply tests ("nothing from style-refs/ lands in assets/ or out/", "--as-preset ... loadPresets sees"); e2e on a copy of `examples/demo`: version +1, `story.style = {slug}`, `validate` clean, preset in `init-project --help` list, `render-changed-scenes --dry-run` plans all 4 scenes (blocked until re-approved) |
| 10 | Style from the infinity-board reference gives palette within ΔE2000 ≤ 10 per token, light bg, flat | PARTIAL | See below. 4 of 6 tokens within 10 in both runs; light bg and flat pass; `muted` and (after the AA fix) `accent` miss. User has not yet agreed on the sheet |

## Criterion 10 in detail

No original reference video exists on disk. Input: `videos/vpbank-infinity-board/out/vpbank-infinity-board-preview.mp4` (960x540, 215 s, its own output) copied into a temp dir; the project was a fresh temp `init-project`. The user's `videos/` folder was not modified. The flow ran with the file path: fetch (first 90 s), analyze, draft, `seen` fields filled by me from the frames sheet (12 unlabelled tiles, tile order printed), compare sheet viewed, enhance, apply.

Measured: only 2 palette clusters (bg `#f3f0ed` 88 %, `#d5dfdb`). Cuts: 1 shot, 0 cuts (a camera moves over one board), so transitions, shot length and motion durations are `guessed`. I set by eye: fg `#1d1f24`, primary `#12994d`, secondary `#cf2230`, accent `#f4c52f`, surface flat, Be Vietnam Pro 800/500, modes `world-camera` + `kinetic-type`, tone `knowing-friend`. No captions are visible in the frames, so caption fields stayed empty.

ΔE2000 against preset `infinity-board`:

| Token | Preset | A: after accepting `contrast` | ΔE | B: as read, `--allow-low-contrast` | ΔE |
|---|---|---|---|---|---|
| bg | `#f5f4ef` | `#f3f0ed` | 1.8 | `#f3f0ed` | 1.8 |
| fg | `#1c1e22` | `#1d1f24` | 0.8 | `#1d1f24` | 0.8 |
| primary | `#0b8a4a` | `#12994d` | 5.4 | `#12994d` | 5.4 |
| secondary | `#d7262e` | `#cf2230` | 2.3 | `#cf2230` | 2.3 |
| accent | `#f4c430` | `#b08200` | 19.2 MISS | `#f4c52f` | 0.4 |
| muted | `#8a8d94` | `#656e6b` | 14.7 MISS | `#d5dfdb` | 23.1 MISS |

Reasons for the misses:
- `muted`: the only measured candidate was the pale cluster between bg and ink (`#d5dfdb`); the preset's mid-grey label colour is too small an area to form a cluster. I did not set it by eye. Setting `#8b8e95` by eye would be ΔE about 0.4 from the preset, but see next point.
- The preset itself fails the AA rules the tool enforces: `muted` 3.02 < 4.5 and `accent` 1.49 < 3. So `muted` and `accent` cannot be both within ΔE 10 of the preset and AA-clean. Criterion 7 (AA always) and criterion 10 conflict for exactly these two tokens. In run A the contrast fix darkens them (correct per criterion 7); in run B the yellow matches but the refusal needs `--allow-low-contrast`.

Compare sheet (viewed): row 1 shows reference frames, row 2 the title, chart and caption samples in the style (cream board, yellow sticky note, ink headings, green/red bars, Be Vietnam Pro), row 3 six colour tokens. Look and feel match the reference at a glance. Visible flaw before the fix: the pale `muted` text is nearly unreadable, which is what the AA refusal caught. I cannot give the user's agreement; that needs them to look at the sheet.

## Deviations accepted by the lead

- Contact sheets are unlabelled on this FFmpeg (no drawtext); the scripts print the tile order instead.
- `style-merge` keeps a single `reference` plus a `sources.json`.
- Ties in a merge leave the field absent and list it as open.
- No `captions.highlight` field (renderer lacks it); a word-by-word highlight may be noted in STYLE.md only. The reading guide says so.
- Brand CSS variables are `--c-*`, not `--os-*`.
- `style-apply` refuses AA failures unless `--allow-low-contrast` (lead decision, replaces the earlier warning).

## Still to run by the user (needs network and yt-dlp)

1. Install: `brew install yt-dlp` (or `pipx install yt-dlp`); `node plugins/one-studio/skills/one-studio/scripts/check-external.mjs <project>` should then list it as present.
2. Set `studio.json -> services.download: true` in a scratch project (`init-project.mjs /tmp/sx --lang vi`).
3. YouTube: `node plugins/one-studio/skills/one-studio/scripts/style-fetch.mjs /tmp/sx "<youtube-url>" --slug yt-sample --from 0:00 --to 1:00`, then `style-analyze.mjs /tmp/sx yt-sample` and check `style-refs/yt-sample/` has `source.*`, `info.json` (and `subs.vtt` if subtitles exist).
4. TikTok: same with a short TikTok link, `--slug tt-sample`.
5. A private or login-only Facebook/Instagram link: expect the stop message asking you to download it yourself and no cookie use.
6. Without `services.download`: the same command must stop with the consent message before running yt-dlp.

## Notes

- Temp dirs and the temp preset cache from the manual run live in the session scratchpad only; nothing was written to `~/.cache/one-studio` or to `videos/`.
- No code review pass was run in this phase; `applyPreset`, `loadPresets`, `compare-presets` and the `studio` schema changed earlier, so a `code-reviewer` run before the PR is still advised.

## Unresolved questions

- Which should win for `muted` and `accent` when a reference palette is below AA: the reference (criterion 10) or AA (criterion 7)? Current behaviour is AA, with an explicit override.
- Does the user accept the compare sheet for infinity-board?
