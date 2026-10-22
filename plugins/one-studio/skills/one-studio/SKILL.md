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
| 1 | Brief | read `../writers-room/SKILL.md`; fill `brief.md` incl. Story core; record `studio.json → story` | `--approve brief` |
| 2 | Script | writers-room process → `script.md` (two columns, `script-lint.mjs`, read-aloud); bullet = one sentence | **user OK** → `--approve script` |
| 3 | Storyboard | `storyboard.json` (`schemas/storyboard.schema.json`); visual modes from writers-room `visual-modes/` | **user OK** → `--approve storyboard` |
| 4 | Estimate | `status.mjs --estimate`, show the table | **user accepts** → `--approve estimate` |
| 5 | Keyframes | `prepare-project` → `new-scene` → write scenes → `keyframe-stills` → show `review/sheet.jpg` (+ `sheet-<ratio>.jpg` per export); same-world pairs: `seam-check.mjs`, show `review/seams.jpg` | **user OK per scene** → `--approve-scenes <ids>` → `--approve keyframes` |
| 6 | Build | `render-changed-scenes --preview` (only approved, changed scenes) | `--approve build` |
| 7 | Audio | music pick (`make-music --samples` → `audio-picker` → `--use`), SFX cues, `build-audio` (asks before TTS), fits lengths + `data-line` reveals, captions | `--approve audio` |
| 8 | Preview | `render-changed-scenes --preview` + `concat-and-mix --preview` (+ `--ratio 9:16` per export ratio) | **user OK** → `--approve preview` |
| 9 | Render | `--estimate`, `render-changed-scenes`, `concat-and-mix` | `--approve render` |
| 10 | Publish | `publish [--thumb-frame s02@3.5]` (extra ratios, thumbnails, manifest) | `--approve publish` |

Gate 0 asks, in ONE message, only what is missing (defaults in brackets):
- new video or episode of a series? (existing series → brand, voice, format, intro/outro reused: ask nothing about them)
- where will it be posted? (infer from "Shorts", "TikTok", "Reels": those are 9:16 → suggest `--exports 9:16`, pass `--platform`) · 2D, 3D or mixed? [2D] · aspect ratio(s) and length? [16:9, 30–60 s]
- voice-over language? [the user's] — `vi` → ZeroTTS, others → OmniVoice (local, OpenAI-compatible); confirm base URL once; the voice is picked by ear (samples + `audio-picker`), never left at `default`
- brand colours/fonts/logo, a preset (`apple-light`, `apple-keynote`, `neon-terminal`, `synthwave`, `ocean-calm`, `warm-editorial`, `swiss-mono`, `infinity-board`, plus any saved from an earlier style: `init-project.mjs --help` lists every name), **or the style of an existing video/link** ("lấy style từ video/link" → load `../style-extract/SKILL.md`, it fills `brand.json` and `studio.json → story.style`), or defaults? · allowed paid/remote services? [none]
- captions? none · .srt only · soft track · burned in [burn; mux when FFmpeg has no libass]

Then `node "$S/scripts/init-project.mjs" <dir> --title "…" --lang vi --dimension 2d --aspect 16:9 --duration 45 [--exports 16:9,9:16] [--platform shorts] [--preset …] [--captions …] [--tts-url … --probe-tts] [--series <name>]`, write remaining answers into `brand.json` and `studio.json → audio.tts`. Exact wording: `references/workflow-gates.md`.

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
| screen | HyperFrames + recorded flow | `scene-types/screen.md` | Chrome + FFmpeg; user consent (`services.capture`) |
| 3d | three.js in HyperFrames; Remotion if `three.physics`/`three.postfx` | `scene-types/3d.md` | remotion (only for physics/post-fx) |

A scene's `mode` (storyboard) means `../writers-room/visual-modes/<mode>.md`: read it before writing that scene. Scenes of one `world` use `worlds/<id>.html` with `S.camera` / `S.state` / `S.lines`.

Engines and traps: `references/engine-selection.md`. Rendering, cache, brand changes: `references/render-ffmpeg.md`. Audio (voices, music beds, SFX cues, captions, howler.js vs FFmpeg): `references/audio-tts.md`. Series & publishing: `references/series-publish.md`.

## Credit discipline

- Show `status.mjs --estimate` before gates 5, 6 and 9 (tokens only for scenes to write/fix; render time only for scenes without a clip). Stop and ask on ⚠.
- One scene = one file = one clip. Editing a scene re-reads only that scene's reference and re-renders only that scene.
- Look at contact sheets yourself before showing them; fix obvious faults first.
- Never call TTS, download or install anything without consent (`studio.json → services`). Music beds and SFX are synthesised locally (no consent needed); voice samples are TTS calls (ask). Keep chat output to tables and paths.
- Screen capture (`capture-screen.mjs`) only after the user gives the URL and consent (`services.capture`); never type passwords, use only a storage state the user supplies. News research via web search only when the user asks and `services.web: true`.

## Consistency

- Scenes use brand variables and `os-*` classes only; `prepare-project.mjs` regenerates `assets/brand.css` from `brand.json` (incl. the glass surface: never add per-scene `<link>`s for it).
- Ratio-specific CSS goes in `<style data-ratio="9:16">` blocks, never in the main styles, so the main ratio keeps its approval and clips.
- The delivered sound is FFmpeg's mix only (`concat-and-mix`); howler.js is for the picker page and studio preview.
- All clips are normalised to one encode; clips from lemo/Remotion are re-encoded to match before the stream-copy concat.
- Brand change: bump `version`, run `prepare-project` and `render-changed-scenes --dry-run`, tell the user how many scenes need review/render, ask first.

## Files in a project

`brief.md` · `research.md` (news/fact videos) · `script.md` · `storyboard.json` · `studio.json` (state) · `brand/` or `../series/<name>/brand/` · `assets/` (`music/`, `sfx/`, `audio-cues.js`) · `scenes/<id>.html` (or `scenes/<id>/` for lemo, `remotion/` for R3F) · `audio/` · `flows/<id>.json` + `capture/<id>/` (screen scenes) · `captions.srt` · `review/sheet*.jpg`, `review/audio-picker.html`, `review/voices/`, `review/music/`, `review/presets.jpg` · `out/scenes/<id>-<hash>.mp4` · `out/<name>.mp4` · `out/manifest.json`

Check any time: `node "$S/scripts/validate.mjs" <dir>`, `node "$S/scripts/check-external.mjs" <dir>` (also reports missing libass / drawtext; both have fallbacks).
