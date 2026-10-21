# Tester report — one-studio E2E (phase 8)

Date: 2026-10-21 · Linux cloud container (Node 22.22, FFmpeg 6.1 + libass, Chromium headless shell 141 / SwiftShader, no GPU).
TTS: OpenAI-compatible **mock server** (`tests/mock-tts-server.mjs`) — the user's local ZeroTTS / OmniVoice are not reachable from the cloud.

## Automated suites

| Suite | Command | Result | Time |
|---|---|---|---|
| Unit + workflow + audio (mock TTS) | `npm test` | **23 / 23 pass** | 2.4 s |
| E2E with real renders | `HYPERFRAMES_BROWSER_PATH=… ONE_STUDIO_LEMO_LIB=… npm run test:e2e` | **2 / 2 pass** | ~4.5 min |
| Plugin manifests | `claude plugin validate .` and `plugins/one-studio` | pass | – |

## Acceptance scenarios (plan §8)

| # | Scenario | Evidence | Result |
|---|---|---|---|
| a | Brief → 2D Vietnamese video through every gate | e2e test 1: gates 0–10, final 1920×1080@30, AAC, duration = audio timeline ±0.1 s, loudness −14 ±1 LUFS (measured −13.9), `.srt` written | ✅ |
| b | Add one scene → only it renders, old hashes unchanged | e2e test 1: script + storyboard re-approved, `keyframe-stills` reviews only s05, `render-changed-scenes --json` renders only `s05`, s01–s04 clip paths identical, **1 new TTS call**, concat → 5 scenes | ✅ |
| c | Episode 2 of a series asks nothing about brand / voice | unit "series: new episode inherits…": brand reused untouched, aspect/exports, TTS voice + consent inherited, series intro inserted | ✅ |
| d | Credit estimate before gates 5, 6, 9 | e2e: estimate at gate 4/5 (4 to write/fix), after adding a scene (1 to write/fix), before gate 9 (0 tokens, 4 to render); unit: warnings for > 8 scenes / heavy types / hero | ✅ |
| e | Keyframe review before any render | e2e: `render-changed-scenes` exits 2 with nothing rendered, `--approve keyframes` refused until `--approve-scenes`; unit: an edit clears only that scene's approval | ✅ |
| f | Explainer + character (+3D) concat | e2e test 2: text + anatomy explainer + three.js 3D + lemo character → identical stream params, exact concat duration; manual run also with a Remotion R3F scene (5 scenes, 3 engines, 16.00 s) | ✅ |

## Other checks

- **Captions vs audio:** cue starts vs `silencedetect` onsets on `vo.wav`: ≤ 20 ms (requirement < 100 ms).
- **Brand change:** primary colour edited → all 4 scenes need review/render; reverted → all 4 cached again (content-addressed).
- **Timings (demo, 35 s, 4 scenes):** preview clips ~50 s, final clips ~64 s, concat + mix + burned captions 11.8 s, stream-copy concat alone 0.9 s.
- **Publish:** one command → 16:9 + 9:16 + 1:1 (re-laid-out, not cropped) + 3 thumbnails + `out/manifest.json` (2 min 8 s).
- **Real Claude session (headless, plugin installed):** `/one-studio` on an empty folder stopped for approval at script, storyboard and estimate. Resuming `examples/demo`, it installed the runtime, captured keyframes, reviewed the sheet itself and stopped for approval; after approval it rendered, built audio (using recorded consent), assembled the preview and stopped at gate 8. With an invalid TTS URL it stopped and asked instead of guessing.

## Bugs found and fixed during testing

1. Kinetic text split dropped inline accent spans (`os.js splitWords`).
2. ES-module imports (three.js) were not part of the scene hash.
3. Staged snapshots rewrote `../assets/` to a bare `assets/` path, breaking module imports.
4. `anatomy-to-svg` kept the global `*{…}` rule (regex word boundary after `*`).
5. `build-audio` failed when `.one-studio/` did not exist yet.
6. The model misread the TTS endpoint order (default listed first) → language entry first, endpoint printed by init/status.

## Pending — needs the user's machine

- [ ] ZeroTTS and OmniVoice live: `node scripts/tts-openai-compatible.mjs --probe <project>` (format, sample rate, voices, latency), then one real `build-audio`.
- [ ] Rive scenes (deterministic seek with `@rive-app/canvas`) — not verified.
- [ ] macOS / Windows (Chrome discovery, `npx.cmd`, directory symlinks on Windows need Developer Mode).
- [ ] GPU-backed WebGL speed for 3D (container used SwiftShader).
- [ ] A lemo character scene drawn in a real style from its `STYLE.md` (only the placeholder mascot was rendered here).
