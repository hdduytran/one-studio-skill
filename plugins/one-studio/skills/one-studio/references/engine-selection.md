# Engine selection

## Decision

```
scene.engine set                         → that engine (override)
scene.type == 3d + three.physics/postfx  → Remotion + @remotion/three (R3F, Drei, Rapier, Postprocessing)
scene.type == 3d                         → three.js inside HyperFrames (driven by S.drive)
scene.type == character                  → lemo-opuscar page rendered to its own clip
scene.type == explainer                  → anatomy static SVG, animated in HyperFrames with GSAP
everything else                          → HyperFrames (HTML/CSS + GSAP)
```

Why: HyperFrames is HTML/GSAP, which Claude writes reliably with few tokens and fast renders, and it seeks canvas / WebGL / Lottie deterministically through the scene timeline (verified). Remotion is heavier (React project + ~300 MB install) and is used only when R3F physics or post-processing is worth it. Remotion is free for individuals and companies up to 3 people.

Optional tools that overlap (use only when asked): Motion Canvas, Anime.js (GSAP covers it), Howler.js (studio preview only).

## HyperFrames (pinned `hyperframes@0.8.181`)

Run with `npx --yes hyperframes@0.8.181 <cmd>`.

| Need | Command |
|---|---|
| check machine | `doctor` |
| Chrome for render | `browser ensure`, or set `HYPERFRAMES_BROWSER_PATH=<headless_shell>` |
| lint one project | `lint <project> --json` |
| render one scene | `render <project> -c scenes/<id>.html -o out/scenes/<id>-<hash>.mp4 --quality draft\|looks\|delivery` |
| stills | `snapshot <dir-with-index.html> --at 0.3,1.5,2.8 --no-end -o review/<id>` → PNGs + `contact-sheet.jpg` |
| studio | `preview --background`, `preview --status`, `preview --stop` |

Composition contract: root `<div data-composition-id="<id>" data-start="0" data-duration="<s>" data-width data-height>`; timed elements carry `class="clip" data-start data-duration data-track-index`; one paused GSAP timeline registered as `window.__timelines["<id>"]`.

Traps (verified):
- **GSAP from a CDN blocks the render** (`sub_timeline_script_failure`) when the render browser has no network. Always load `assets/vendor/gsap.min.js` (copied from the `gsap` npm package). Same for fonts: bundle files, never fetch them.
- `snapshot` accepts only a project directory and renders its `index.html`. For per-scene stills, stage a temp folder with the scene as `index.html` and `assets/` linked.
- Output: H.264, yuv420p, fps from `data-fps` or `--fps` (default 30), **no audio track**. Audio is mixed by our FFmpeg step.
- Do not use HyperFrames' own `tts` / `transcribe` (Kokoro / Whisper): this project uses ZeroTTS / OmniVoice and timings from audio durations.

## Remotion (3D scenes with physics / post-fx)

- `new-remotion.mjs D` → `D/remotion/` (pinned versions), `src/brand.generated.ts` from `brand.json`, one composition per scene id; the duration is a prop, so VO fitting needs no code change.
- Stills and clips go through `keyframe-stills.mjs` / `render-changed-scenes.mjs` (`npx remotion still|render src/index.ts <id> … --gl=swangle|angle`).

## lemo-opuscar (character scenes)

- Library: `sh <lemo skill>/scripts/setup.sh` → `LIB=<path>`; `setup.sh deps` (~350 MB) only after the user agrees.
- Read `$LIB/DIRECTOR.md` §3–5 and the ONE chosen `$LIB/styles/<slug>/STYLE.md`. Never list or read all styles; to help choose, read `styles/*/style.json` names only.
- Page contract: `window.DUR`, deterministic `window.render(t)`, `window.READY = true`.
- Stills and clips go through `keyframe-stills.mjs` / `render-changed-scenes.mjs` (they call `core/render/still.mjs` / `video.mjs` with the project fps and size), picture only, normalised to the project preset.

## anatomy (explainer scenes)

- Build the figure with its kit, export `figureSvg({ standalone: "dark" | "light" })` → `assets/<id>.svg` → SVGO → animate groups in a HyperFrames scene. Its own live motion is real-time, not frame-seekable, so it is never captured directly.
- Size `figure` by default (40–80 parts). `hero` only when the user accepts the time in the estimate.
