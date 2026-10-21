# Engine selection

## Decision

```
scene.type == 3d                → Remotion + @remotion/three (R3F, Drei, Rapier, Postprocessing)
scene.type == character         → lemo-opuscar page rendered to a clip
scene.type == explainer         → anatomy static SVG, animated in HyperFrames with GSAP
everything else                 → HyperFrames (HTML/CSS + GSAP)
studio.engine.default == remotion (whole-3D project) → 2D scenes also in Remotion
scene.engine set                → that engine (override)
```

Why: HyperFrames is HTML/GSAP, which Claude writes reliably with few tokens and fast renders. Remotion is heavier (React project + bundler) but is the strong option for R3F 3D. Remotion is free for individuals and small companies; if a licence ever matters, fall back to HyperFrames + plain three.js in a `<canvas>`.

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

## Remotion (3D scenes)

- Separate project in `D/remotion/` from `templates/remotion-project/`.
- Stills: `npx remotion still <entry> <comp> review/<id>-<n>.png --frame=<n>`.
- Clip: `npx remotion render <entry> <comp> out/scenes/<id>-<hash>.mp4 --codec=h264`, size and fps from `studio.json`.
- Brand: the same `brand.json` → TS constants; never restate colours by hand.

## lemo-opuscar (character scenes)

- Library: `sh <lemo skill>/scripts/setup.sh` → `LIB=<path>`; `setup.sh deps` (~350 MB) only after the user agrees.
- Read `$LIB/DIRECTOR.md` §3–5 and the ONE chosen `$LIB/styles/<slug>/STYLE.md`. Never list or read all styles; to help choose, read `styles/*/style.json` names only.
- Page contract: `window.DUR`, deterministic `window.render(t)`, `window.READY = true`.
- Clip: `cd "$LIB" && node core/render/video.mjs <scene-dir> --fps <fps> --size <W>x<H> --out <D>/out/scenes/<id>-<hash>.raw.mp4`, picture only (skip lemo's TTS/mix: our audio step owns VO), then normalise to the project preset.
- Stills: `node core/render/still.mjs <scene-dir> 0.5 2 4 --size <W>x<H> --out <D>/review/<id>`.

## anatomy (explainer scenes)

- Build the figure with its kit, export `figureSvg({ standalone: "dark" | "light" })` → `assets/<id>.svg` → SVGO → animate groups in a HyperFrames scene. Its own live motion is real-time, not frame-seekable, so it is never captured directly.
- Size `figure` by default (40–80 parts). `hero` only when the user accepts the time in the estimate.
