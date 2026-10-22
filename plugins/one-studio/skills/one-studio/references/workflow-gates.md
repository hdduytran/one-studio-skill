# Workflow gates

`status.mjs <dir>` is the source of truth. Each gate below lists what goes in, what comes out, the question you ask, and how it closes. `S` = skill base dir, `D` = project dir.

Marks printed by status: `✓` done · `→` current · `!` input changed after approval (re-approve) · `·` not reached.

---

## 0 · Setup

- **In:** the user's request.
- **Ask (one message, only missing items):** new video or series episode · 2D/3D/mixed · aspect + length (+ other ratios to publish) · VO language · look (brand colours/fonts/logo, a preset, or defaults) · **captions** · allowed services. Vietnamese example:
  > Mình cần vài thông tin trước khi bắt đầu:
  > 1. Video mới hay tập tiếp theo của series nào?
  > 2. 2D, 3D hay kết hợp? Tỉ lệ khung (16:9, 9:16, 1:1) và độ dài? Có cần xuất thêm tỉ lệ khác không?
  > 3. Giọng đọc tiếng Việt qua ZeroTTS ở `http://localhost:8000` đúng không?
  > 4. Màu/phông/logo riêng, hay chọn một mẫu: `apple-light`, `apple-keynote`, `neon-terminal`, `synthwave`, `ocean-calm`, `warm-editorial`, `swiss-mono`, `infinity-board`, `default`? (mình có thể dựng bảng so sánh)
  > 5. Phụ đề: **không** · **chỉ file .srt** · **phụ đề mềm** (bật/tắt được, kèm .srt) · **in cứng vào hình**?
  > 6. Được dùng dịch vụ trả phí / từ xa nào không? (mặc định: không)
- **Do:** `node "$S/scripts/init-project.mjs" D --title "…" --lang <code> --dimension <2d|3d|mixed> --aspect <ratio> --duration <s> [--exports 16:9,9:16] [--preset <name>] [--captions none|sidecar|mux|burn] [--tts-url <url>] [--probe-tts] [--series <name>] [--series-root <dir>]`.
  - With `--series`, brand lives at `<series-root>/<name>/brand/brand.json` (default series root `D/../series`). If it exists it is reused: **do not ask brand questions**; the captions answer then goes to `studio.json → captions`.
  - Unsure about the look → after scenes exist, `compare-presets.mjs D` renders the same scenes in every preset (`review/presets.jpg`); `--apply <preset>` sets it. Presets `apple-light` and `synthwave` use the glass surface (`brand.json → surface: "glass"`).
  - Write the user's brand answers into `brand.json` (keep `version: 1` for a new kit).
  - Captions answer → `--captions` (mapping in `references/audio-tts.md`). Init warns when FFmpeg has no libass: `burn` becomes `mux`; tell the user.
  - Voice: `--probe-tts` lists the server's voices (no synthesis). The init placeholder `default` is not a real voice: offer samples (`tts-openai-compatible.mjs D --samples all --allow-tts` after a yes) and `audio-picker.mjs D`, then `--use-voice <id>`. Set `services.tts: true` once the user agrees to calls. Keys stay in env (`ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY`).
- **Close:** init marks setup done.

## 1 · Brief

- **In:** the answers so far.
- **Ask:** at most 3 questions (goal, audience, CTA) if not already clear; never re-ask gate 0 items. Then at most 3 Story core questions the user has not answered and you cannot invent: the angle, a real person or the common misconception, the point of view. Example: "Video này nói điều gì mà video khác chưa nói? Có người thật hay hiểu lầm phổ biến nào làm điểm xuất phát? Bạn muốn đứng ở góc nhìn nào?"
- **Do:** read `../writers-room/SKILL.md` (router), pick the playbook (and format/tone), fill `D/brief.md` including the Story core, remove every `<!-- TODO … -->`, record `studio.json → story`.
- **News/facts:** also ask "Có muốn mình research thêm không? (cần tìm kiếm web)"; set `services.web: true` only after yes, then research runs in a subagent that returns `research.md` only (see `../writers-room/craft/research-and-info-doc.md`).
- **Close:** `node "$S/scripts/status.mjs" D --approve brief` (refuses while TODOs remain). No explicit user OK required; mention the brief in one line.

