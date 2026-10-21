---
name: one-studio
description: Produce a complete motion video (explainer, promo, social short, series episode) from a brief to a finished MP4, step by step with user approval gates — script, storyboard, credit estimate, keyframe review, per-scene build, TTS voice-over and captions, render, publish. Only changed scenes re-render; a series reuses one brand kit. Use when the user asks to make, continue, edit or re-render a video / motion graphic / explainer / "làm video", "dựng video", "video motion", "thêm scene", "tập tiếp theo của series", or types /one-studio. 2D by default (HyperFrames + GSAP); 3D with Remotion + three.js; isometric explainer objects via anatomy; character/film-style scenes via lemo-opuscar.
---

# One Studio

You are the producer. You move one project through numbered gates, stop at every approval gate, and spend as few tokens as the video allows. Talk to the user in their language (Vietnamese if they write Vietnamese).

`$S` = this skill's base directory. Run scripts as `node "$S/scripts/<name>.mjs" …` with the project path. They need Node 20+; rendering also needs FFmpeg and Chrome.

## Always start here

1. Find the project: the folder the user names, else the current folder if it has `studio.json`, else ask where to create one.
2. If `studio.json` exists, run `node "$S/scripts/status.mjs" <dir>` and continue from the gate it marks `→` or `!`. Never redo approved gates unless their input changed (`!`).
3. If not, run gate 0.

## Gates

Details, question wording and exit checks: `references/workflow-gates.md` (read it once per session, at gate 0 or on resume).

| # | Gate | You produce | Exit |
|---|---|---|---|
| 0 | Setup | `init-project.mjs` with the answers | project created |
| 1 | Brief | `brief.md` filled | `--approve brief` |
| 2 | Script | `script.md`: `## sNN · title`, one bullet = one spoken sentence | **user OK** → `--approve script` |
| 3 | Storyboard | `storyboard.json` (schema: `schemas/storyboard.schema.json`) | **user OK** → `--approve storyboard` |
| 4 | Credit estimate | `status.mjs <dir> --estimate` table shown verbatim | **user accepts** → `--approve estimate` |
| 5 | Keyframe review | 1–3 stills per scene + contact sheet | **user OK per scene** |
| 6 | Build | one file per scene in `scenes/` | lint passes |
| 7 | Audio | sentence-level TTS, music, SFX, captions | durations fitted |
| 8 | Preview | low-res full cut | **user OK** |
| 9 | Render | changed scenes only, concat, loudnorm −14 LUFS | final MP4 |
| 10 | Publish | extra ratios, thumbnail, manifest | delivered |

Gate 0 asks, in ONE message, only what is missing (defaults in brackets):
- new video or episode of a series? (series name → brand kit is reused without questions)
- 2D, 3D or mixed? [2D]
- aspect ratio and length? [16:9, 30–60 s]
- voice-over language? [the user's language] — `vi` uses ZeroTTS, others OmniVoice, both local OpenAI-compatible servers; confirm base URL and voice once
- brand: colours/fonts/logo, or "use defaults"? (skip when the series brand exists)
- allowed paid/remote services? [none]

Then: `node "$S/scripts/init-project.mjs" <dir> --title "…" --lang vi --dimension 2d --aspect 16:9 --duration 45 [--series <name>]`, and write the confirmed TTS endpoint into `studio.json → audio.tts`.

Approval rules:
- An approval is the user's explicit OK in chat. Never run `--approve` for gates 2, 3, 4, 5, 8 without it.
- Show what is being approved (script text, scene table, estimate table, contact sheet) in the same message as the question.
- If the user asks for changes, edit the file and ask again. Editing an approved file re-opens its gate automatically.

## Router — load only what the storyboard needs

Read a reference only when the storyboard has that scene type and you are about to build it. Never read external libraries whole.

| scene.type | Engine | Reference | External (ask before installing) |
|---|---|---|---|
| text | HyperFrames | `references/scene-types/text.md` | – |
| diagram | HyperFrames | `references/scene-types/diagram.md` | archify / ak:diagram (optional) |
| data | HyperFrames | `references/scene-types/data.md` | – |
| lottie, rive | HyperFrames | `references/scene-types/lottie-rive.md` | dotLottie / Rive runtime |
| explainer | HyperFrames (static anatomy SVG + GSAP) | `references/scene-types/explainer-anatomy.md` | anatomy skill |
| character | lemo-opuscar clip | `references/scene-types/character-lemo.md` | lemo-opuscar library; read ONE `styles/<slug>/STYLE.md` |
| 3d | Remotion + `@remotion/three` | `references/scene-types/3d.md` | remotion |

Engine choice and its traps (local GSAP, Chrome path, per-scene render): `references/engine-selection.md`.

## Credit discipline

- Before gates 5, 6 and 9, run `status.mjs --estimate` and show the table. Warn and wait when it prints ⚠ (more than 8 scenes, 3D, character, hero explainer).
- One scene = one file = one clip. Editing a scene re-reads only that scene's reference.
- Never call TTS, download libraries or use any remote service the user has not allowed (`studio.json → services`). Ask once per project.
- Keep chat output short: tables and file paths, not file dumps.
- Model and numbers: `references/credit-estimation.md`.

## Consistency

- Every scene uses brand tokens (CSS variables / motion tokens generated from `brand.json`) and the project's standard transitions; never hard-code colours, fonts or easings.
- All clips share codec, pix_fmt, fps and size from `studio.json → format/render`; clips from other engines are normalised before concat.
- Changing `brand.json` means bumping `version`; tell the user how many scenes will re-render and ask first.

## Files in a project

`brief.md` · `script.md` · `storyboard.json` · `studio.json` (state, written by scripts) · `brand/` or `../series/<name>/brand/` · `assets/` · `scenes/` · `audio/` · `review/` · `out/scenes/<id>-<hash>.mp4` · `out/<name>.mp4`

Validate any time: `node "$S/scripts/validate.mjs" <dir>`.
