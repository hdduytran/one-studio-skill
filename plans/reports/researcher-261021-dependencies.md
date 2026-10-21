# Research report — one-studio dependencies (phase 1)

Date: 2026-10-21 · Verified in a Linux cloud container (Node 22, FFmpeg 6.1, Chromium headless shell 1194).

Legend: ✅ verified by running · 📖 read from source/docs · ⏳ pending (needs the user's machine)

---

## 1. HyperFrames (default 2D engine)

- Package: `hyperframes` on npm, v0.8.181 (repo `heygen-com/hyperframes`, `packages/cli`). Run via `npx hyperframes@0.8.181 …` — pin the exact version so old projects re-render identically. 📖
- Needs Chrome Headless Shell. `npx hyperframes browser ensure` downloads it; or point to an existing binary with `HYPERFRAMES_BROWSER_PATH=/path/to/headless_shell` (also `PUPPETEER_EXECUTABLE_PATH`). ✅
- `npx hyperframes doctor` checks FFmpeg, FFprobe, Chrome, /dev/shm. ✅

### Composition contract 📖✅

`hyperframes init <name> --example blank --non-interactive [--resolution landscape|portrait|square]` writes `index.html`, `hyperframes.json`, `meta.json`, `package.json`, `CLAUDE.md`. Set `HYPERFRAMES_SKIP_SKILLS=1` to skip the skills check.

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="10"
     data-width="1920" data-height="1080">
  <h1 class="clip" data-start="0" data-duration="10" data-track-index="0">Title</h1>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  window.__timelines["main"] = tl;   // key = data-composition-id
</script>
```

### Commands we use

| Need | Command | Status |
|---|---|---|
| Render one scene | `npx hyperframes render <project> -c scenes/<id>.html -o out/scenes/<id>-<hash>.mp4 --quality draft\|looks\|delivery [--fps 30] [--resolution …]` | ✅ 2 s clip in ~5 s |
| Render whole project | `npx hyperframes render <project> -o out.mp4` | ✅ |
| Keyframe stills | `npx hyperframes snapshot <projectDir> --at 0.3,1.5,2.8 --no-end -o review/<id>` → `frame-NN-at-Xs.png` + `contact-sheet.jpg` | ✅ |
| Lint / full gate | `npx hyperframes lint --json`, `npx hyperframes check` | 📖 |
| Keyframe diagnostics | `npx hyperframes keyframes <target> --json` / `--shot out.png` | 📖 |
| Studio preview | `npx hyperframes preview --background` / `--status` / `--stop` | 📖 |
| Batch variants (series) | `render --variables-file vars.json` / `--batch rows.json` | 📖 |

Output measured: `h264, yuv420p, 1920x1080, 30/1 fps`, **no audio stream** (audio is mixed later by our FFmpeg step). ✅

### Findings that change the plan

1. **Load GSAP locally, not from a CDN.** The headless render blocked with `sub_timeline_script_failure` when GSAP came from `cdn.jsdelivr.net` (no network in the render browser). With `assets/vendor/gsap.min.js` it rendered. → Phase 3 template ships GSAP in `assets/vendor/` (copied from the `gsap` npm package at init). Also better for deterministic, offline renders. ✅
2. **`snapshot` only takes a project directory** (renders its `index.html`); `--composition <id>` only matches compositions mounted in `index.html`, and a `.html` file path is refused. → Phase 4 `keyframe-stills.mjs` builds a temporary review folder per scene (scene copied as `index.html`, `assets/` symlinked) and calls `snapshot --at … --no-end`. ✅
3. `render -c <file>` renders a standalone scene file directly → per-scene clips work without a stitched index. ✅
4. HyperFrames ships its own `tts` (Kokoro) and `transcribe` (Whisper). We do **not** use them (decision: ZeroTTS/OmniVoice, no Whisper).

## 2. Remotion (3D only)

Not installed in phase 1; contract for phase 6: `npx remotion still <entry> <comp> out.png --frame=N` for keyframes, `npx remotion render <entry> <comp> out.mp4 --codec=h264 --fps 30`, 3D through `@remotion/three` (R3F). Free for individuals and small companies. 📖

## 3. anatomy (explainer scenes) — `wheresryan22/anatomy`, MIT

- Install as a skill: `npx skills add wheresryan22/anatomy -g -a claude-code`, or clone the repo. Needs Node 20.10+ and Chrome. 📖
- A figure is a Node build script (`examples/<name>/build.mjs`) importing `kit/iso-kit.mjs`; it writes a standalone HTML page (`--light` for light theme, `--audit` for the geometry audit). 📖
- **Static SVG export:** `figureSvg({ standalone: "dark" | "light" })` returns a lone `.svg` with styles embedded. 📖
- Screenshots: `node scripts/capture.mjs <file.html|file.svg> --out x.png --width 1920 --height 1080 --scale 1 --select .iso-plate --theme light`; scripted sequences with `scripts/drive.mjs`. 📖
- Figure sizes: Figure (40–80 parts, < 1 h), Hero (2–4 h), Epic (6 h+, never start without approval). 📖
- **Integration decision:** anatomy motion is real-time (springs, idle tours), not frame-seekable. For video we export the **static SVG** (`figureSvg({standalone})`), run SVGO, and animate parts/groups in a HyperFrames scene with GSAP (seekable). Only tell the user "Figure" size by default; Hero needs a warning in the credit estimate.

## 4. lemo-opuscar (character / film-style scenes) — `lemomo-ai/lemo-opuscar`, MIT (films CC BY 4.0)

- 51 styles in `styles/<slug>/` (+ `_template`), each with `STYLE.md`, `DEMO.md`, `style.json` (`slug`, `en`, `category_en`, `uses`, `dur`). 📖
- Method docs: `DIRECTOR.md` (brief → benchmark → treatment → prove the look → sound), `TECHNIQUE.md` (pipeline), `core/README.md` (all flags). 📖
- Setup: `sh plugin/skills/lemo-opuscar/scripts/setup.sh` (clones to `~/lemo-opuscar`, prints `LIB=<path>`), then `setup.sh deps` (~350 MB: npm, headless browser, Python venv). 📖
- **Page contract:** a folder with `index.html` exposing `window.DUR`, `window.render(t)` (deterministic), `window.READY = true`, optional `window.EV`, `window.TEXTS(t)`. Pages load library files with absolute URLs (`/core/lib.js`). 📖
- **Commands (run from `$LIB`, project path absolute):** 📖
  - stills: `node core/render/still.mjs <proj> 1.5 3 6 [--size WxH] [--out dir]` → JPEGs
  - clip: `node core/render/video.mjs <proj> --fps 30 --workers 3 --size 1920x1080 --out <proj>/out/video.mp4`
  - text readability: `node core/render/readcheck.mjs <proj>`
  - mux/master: `sh core/render/mux.sh video.mp4 mix.wav out.mp4 30 0` (two-pass loudnorm −14 LUFS)
- Defaults are 1920×1080 **24 fps** → we always pass `--fps <project fps> --size <WxH>`.
- **Integration decision:** a `character` scene is a lemo page rendered **picture-only** with `video.mjs` into `out/scenes/<id>-<hash>.mp4`; we skip lemo's own TTS/mix (our audio pipeline owns VO). Before concat the clip is re-encoded to the project preset (codec/pix_fmt/fps/size/timebase) because lemo's encoder settings differ. Read only the chosen `styles/<slug>/STYLE.md` + DIRECTOR.md §3–5, never all 51 styles.
- Its plugin layout (`.claude-plugin/marketplace.json` at root → `./plugin` with `.claude-plugin/plugin.json`) is the model for our packaging.

## 5. TTS — ZeroTTS (Vietnamese) and OmniVoice (other languages) ⏳

Both are reached through the OpenAI-compatible endpoint (decision locked):

```http
POST {base_url}/v1/audio/speech
Authorization: Bearer $ONE_STUDIO_TTS_KEY_VI   (or $ONE_STUDIO_TTS_KEY)
Content-Type: application/json

{ "model": "zerotts", "input": "Xin chào.", "voice": "<voice id>", "response_format": "wav", "speed": 1.0 }
```

Response: raw audio bytes in `response_format` (we request `wav`). Duration is measured with `ffprobe -show_entries format=duration`.

**Pending for the user (cannot run from the cloud — servers are local):**

- [ ] ZeroTTS: one-sentence call, record returned format, sample rate, channel count, valid voice ids, whether `speed` is honoured.
- [ ] OmniVoice: same checks; confirm `GET {base_url}/v1/models` lists the model id.
- [ ] Whether either server trims leading/trailing silence (affects caption timing padding in phase 5).

A probe script lands in phase 5 (`scripts/tts-openai-compatible.mjs --probe`).

## 6. Schemas (delivered)

`plugins/one-studio/skills/one-studio/schemas/`:

- `studio.schema.json` — project manifest: meta, brand ref, engine/format, gates, scenes[] (hash/clip/approval), audio.tts, render, credit thresholds.
- `storyboard.schema.json` — scenes: id, type, engine override, duration, lines (sentence-level VO), assets, layout, transition, type-specific blocks (`explainer`, `character`, `three`).
- `brand.schema.json` — colors, typography, logo, grid, motion tokens, transitions, captions, lower third, intro/outro, voice preset, integer `version`.

Validated by `scripts/validate.mjs` (zero-dependency JSON Schema subset + cross-file checks) against `examples/demo/`.