## 2 · Script — approval

- **Do:** follow the writers-room process (research → angle → beat outline → visual abstract), then write `D/script.md` as two columns:
  - `## s01 · Title` per scene, ids `s01, s02…` in order; `> visual:`, `> camera:`, `> sfx:`, `> silence: 1.5s`, `> source: <id>` lines optional.
  - Each `- ` bullet = one spoken sentence (≤ 20 words) = one TTS call = one caption cue.
  - Hook in the first 3 s; one idea per scene; the total speaking time fits the target length (vi ≈ 2.8 words/s, en ≈ 2.5 words/s).
  - Run `script-lint.mjs D`, fix what it prints, do a read-aloud pass, cut about 20%.
- **Ask:** show the script, total word count and estimated seconds: "Bạn duyệt kịch bản này chứ? Muốn sửa câu nào?"
- **Close:** after the user's OK → `--approve script`.

## 3 · Storyboard — approval

- **Do:** write `D/storyboard.json` from the approved script (`schemas/storyboard.schema.json`):
  - one scene per script heading, same id; `lines[]` = the bullets (`id` = `<scene>-<n>`; `say` when numbers must be spelled out for TTS while `text` keeps digits);
  - visual modes come from `story.modes` (writers-room `visual-modes/`, at most 3 loaded);
  - `type` per scene: `text | diagram | data | lottie | rive | explainer | character | screen | 3d`. Prefer cheap types; use `explainer`, `character`, `screen`, `3d` only when the idea needs them;
  - `duration` ≥ spoken time + 0.5 s; `transition` from brand defaults unless the story needs another;
  - world scenes: declare root `worlds` (`file`, `size`) and per scene `world`, `camera {from,to,move}`, `exit_state`; consecutive scenes of one world must chain (`camera.to` = next `camera.from`), the validator checks it and `new-scene` makes their transitions `cut`;
  - `character.style` = a lemo-opuscar style slug; `explainer.size` = `figure` unless the user asked for more.
- **Ask:** show a table `id · type · duration · visual · lines`, the total length, and which scene types are expensive.
- **Close:** after OK → `--approve storyboard` (validates the schema + cross-checks, syncs `studio.json → scenes`).

## 4 · Credit estimate — acknowledgement

- **Do:** `node "$S/scripts/status.mjs" D --estimate` and paste the table as printed.
- **Ask:** "Ước tính như trên. Tiếp tục dựng keyframe chứ?" If ⚠ lines appear, offer the cheaper option (fewer scenes, 2D instead of 3D, figure instead of hero).
- **Close:** after OK → `--approve estimate`. Editing the storyboard later re-opens gates 3 and 4.

## 5 · Keyframe review — approval per scene

- **Do:** `prepare-project.mjs D` (runtime, fonts, brand CSS, vendored libs, preview SFX cues) → `new-scene.mjs D --all` (templates per type; lemo scenes get a folder; Remotion scenes: `new-remotion.mjs D`) → write each scene (read its type reference first) → `keyframe-stills.mjs D` (only changed/unapproved scenes) → look at `review/sheet.jpg` yourself, fix, re-run for those ids.
  - Other ratios in `format.exports` are captured too (one middle frame per scene → `review/sheet-<ratio>.jpg`). Fix portrait/square layout now with `<style data-ratio="9:16">` blocks: they are hashed for that ratio only, so the main-ratio approval and clips stay valid. These sheets are for review; approval follows the main ratio.
  - Same-world and `handoff` pairs also get `review/seams.jpg` (last frame of A beside first of B, with the pixel difference). Same-world seams above 2% are warnings here: fix the camera/state so the scenes meet, then re-run `seam-check.mjs D [--pairs s01:s02] [--threshold 0.02]` (exit 1 on a bad seam). Handoff differences are for the eye.
  - Without FFmpeg drawtext the sheets have no labels: rows/tiles are in storyboard order; say so when you show them.
- **Ask:** show the sheet path(s) (and the images if the client can display them), list scenes you are unsure about: "Bạn duyệt các scene này chứ? Scene nào cần sửa? (bản dọc 9:16 ở `review/sheet-9x16.jpg`)"
- **Close:** `status.mjs D --approve-scenes s01,s02` for the approved ones (or `all`), then `--approve keyframes` once every scene is approved. A later edit to a scene clears only its approval.

