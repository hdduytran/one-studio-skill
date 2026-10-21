# Workflow gates

`status.mjs <dir>` is the source of truth. Each gate below lists what goes in, what comes out, the question you ask, and how it closes. `S` = skill base dir, `D` = project dir.

Marks printed by status: `✓` done · `→` current · `!` input changed after approval (re-approve) · `·` not reached.

---

## 0 · Setup

- **In:** the user's request.
- **Ask (one message, only missing items):** new video or series episode · 2D/3D/mixed · aspect + length · VO language · brand (colours, fonts, logo or defaults) · allowed services.
- **Do:** `node "$S/scripts/init-project.mjs" D --title "…" --lang <code> --dimension <2d|3d|mixed> --aspect <ratio> --duration <s> [--series <name>] [--series-root <dir>]`.
  - With `--series`, brand lives at `<series-root>/<name>/brand/brand.json` (default series root `D/../series`). If it exists it is reused: **do not ask brand questions**.
  - Write the user's brand answers into `brand.json` (keep `version: 1` for a new kit).
  - Write the confirmed TTS endpoint into `studio.json → audio.tts.<lang>` (`base_url`, `model`, `voice`) and set `services.tts: true` once the user agrees to calls. Keys stay in env (`ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY`).
- **Close:** init marks setup done.

## 1 · Brief

- **In:** the answers so far.
- **Ask:** at most 3 questions (goal, audience, CTA) if not already clear; never re-ask gate 0 items.
- **Do:** fill `D/brief.md`; remove every `<!-- TODO … -->`.
- **Close:** `node "$S/scripts/status.mjs" D --approve brief` (refuses while TODOs remain). No explicit user OK required; mention the brief in one line.

## 2 · Script — approval

- **Do:** write `D/script.md`:
  - `## s01 · Title` per scene, ids `s01, s02…` in order; optional `> visual:` line.
  - Each `- ` bullet = one spoken sentence (≤ 20 words) = one TTS call = one caption cue.
  - Hook in the first 3 s; one idea per scene; the total speaking time fits the target length (vi ≈ 2.8 words/s, en ≈ 2.5 words/s).
- **Ask:** show the script, total word count and estimated seconds: "Bạn duyệt kịch bản này chứ? Muốn sửa câu nào?"
- **Close:** after the user's OK → `--approve script`.

## 3 · Storyboard — approval

- **Do:** write `D/storyboard.json` from the approved script (`schemas/storyboard.schema.json`):
  - one scene per script heading, same id; `lines[]` = the bullets (`id` = `<scene>-<n>`; `say` when numbers must be spelled out for TTS while `text` keeps digits);
  - `type` per scene: `text | diagram | data | lottie | rive | explainer | character | 3d`. Prefer cheap types; use `explainer`, `character`, `3d` only when the idea needs them;
  - `duration` ≥ spoken time + 0.5 s; `transition` from brand defaults unless the story needs another;
  - `character.style` = a lemo-opuscar style slug; `explainer.size` = `figure` unless the user asked for more.
- **Ask:** show a table `id · type · duration · visual · lines`, the total length, and which scene types are expensive.
- **Close:** after OK → `--approve storyboard` (validates the schema + cross-checks, syncs `studio.json → scenes`).

## 4 · Credit estimate — acknowledgement

- **Do:** `node "$S/scripts/status.mjs" D --estimate` and paste the table as printed.
- **Ask:** "Ước tính như trên. Tiếp tục dựng keyframe chứ?" If ⚠ lines appear, offer the cheaper option (fewer scenes, 2D instead of 3D, figure instead of hero).
- **Close:** after OK → `--approve estimate`. Editing the storyboard later re-opens gates 3 and 4.

## 5 · Keyframe review — approval per scene

- **Do:** `prepare-project.mjs D` (runtime, fonts, brand CSS, vendored libs) → `new-scene.mjs D --all` (templates per type; lemo scenes get a folder; Remotion scenes: `new-remotion.mjs D`) → write each scene (read its type reference first) → `keyframe-stills.mjs D` (only changed/unapproved scenes) → look at `review/sheet.jpg` yourself, fix, re-run for those ids.
- **Ask:** show the sheet path (and the image if the client can display it), list scenes you are unsure about: "Bạn duyệt các scene này chứ? Scene nào cần sửa?"
- **Close:** `status.mjs D --approve-scenes s01,s02` for the approved ones (or `all`), then `--approve keyframes` once every scene is approved. A later edit to a scene clears only its approval.

## 6 · Build

- `render-changed-scenes.mjs D --preview`: renders low-res clips for approved scenes whose hash changed; unchanged scenes are cached; unapproved scenes are blocked (exit 2).
- **Close:** `--approve build` (checks every scene has a current preview clip).

## 7 · Audio

- `build-audio.mjs D --dry-run` → number of TTS calls. If `services.tts` is not true, ask once; then `build-audio.mjs D --allow-tts`.
- It fits scene lengths to the VO (keeps approvals), writes `audio/vo.wav`, `captions.srt`, `audio/manifest.json`. If scenes got longer, re-run gate 6 for them (`render-changed-scenes --preview`).
- Optional: sync on-screen reveals to `audio/manifest.json → scenes[].lines[].start`, re-run stills for the scenes you touched.
- **Close:** `--approve audio`.

## 8 · Preview — approval

- `render-changed-scenes.mjs D --preview` then `concat-and-mix.mjs D --preview` → `out/<name>-preview.mp4` (540p, VO, music, captions, −14 LUFS).
- **Ask:** send the path; collect scene-level fixes. Fixes → back to gate 5 for those scenes only.
- **Close:** after OK → `--approve preview`.

## 9 · Render

- `status.mjs D --estimate` (render time), `render-changed-scenes.mjs D` (final clips; same approvals), `concat-and-mix.mjs D` → `out/<name>.mp4` + `.srt`. Check the printed duration, size and LUFS.
- **Close:** `--approve render`.

## 10 · Publish

- `publish.mjs D` → extra ratios from `format.exports`, thumbnails, `out/manifest.json` (see `references/series-publish.md`). Look at each `out/<ratio>/sheet.jpg`.
- **Close:** `--approve publish`, tell the user the output paths. For a series, offer `series-bumper.mjs` if the intro/outro should be reused.

---

## Changing things after approval

| User wants | Do | Re-opens |
|---|---|---|
| Change a sentence | edit `script.md` + matching `storyboard.json` line | script, storyboard, estimate; only that scene's audio + clip rebuild |
| Add / remove a scene | edit script + storyboard (new id, never reuse an old id) | script, storyboard, estimate; only the new scene builds |
| Change brand | edit `brand.json`, bump `version` | every scene's hash → say how many scenes re-render, ask first |
| Change aspect ratio | add to `format.exports` (publish) rather than changing `format.aspect` | publish only |
