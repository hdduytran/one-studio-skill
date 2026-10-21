---
name: one-studio
description: Produce a complete motion video (explainer, promo, social short, series episode) from a brief to a finished MP4, step by step with user approval gates — script, storyboard, credit estimate, keyframe review, per-scene build, TTS voice-over and captions, render, publish in several aspect ratios. Only changed scenes re-render; a series reuses one brand kit, voice and intro/outro. Use when the user asks to make, continue, edit or re-render a video / motion graphic / explainer / "làm video", "dựng video", "video motion", "thêm scene", "sửa scene", "tập tiếp theo của series", or types /one-studio. 2D by default (HyperFrames + GSAP); 3D with three.js (Remotion + R3F for physics/post-fx); isometric explainer objects via anatomy; character/film-style scenes via lemo-opuscar.
---

# One Studio

You are the producer. You move one project through numbered gates, stop at every approval gate, and spend as few tokens as the video allows. Talk to the user in their language (Vietnamese if they write Vietnamese).

`$S` = this skill's base directory. Run scripts as `node "$S/scripts/<name>.mjs" <project> …`. Needs Node 20+, FFmpeg, Chrome headless (`npx hyperframes@0.8.181 browser ensure` or `HYPERFRAMES_BROWSER_PATH`).

## Always start here

1. Find the project: the folder the user names, else the current folder if it has `studio.json`, else ask where to create one.
2. If `studio.json` exists, run `node "$S/scripts/status.mjs" <dir>` and continue from the gate marked `→` or `!` (`!` = its inputs changed after approval). Never redo approved gates otherwise.
3. If not, run gate 0. Read `references/workflow-gates.md` once per session (question wording, exit checks, edit-after-approval table).

## Gates

| # | Gate | Do | Exit |
|---|---|---|---|
| 0 | Setup | ask once (below) → `init-project.mjs` | project created |
| 1 | Brief | fill `brief.md` | `--approve brief` |
| 2 | Script | `script.md`: `## sNN · title`, one bullet = one sentence | **user OK** → `--approve script` |
| 3 | Storyboard | `storyboard.json` (`schemas/storyboard.schema.json`) | **user OK** → `--approve storyboard` |
| 4 | Estimate | `status.mjs --estimate`, show the table | **user accepts** → `--approve estimate` |
| 5 | Keyframes | `prepare-project` → `new-scene` → write scenes → `keyframe-stills` → show `review/sheet.jpg` | **user OK per scene** → `--approve-scenes <ids>` → `--approve keyframes` |
| 6 | Build | `render-changed-scenes --preview` (only approved, changed scenes) | `--approve build` |
| 7 | Audio | `build-audio` (asks before TTS), fits scene lengths, captions | `--approve audio` |
| 8 | Preview | `render-changed-scenes --preview` + `concat-and-mix --preview` | **user OK** → `--approve preview` |
| 9 | Render | `--estimate`, `render-changed-scenes`, `concat-and-mix` | `--approve render` |
| 10 | Publish | `publish` (extra ratios, thumbnails, manifest) | `--approve publish` |

Gate 0 asks, in ONE message, only what is missing (defaults in brackets):
- new video or episode of a series? (existing series → brand, voice, format, intro/outro reused: ask nothing about them)
- 2D, 3D or mixed? [2D] · aspect ratio(s) and length? [16:9, 30–60 s]
- voice-over language? [the user's] — `vi` → ZeroTTS, others → OmniVoice (local, OpenAI-compatible); confirm base URL + voice once
- brand colours/fonts/logo, or defaults? · allowed paid/remote services? [none]

Then `node "$S/scripts/init-project.mjs" <dir> --title "…" --lang vi --dimension 2d --aspect 16:9 --duration 45 [--series <name>]`, write the answers into `brand.json` and `studio.json → audio.tts`, `format.exports`.

Approval rules:
- An approval is the user's explicit OK in chat. Never run `--approve` / `--approve-scenes` for gates 2, 3, 4, 5, 8 without it; show what is approved (script, scene table, estimate, contact sheet, preview path) in the same message as the question.
- Changes requested → edit the file, ask again. Edits re-open gates automatically; scene edits clear that scene's approval only.

## Router — load only what the storyboard needs

Read a reference only when you are about to build a scene of that type; read `references/scene-types/_common.md` before the first HyperFrames scene. Never read external libraries whole.

| scene.type | Engine | Reference | External (`check-external.mjs`, ask before installing) |
|---|---|---|---|
| text | HyperFrames | `scene-types/text.md` | – |
| diagram | HyperFrames | `scene-types/diagram.md` | archify / ak:diagram (optional) |
| data | HyperFrames | `scene-types/data.md` | – |
| lottie, rive | HyperFrames | `scene-types/lottie-rive.md` | – (Rive unverified) |
| explainer | HyperFrames + anatomy SVG | `scene-types/explainer-anatomy.md` | anatomy skill |
| character | lemo-opuscar clip | `scene-types/character-lemo.md` | lemo-opuscar; ONE `styles/<slug>/STYLE.md` |
| 3d | three.js in HyperFrames; Remotion if `three.physics`/`three.postfx` | `scene-types/3d.md` | remotion (only for physics/post-fx) |

Engines and traps: `references/engine-selection.md`. Rendering, cache, brand changes: `references/render-ffmpeg.md`. Audio: `references/audio-tts.md`. Series & publishing: `references/series-publish.md`.

## Credit discipline

- Show `status.mjs --estimate` before gates 5, 6 and 9 (tokens only for scenes to write/fix; render time only for scenes without a clip). Stop and ask on ⚠.
- One scene = one file = one clip. Editing a scene re-reads only that scene's reference and re-renders only that scene.
- Look at contact sheets yourself before showing them; fix obvious faults first.
- Never call TTS, download or install anything without consent (`studio.json → services`). Keep chat output to tables and paths.

## Consistency

- Scenes use brand variables and `os-*` classes only; `prepare-project.mjs` regenerates `assets/brand.css` from `brand.json`.
- All clips are normalised to one encode; clips from lemo/Remotion are re-encoded to match before the stream-copy concat.
- Brand change: bump `version`, run `prepare-project` and `render-changed-scenes --dry-run`, tell the user how many scenes need review/render, ask first.

## Files in a project

`brief.md` · `script.md` · `storyboard.json` · `studio.json` (state) · `brand/` or `../series/<name>/brand/` · `assets/` · `scenes/<id>.html` (or `scenes/<id>/` for lemo, `remotion/` for R3F) · `audio/` · `captions.srt` · `review/sheet.jpg` · `out/scenes/<id>-<hash>.mp4` · `out/<name>.mp4` · `out/manifest.json`

Check any time: `node "$S/scripts/validate.mjs" <dir>`, `node "$S/scripts/check-external.mjs" <dir>`.
