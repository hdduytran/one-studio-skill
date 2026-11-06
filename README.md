# one-studio

A Claude Code plugin that makes motion videos end to end: brief → script → storyboard → credit estimate → keyframe review → per-scene build → voice-over, music bed, sound effects + captions → render → publish in several aspect ratios. Everything runs offline (TTS on your own server, music and SFX synthesised on your machine). Editing or adding a scene re-renders only that scene. A series shares one brand kit, voice and intro/outro.

## Community showcase

Channels and videos made with one-studio. Made one? Open a pull request that adds it here.

### [Ping Dev](https://www.youtube.com/@pingdevvn) — tech explainers (Vietnamese & English)

| Video | Length |
|---|---|
| [![A $12 server handled 310,000 users. How?](https://img.youtube.com/vi/gMq24d6SKpc/mqdefault.jpg)](https://www.youtube.com/watch?v=gMq24d6SKpc)<br>[A $12 server handled 310,000 users. How?](https://www.youtube.com/watch?v=gMq24d6SKpc) | 4:23 |
| [![AI sửa AI](https://img.youtube.com/vi/nTnpOZF9jeU/mqdefault.jpg)](https://www.youtube.com/watch?v=nTnpOZF9jeU)<br>[AI sửa AI: đổi 0,016% trọng số, điểm toán tăng gấp 6](https://www.youtube.com/watch?v=nTnpOZF9jeU) | 7:47 |
| [![Binance EIP-7702](https://img.youtube.com/vi/L5dm6WCW_xg/mqdefault.jpg)](https://www.youtube.com/watch?v=L5dm6WCW_xg)<br>[Binance mất 6,3 tỷ USD mà không lộ khoá: EIP-7702 và chiếc máy ký](https://www.youtube.com/watch?v=L5dm6WCW_xg) | 6:05 |
| [![AI video](https://img.youtube.com/vi/5HIA62E2Us8/mqdefault.jpg)](https://www.youtube.com/watch?v=5HIA62E2Us8)<br>[AI làm ra một video như thế nào? Từ Will Smith ăn mì đến Genie 4](https://www.youtube.com/watch?v=5HIA62E2Us8) | 11:21 |
| [![Worst days of the Internet](https://img.youtube.com/vi/csO1uTlaccE/mqdefault.jpg)](https://www.youtube.com/watch?v=csO1uTlaccE)<br>[Những ngày tồi tệ nhất của Internet: từ Morris Worm 1988 đến PHP2Shell](https://www.youtube.com/watch?v=csO1uTlaccE) | 12:33 |

### [Vẽ lại Việt Nam](https://www.youtube.com/@velaivietnam) — how Vietnam's economy works, drawn on a whiteboard

| Video |
|---|
| [![VPBank](https://img.youtube.com/vi/TcqSddwNw9M/mqdefault.jpg)](https://www.youtube.com/watch?v=TcqSddwNw9M)<br>[VPBank: Từ 20 tỷ đến 100.000 tỷ · Bản đồ toàn cảnh #1](https://www.youtube.com/watch?v=TcqSddwNw9M) |
| [![Sovico](https://img.youtube.com/vi/pgF1q-Rl-CE/mqdefault.jpg)](https://www.youtube.com/watch?v=pgF1q-Rl-CE)<br>[Sovico: Ai thật sự giữ Vietjet và HDBank? · Bản đồ toàn cảnh #2](https://www.youtube.com/watch?v=pgF1q-Rl-CE) |
| [![Masan](https://img.youtube.com/vi/g4AHDzvVbmg/mqdefault.jpg)](https://www.youtube.com/watch?v=g4AHDzvVbmg)<br>[Masan: Cái mỏ thắng cả WinMart · Bản đồ toàn cảnh #3](https://www.youtube.com/watch?v=g4AHDzvVbmg) |
| [![3 triệu đồng](https://img.youtube.com/vi/IeDLoinvUXQ/mqdefault.jpg)](https://www.youtube.com/watch?v=IeDLoinvUXQ)<br>[3 triệu đồng và 10.000 trái tim: chuyện gì xảy ra sau cú bấm gửi?](https://www.youtube.com/watch?v=IeDLoinvUXQ) |

## Install

```
/plugin install one-studio --marketplace hdduytran/one-studio-skill
```

Or from a clone: `claude plugin marketplace add ./`, then `claude plugin install one-studio@one-studio`.

### Requirements

| Component | Required | Notes |
|---|---|---|
| Node.js ≥ 20 | ✓ | runs every script (≥ 22 for `capture-screen.mjs`) |
| FFmpeg + FFprobe | ✓ | concat, mixing, captions, loudnorm. Without libass (Homebrew FFmpeg 8) burned-in captions fall back to soft captions; without drawtext contact sheets have no labels |
| Chrome Headless Shell | ✓ | `npx hyperframes@0.8.181 browser ensure`, or set `HYPERFRAMES_BROWSER_PATH` |
| yt-dlp | only to extract a style from a link | `brew install yt-dlp` or `pipx install yt-dlp`; the skill never installs it. Not needed for a local video file |
| Python 3 | for `.lottie` files | reads the zip |
| OpenAI-compatible TTS server | for voice-over | ZeroTTS (Vietnamese, voices at `/v1/audio/voices`), Chatterbox (English, bundled, see below), OmniVoice (other languages) |
| OpenAI-compatible speech-to-text server | optional | screens the voice-over for misread words (see Voice-over) |
| anatomy skill | `explainer` scenes | `npx skills add wheresryan22/anatomy -g -a claude-code` |
| lemo-opuscar | `character` scenes | clone + `npm install`, set `ONE_STUDIO_LEMO_LIB` |
| Remotion | 3D scenes with physics/post-fx | `new-remotion.mjs`, then `npm install` in `<project>/remotion` |

`node plugins/one-studio/skills/one-studio/scripts/check-external.mjs <project>` tells you what a project needs and how to install it.

### English voice: Chatterbox on your machine

Chatterbox (Resemble AI, MIT) is the default English voice for `--lang en` projects. The skill bundles an OpenAI-compatible server on port 8002:

```bash
bash plugins/one-studio/skills/one-studio/servers/chatterbox/chatterbox-server.sh
```

- First run needs `uv` (`brew install uv`). The script installs Python 3.11 and torch into `~/.one-studio/chatterbox/.venv`, then downloads a ~3 GB model.
- On a Mac the server runs on CPU, about 9× faster than MPS: roughly 2 seconds of compute per second of speech. With an NVIDIA GPU it uses CUDA automatically.
- Voice cloning: put 5–15 seconds of clean speech in `~/.one-studio/chatterbox/voices/<name>.wav`, then pick voice `<name>`. Only clone your own voice or one you have permission to use.
- Tuning (restart the server to apply): `CHATTERBOX_EXAGGERATION` sets emotion (default 0.5), `CHATTERBOX_CFG` sets pacing (default 0.5), `CHATTERBOX_DEVICE` picks `cpu`, `cuda` or `mps`.
- Stop the server: `pkill -f chatterbox/server.py`.

### Environment variables

| Variable | Used for |
|---|---|
| `ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY_EN`, `ONE_STUDIO_TTS_KEY` | API key for ZeroTTS / Chatterbox / OmniVoice (never written to a file) |
| env named in `audio.stt.<lang>.key_env` (e.g. `ONE_STUDIO_STT_KEY`) | API key for the speech-to-text server |
| `HYPERFRAMES_BROWSER_PATH` | Chrome for HyperFrames |
| `ONE_STUDIO_LEMO_LIB`, `PLAYWRIGHT_CHROME` | lemo-opuscar library and its Chrome |
| `ONE_STUDIO_ANATOMY` | anatomy folder when not installed as a skill |
| `ONE_STUDIO_CHROME`, `ONE_STUDIO_REMOTION_GL` | Chrome and WebGL backend for Remotion |
| `ONE_STUDIO_CACHE` | npm cache for GSAP/howler/three/lottie/fonts; default `~/.cache/one-studio`. Presets saved under its `presets/` before the library existed are still read |
| `ONE_STUDIO_LIBRARY` | your library folder (presets, mockup kits, playbooks); if unset, a `library/` folder or `one-studio.library.json` in the project's parent folders is used |
| `ONE_STUDIO_YTDLP` | path to `yt-dlp` when it is not on PATH |

## Usage

Type `/one-studio` with a request, for example `/one-studio make a 40-second 2D explainer about GPS, 16:9, English`. The skill walks through 11 gates and stops for your approval at the script, storyboard, credit estimate, each scene's keyframes and the preview.

| Gate | Main scripts |
|---|---|
| 0 Setup | `init-project.mjs <dir> [--series <name>] [--lang en] [--aspect 16:9] [--exports 16:9,9:16] [--platform shorts,tiktok,reels,youtube] [--dimension 2d] [--preset apple-light] [--captions none\|sidecar\|mux\|burn] [--tts-url …] [--probe-tts]` |
| 1 Brief | fill `brief.md` with a Story core (`writers-room` skill), `status.mjs <dir> --approve brief` |
| 2 Script | `script-lint.mjs <dir>` (banned phrases, sentences > 20 words, numbers not written for the ear, missing visual column, facts without a source) + read aloud, then `status.mjs --approve script` |
| 3–4 Storyboard, estimate | pick mode/world/camera, `status.mjs <dir> [--estimate] [--approve <gate>]` |
| 5 Keyframes | `prepare-project.mjs`, `new-scene.mjs`, `capture-screen.mjs` (`screen` scenes), `keyframe-stills.mjs` (all export ratios, plus `review/seams.jpg`; `--at 12.4,13.6` for stills at chosen times), `seam-check.mjs`, `compare-presets.mjs`, `status.mjs --approve-scenes` |
| 6 Build | `render-changed-scenes.mjs --preview` |
| 7 Audio | `make-music.mjs --samples`, `audio-picker.mjs`, `make-music.mjs --use <track\|none>`, `status.mjs --captions <mode>`, `build-audio.mjs [--allow-tts]`, `check-pronunciation.mjs [--allow-stt]`, `build-audio.mjs --tighten [--apply]` (shorten scenes to the real voice-over; storyboard needs re-approval) |
| 8 Preview | `concat-and-mix.mjs --preview` (one chapter per scene), `concat-and-mix.mjs --preview --ratio 9:16` (vertical preview for Shorts/TikTok) |
| 9 Render | `render-changed-scenes.mjs`, `concat-and-mix.mjs` |
| 10 Publish | `publish.mjs [--ratios 9:16,1:1] [--thumb-frame s02@3.5]` |

Other tools: `library.mjs` (your library), `script-lint.mjs`, `seam-check.mjs`, `capture-screen.mjs`, `validate.mjs`, `brand-to-css.mjs`, `optimize-assets.mjs`, `anatomy-to-svg.mjs`, `new-remotion.mjs`, `series-bumper.mjs`, `make-sfx.mjs`, `sync-lines.mjs`, `tts-openai-compatible.mjs --probe | --voices | --samples all | --use-voice <id>`, `check-external.mjs`.

### Draft preview (any time, outside the gates)

Want to watch the whole video before every gate is approved? `concat-and-mix.mjs <dir> --draft [--labels]` renders every scene in draft quality (approved or not, cached in `out/draft/`) and mixes it like a preview → `out/<name>-draft.mp4`. Nothing is approved or recorded in `studio.json`. `--labels` draws `scene · title │ current VO line │ +seconds in scene │ ▶ time in video` on each HyperFrames scene, so feedback can name exact moments. One MP4 chapter per scene. It never replaces the gate 8 preview.

## Extract a style from a video

Give a video file or link: one-studio measures cut rhythm, colour, motion and audio, then Claude reads two contact sheets for fonts, layout and tone. The result is a style card (`style-refs/<slug>/style.json` + `STYLE.md`) and a comparison sheet: source frames on the top row, 3 sample scenes (title, chart, caption) built in the style on the middle row, palette on the bottom row. Review it, ask for as many rounds of changes as you like, and only once you agree is it applied to `brand.json`. Run it with `/one-studio extract the style from <link or file>` (gate 0).

| Command | Does |
|---|---|
| `style-fetch.mjs <dir> <url\|file> [--from 0:00] [--to 1:30] [--max 90] [--keep]` | fetch the video (first 90 seconds by default) |
| `style-analyze.mjs <dir> <slug>` | measure with FFmpeg → `metrics.json` + 2 contact sheets |
| `style-draft.mjs <dir> <slug>` | merge measurements and Claude's reading into `style.json` |
| `style-compare.mjs <dir> <slug> [--variant v] [--ratio 9:16]` | comparison sheet, no video render |
| `style-enhance.mjs <dir> <slug> [--accept 1,3] [--reject 2]` | suggested improvements with reasons and before/after images; applied only when you accept |
| `style-set.mjs <dir> <slug> key=value … [--lock key]`, `style-diff.mjs`, `style-editor.mjs` | tweak by chat or in `review/style-editor.html` (offline) |
| `style-merge.mjs <dir> <a> <b> … --as <slug>` | merge several videos into one style |
| `style-apply.mjs <dir> <slug> [--variant v] [--as-preset name] [--keep] [--dry-run] [--allow-low-contrast]` | write to `brand.json` (bumps `version`), `studio.json → story.style`, storyboard/audio hints |

- **Your consent:** links are downloaded only when `studio.json → services.download: true` (Claude asks once). yt-dlp is never auto-installed and browser cookies are never used. A local file needs nothing.
- **Platforms:** YouTube, TikTok, Facebook, Instagram through yt-dlp. Private, login-only or age-restricted videos (common on Facebook and Instagram) stop the fetch; download the file yourself and pass it in. TikTok and Instagram sometimes block downloads; a file is the safest route. Subtitles are a bonus: if they fail (often HTTP 429), the video still downloads without them.
- **Never taken:** frames, logos, mascots, characters, slogans and on-screen text, music, voices, creator names. Only presentation is taken (colours, nearest fonts, pacing, transitions, caption style, loudness). Music only suggests the closest bundled bed. Source videos live in `style-refs/` (git-ignored) and are deleted after applying unless you pass `--keep`.
- **Enhance and customise:** a style is layered, later layers win: measurements < accepted suggestions < your edits (lockable) < light/dark variant. Re-extracting or merging never overwrites what you edited or locked. Main text always meets WCAG AA; otherwise `style-apply` refuses (change the colour, accept the `contrast` suggestion, or pass `--allow-low-contrast` if you are sure).
- **Presets:** `--as-preset name` saves the look to your library (`<library>/presets/<name>.json`, see Your library). It then shows up in `compare-presets.mjs` and `init-project.mjs --preset`; built-in presets are never overwritten. Card/panel colour (`colors.surface`, e.g. cream cards on a pale purple background) is kept separately and not darkened like text colours.
- `status.mjs` shows the active style and marks `!` when the style card changed after applying; `validate.mjs` checks that `story.style` points at a real style.

## Your library

One folder shared by every project, holding what you want to reuse: looks (presets), mockup kits (phone frames, chat bubbles, cards…) and script structures (your own playbooks). Lookup order: `ONE_STUDIO_LIBRARY`, then `one-studio.library.json` (`{ "path": "…" }`) or a folder named exactly `library` (with `presets/`, `kits/` or `playbooks/`) in the project's parent folders, finally the old cache.

```
<library>/presets/<name>.json · kits/<kit>/kit.css + components/*.html + gallery.html · playbooks/<id>.md
```

| Command | Does |
|---|---|
| `library.mjs --init <folder>` | create a library |
| `library.mjs <dir> [--presets \| --kits \| --playbooks]` | where the library is and what it holds |
| `library.mjs <dir> --save-preset <name>` | save the project's current look without re-applying a style |
| `library.mjs <dir> --import-cache` | copy old cached presets into the library |
| `new-scene.mjs <dir> <id> --kit <kit> [--component <name>]` | copy the kit's CSS into the scene (scenes stay self-contained; re-run after a kit changes); `--component` builds the scene from a template |
| `library.mjs <dir> --kit-gallery <kit>` | page showing every kit template in the project's brand |

Your playbooks appear beside the 14 built-in ones (on an id clash the built-in wins). Full example: `examples/library/` (Claude Duet look, 9-template kit, `product-launch-short` playbook). Details: `plugins/one-studio/skills/one-studio/references/user-library.md`.

## Script writing: writers-room

The `writers-room` skill (used at gates 1–3) writes scripts like someone who researched the topic, not like a template:

- **14 playbooks** by genre (`mechanism-system`, `concept-explainer`, `news-recap`, `saas-product`, `customer-story`…), each a skeleton with timing ratios; only one is loaded, chosen via `playbooks/index.md`.
- **4 formats** layered on a playbook (pick at most one): `short-vertical`, `long-form`, `series-episode`, `no-voice`. **5 tones** (`tones.md`): `knowing-friend`, `dry-expert`, `playful`, `neutral-newsroom`, `cinematic-minimal`.
- **Story core** in `brief.md`: one-sentence angle, a real person, the conflict, a common misconception, a detail only this topic has, point of view/voice, the promise and where it pays off, sources. Choices go in `studio.json → story`.
- **Two-column script**: narration (one sentence ≤ 20 words per bullet) and picture (`> visual:`, `> camera:`, `> sfx:`, `> silence:`, `> source:`).
- **`script-lint.mjs`** catches vi/en clichés, long sentences, numbers not written for the ear, "and then" chains, missing visual column, facts without a source; then read aloud and cut ~20%.
- **Visual modes** (`visual-modes/`): `world-camera`, `match-cut-motif`, `exploded-cutaway`, `screen-cinema`, `kinetic-type`… each scene declares its `mode` in the storyboard.

## Continuous worlds

Several scenes can share one "world" (`worlds/<id>.html`, declared in `storyboard.json → worlds`). Each scene is just one stretch of the camera's path:

- `S.camera(...)` flies between the world's `data-place` points (`camera.from` → `camera.to`; the next scene starts exactly where the previous one ended); `S.state(id, name, { at })` changes an object's state; `exit_state` / `enter_state` carry state across a seam.
- The validator checks the camera path is continuous; `new-scene.mjs` uses a `cut` transition between scenes in the same world.
- **Seam check** (`seam-check.mjs`, runs inside `keyframe-stills.mjs`): last frame of scene A next to first frame of scene B with a pixel difference (`review/seams.jpg`); same world and > 2% difference is an error. `handoff` pairs (motif match cuts) are for human eyes only.
- Editing a scene re-renders only that scene.

## Screen capture

`screen` scenes use real video recorded from a web page following a script in `flows/<id>.json` (schema `flow.schema.json`):

- `capture-screen.mjs <dir> <flow-id>` opens Chrome, follows the flow (click, type, scroll, highlight) and records fixed-fps video plus `events.json` (cursor path, click areas). The scene zooms to click areas like Screen Studio. The cursor is seeded, so logs are reproducible; it re-records only when the flow changes or with `--recapture`.
- **Needs your consent**: `studio.json → services.capture: true` and only URLs you give. It navigates only within the flow's origin and refuses to type into password fields; login only via a storage state you provide.
- Requirements: Node ≥ 22 (for `capture-screen.mjs`), Chrome, FFmpeg. Real recording time is ~30 seconds per flow.

## News

- News/fact videos: research runs **only when you ask** and `services.web: true`; it runs in a subagent and the main agent only reads `research.md`.
- Each `research.md` row has a type `fact | quote | opinion | context`, source, URL, publish date, access date, speaker. News facts need ≥ 2 independent sources; quotes are verbatim.
- Sourced lines carry `> source: r1,r2`; lint checks the ids exist. Opinions are voiced as opinions and get an **OPINION** label on screen. `publish.mjs` writes the source list to `out/manifest.json` and `out/sources.txt`.

## How it works

- **Incremental render:** each scene's hash covers its source file, every file it references, brand version, engine and format. An existing `out/scenes/<id>-<hash>.mp4` is not rendered again. Every clip is normalised to one encoding, so concat only copies streams.
- **Approve before render:** a scene renders only when the keyframes of that exact version were approved. Editing a scene requires re-approving only that scene.
- **Voice-over:** one TTS call per sentence, cached. Voices are chosen by ear: listen to samples of each server voice, then pick. Scenes stretch to fit the voice-over, and text tagged `data-line` appears exactly when its sentence is spoken, without losing approvals. Captions come from real audio durations, no Whisper needed; choose no captions, `.srt` only, soft or burned-in captions.
- **Pronunciations:** voices often misread acronyms and brand words (swallowing the last letter, reading them as words). A dictionary in `brand.json → pronunciations` (shared by a series) or `studio.json → pronunciations` (this project, wins per entry), keyed by language (`vi`, `en`, `default`), rewrites only what is spoken: whole words, case-sensitive, longest match first. Captions keep the written text; editing an entry re-synthesises only the lines that use it.
- **Speech-to-text check:** with `studio.json → audio.stt.<lang>` pointing at an OpenAI-compatible transcription server, `check-pronunciation.mjs <dir> --allow-stt` compares each sentence with what the server heard: missing or changed words, dictionary entries, acronyms without an entry, and spelled letters that are too short. Report in `review/pronunciation.json`. It only screens; you listen to the flagged lines and decide.
- **Music & SFX:** offline-synthesised music beds (`ambient`, `lofi`… seamless loops, adjustable BPM/key/length) or your own file; an SFX set (whoosh, pop, ding, riser, impact…) placed per scene in the storyboard. `review/audio-picker.html` (howler.js, local) lets you audition voices, music and SFX side by side. The final mix is always FFmpeg: −14 LUFS, music ducks under the voice.
- **Looks:** 9 presets (`apple-light`, `apple-keynote`, `neon-terminal`, `synthwave`, `ocean-calm`, `warm-editorial`, `swiss-mono`, `infinity-board`, `default`) plus presets you saved from videos, compared on the same scenes in one contact sheet; macOS-style frosted glass surfaces (`brand.json → surface: "glass"`).
- **Review stills:** contact sheets hold up to 12 scenes (`review/sheet-1.jpg`, `sheet-2.jpg` … for longer videos). For a moment between the default frames: `keyframe-stills.mjs <dir> s07 --at 12.4,13.6` → `review/sheet-at.jpg`, without changing any approval.
- **Multiple ratios:** 9:16 / 1:1 keyframes are captured at gate 5. Ratio-specific CSS (`<style data-ratio="9:16">`) re-renders only that ratio.
- **Engines:** HyperFrames (HTML/GSAP) is the default, including canvas, Lottie and three.js. Remotion is used only for 3D with physics or post-processing. anatomy is exported as static SVG and animated with GSAP. lemo-opuscar renders its own clips.

## Development

```
npm test                 # node:test, no network
npm run test:e2e         # real render (needs Chrome + FFmpeg)
npm run validate:demo    # examples/demo
npm run validate:gps     # examples/gps-world (sample: continuous world)
npm run validate:plugin  # claude plugin validate
```

Plans: `plans/`. Reports: `plans/reports/`.

## License

MIT. External tools keep their own licenses: HyperFrames, GSAP (free), Remotion (free for individuals and companies of ≤ 3 people), anatomy (MIT), lemo-opuscar (MIT, film CC BY 4.0), Inter (OFL).