## 6 · Build

- `render-changed-scenes.mjs D --preview`: renders low-res clips for approved scenes whose hash changed; unchanged scenes are cached; unapproved scenes are blocked (exit 2).
- **Close:** `--approve build` (checks every scene has a current preview clip).

## 7 · Audio

- **Music** (when `studio.json → audio.music` is `null`): `make-music.mjs D --samples` → `audio-picker.mjs D` → show `review/audio-picker.html` (and the `review/music/*.m4a` paths). Ask: "Bạn chọn nhạc nền nào: ambient, ambient-bright, lofi, lofi-dark, file của bạn, hay không nhạc?" → `make-music.mjs D --use <bed|path|none>`.
- **Captions** (re-ask only if the user wants to change the gate 0 answer): "Giữ phụ đề <mode> chứ?" → `status.mjs D --captions <mode>`.
- **SFX** (optional): add `scenes[].sfx[]` cues to the storyboard (`references/audio-tts.md`); the picker page lists the built-in kit.
- `build-audio.mjs D --dry-run` → number of TTS calls. If `services.tts` is not true, ask once; then `build-audio.mjs D --allow-tts`.
- It fits scene lengths to the VO and writes `data-line` reveal timings into scenes that use them (approvals kept, gates 5–6 stay ✓), writes `audio/vo.wav`, `captions.srt` (unless captions are `none`), `audio/manifest.json`. Scenes it changed re-render at gate 8 (`render-changed-scenes --preview`).
- **Close:** `--approve audio` (refuses while music is undecided or the audio is stale).

## 8 · Preview — approval

- `render-changed-scenes.mjs D --preview` then `concat-and-mix.mjs D --preview` → `out/<name>-preview.mp4` (540p, VO, music, captions, −14 LUFS).
- **Ask:** send the path; collect scene-level fixes. Fixes → back to gate 5 for those scenes only.
- **Close:** after OK → `--approve preview`.

## 9 · Render

- `status.mjs D --estimate` (render time), `render-changed-scenes.mjs D` (final clips; same approvals), `concat-and-mix.mjs D` → `out/<name>.mp4` + `.srt`. Check the printed duration, size and LUFS.
- **Close:** `--approve render`.

## 10 · Publish

- `publish.mjs D [--thumb-frame <scene>@<s>] [--thumb-title "…"]` → extra ratios from `format.exports`, thumbnails, `out/manifest.json` (see `references/series-publish.md`). Look at each `out/<ratio>/sheet.jpg`. Offer a frame thumbnail: "Ảnh bìa lấy khung hình nào? (vd. s02 giây 3.5)".
- **Close:** `--approve publish`, tell the user the output paths. For a series, offer `series-bumper.mjs` if the intro/outro should be reused.

---

## Changing things after approval

| User wants | Do | Re-opens |
|---|---|---|
| Change a sentence | edit `script.md` + matching `storyboard.json` line | script, storyboard, estimate; only that scene's audio + clip rebuild |
| Add / remove a scene | edit script + storyboard (new id, never reuse an old id) | script, storyboard, estimate; only the new scene builds |
| Change brand | edit `brand.json`, bump `version` | every scene's hash → say how many scenes re-render, ask first |
| Change aspect ratio | add to `format.exports` (publish) rather than changing `format.aspect` | publish only |
| Fix a scene in one export ratio | `<style data-ratio="9:16">` block in that scene, `keyframe-stills.mjs D <id> --ratios 9:16` | that ratio's clip only (main approval and clip kept) |
| Change captions | `status.mjs D --captions <mode>`, `build-audio.mjs` | audio, preview, render, publish |
| Change music / SFX | `make-music.mjs D --use …` / edit `scenes[].sfx[]` | audio (+ storyboard for cues), preview, render, publish — no scene re-renders |
| Change the voice | `tts-openai-compatible.mjs D --use-voice <id>` | audio (every sentence re-synthesised: ask first) |
| Change the look to a preset | `compare-presets.mjs D`, then `--apply <preset>` | brand version → every scene (ask first) |
