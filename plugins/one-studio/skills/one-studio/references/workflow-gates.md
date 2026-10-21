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

- **Do:** build each scene just far enough to render 1–3 stills (start, middle, end), then make a contact sheet in `D/review/`.
- **Ask:** show the sheet; note any scene you are unsure about. The user approves scenes individually.
- **Close:** approved scenes record their hash; a later edit to a scene clears its approval.

## 6 · Build scenes

- Load the reference for each scene type once (router in SKILL.md). One file per scene in `D/scenes/`, brand tokens only. Lint every scene before render.

## 7 · Audio

- Ask before the first TTS call of the project if `services.tts` is not true. One call per sentence, cached by text + voice + model. Scene duration = max(planned, VO + padding). Music only if the user gives a file or asks.

## 8 · Preview — approval

- Low-res (540p) full cut with VO and captions. Ask for OK or a list of scene fixes.

## 9 · Render

- Estimate again (only changed scenes count). Render scenes whose hash changed, normalise, concat with stream copy, mix audio, loudnorm −14 LUFS, captions.

## 10 · Publish

- Extra aspect ratios from `studio.json → format.exports`, thumbnail, manifest of what was delivered. Tell the user the output paths.

---

## Changing things after approval

| User wants | Do | Re-opens |
|---|---|---|
| Change a sentence | edit `script.md` + matching `storyboard.json` line | script, storyboard, estimate; only that scene's audio + clip rebuild |
| Add / remove a scene | edit script + storyboard (new id, never reuse an old id) | script, storyboard, estimate; only the new scene builds |
| Change brand | edit `brand.json`, bump `version` | every scene's hash → say how many scenes re-render, ask first |
| Change aspect ratio | add to `format.exports` (publish) rather than changing `format.aspect` | publish only |
