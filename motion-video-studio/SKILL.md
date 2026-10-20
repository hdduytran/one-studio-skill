---
name: motion-video-studio
description: >-
  End-to-end motion-graphics video production — from brief and script through storyboard, design, asset prep, animation, sound, render and multi-platform export — built on Remotion with GSAP, Anime.js, Motion, Lottie/dotLottie, Rive, Three.js/R3F, Satori, SVGO, Mediabunny and FFmpeg. Use this skill whenever the user wants to make, plan or script a video of any kind made from code or graphics: explainer, product promo, app demo, launch teaser, social clip (TikTok/Reels/Shorts), YouTube intro/outro, logo reveal/animation, kinetic typography, animated data/stat video, lower-thirds, 3D product shot, or "turn this script/blog/deck into a video" — in any language (e.g. "làm video", "dựng video motion", "video giới thiệu sản phẩm", "kịch bản video", "animation logo"). Also use it when the user asks how to combine these animation libraries into a video pipeline, even if they never say "Remotion".
---

# Motion Video Studio

You are the director and the editor of a small motion studio. The job is to go from an idea to a finished, checked MP4 by working through the stages a real studio uses. Each stage produces a file that the next stage reads. That way the user can approve or change cheap things (words, timing, look) before you spend time on expensive things (animation, render).

```
brief.md → script.md → storyboard.json → theme + assets → animatic → animation → audio → render → post/export → QA
```

Everything below assumes a Remotion project scaffolded from this skill's template. **Remotion is the backbone that renders the video.** Every other library is plugged in as a *frame-driven* layer inside it.

## The one rule that matters most

**Every pixel must be a pure function of the frame number.** Remotion renders frames out of order, in parallel browser tabs. Anything that moves on its own clock will flicker, stutter or desync: CSS transitions, `requestAnimationFrame`, `setTimeout`, GSAP/Anime timelines left playing, `<motion.div animate>`, R3F `useFrame`, Lottie/Rive autoplay, `Math.random()`.

Instead, read `useCurrentFrame()` and *seek* or *sample* the library at `frame / fps`. The template's bridges already do this. Use them and copy their pattern for anything new:

| Library | Frame-driven pattern | Template file |
|---|---|---|
| Remotion | `interpolate()`, `spring()`, `Easing` | `src/lib/anim.ts` |
| GSAP | paused timeline → `tl.seek(frame/fps)` | `src/bridges/useGsapTimeline.ts` |
| Anime.js v4 | `createTimeline({autoplay:false})` → `tl.seek(ms)` | `src/bridges/useAnimeTimeline.ts` |
| Motion | sample `spring()/keyframes()/inertia()` generators at `t` | `--with motion` → `src/bridges/motionAt.ts` |
| Lottie JSON | `@remotion/lottie` `<Lottie>` | `--with lottie` → `LottieScene` |
| dotLottie | `autoplay:false` → `setFrame()` | `--with dotlottie` → `DotLottieScene` |
| Rive | `autoplay:false` → `scrub(anim, t)` | `--with rive` → `RiveScene` |
| Three/R3F | `<ThreeCanvas>`, values from frame, never `useFrame` | `--with three` → `Scene3D` |
| Randomness | `random("seed")` from remotion | `components/Background.tsx` |

## Workflow

Work through the stages in order. **Stop for user approval at the four ◆ checkpoints.** A change at the script stage costs a minute. The same change after rendering costs much more. If the user says "just do it" or gives a complete brief, keep going: make reasonable choices, write down your assumptions in `brief.md`, and show the results at the end.

### 0. Brief → `brief.md`
Collect or infer the following: goal, audience, platform and aspect ratio (YouTube 16:9, Reels/TikTok/Shorts 9:16, feed 1:1 or 4:5), length, tone, one key message, CTA, brand (colors, font, logo), language, voice-over (none / user file / TTS), and music. Ask only for what you cannot infer, in one short batch. → `references/01-brief-and-script.md`

### 1. Script → `script.md` ◆
Write the script beat by beat: **Hook (0–3s) → Problem → Solution → Proof → CTA**. You can compress or reorder the beats for short clips. For each beat, write the VO line, the on-screen text (short — viewers read while listening), and the estimated seconds. Check the length: about 2.5 words/s in English and about 3 words (syllables) per second in Vietnamese. A 30s video holds about 75 English words. Present it as a table. ◆ **Get approval.**

### 2. Storyboard → `storyboard.json` ◆
The storyboard is the single source of truth. The composition renders directly from it, so timing never lives in two places. Each scene has an `id`, a `component` (a registered scene), a `duration` in seconds, an optional `transition` into it, `props`, `vo` and `sfx`. → `references/02-storyboard-schema.md`.
Run `node <skill>/scripts/storyboard_to_timeline.mjs <project>`. It prints frame-accurate timing and flags problems such as VO that is too long, missing files or unknown components. Show the user the table. ◆ **Get approval.**

### 3. Design system & style frames ◆
Set `theme.colors` in the storyboard and the font in `src/fonts.ts`. Then render 2–3 **style frames** with `npx remotion still Main out/style-N.png --frame=<f>`. Pick hero moments, not first frames. Look at the frames yourself and show them to the user. ◆ **Get approval on the look before animating everything.** → `references/03-design-system.md`

### 4. Assets
- Logos and icons go through **SVGO** first: `scripts/optimize_svgs.sh in/ public/svg/`. Its config keeps the ids, paths and viewBox that you will animate.
- Use **Satori** for thumbnails, title/quote cards and lower-thirds made from data: `scripts/render_cards.mjs <project> cards.json`.
- Get Lottie, Rive and 3D models from the user or a library. Put them in `public/` and never hot-link them at render time.
→ `references/04-assets-svg-satori.md`

### 5. Animatic ◆
Make a fast draft render to lock the rhythm: `npx remotion render Main out/draft.mp4 --scale=0.5`. Use placeholder scenes, real or temporary VO, and temporary music. Show it to the user. ◆ **Timing approved = structure frozen.** Use `--scale` values that give integer sizes (0.5 works; 0.33 fails on 1080p).

### 6. Animation
Fill each scene with real motion. Reuse template scenes where they fit. Write new scenes as `src/scenes/<Name>.tsx` and register them in `src/scenes/index.ts`. Choose the library from the **tool map** below. Follow the motion principles: easing over linear, stagger, overlap, anticipation and follow-through, one focal point per moment, and hold important text long enough to read it (about 0.3s per word plus 1s). → `references/05-animation-principles.md`, `references/06-library-bridges.md`, `references/07-3d-r3f.md`

### 7. Audio
- VO goes in `public/audio/vo/<scene>.mp3`. Run `node <skill>/scripts/probe_audio.mjs <project>`. Mediabunny measures each file and writes `vo.duration`, and the scenes stretch to fit.
- Music goes in `audio.music`. It ducks automatically under VO and fades out at the end.
- SFX go in `scene.sfx[]` with times relative to the scene. `scripts/make_sfx.sh` makes an offline kit (whoosh, pop, click, ding, riser, impact, music-bed). Use about 1 SFX per visual "hit", no more.
→ `references/09-audio.md`

### 8. Render
`npx remotion render Main out/master.mp4 --codec=h264 --crf=18`. For other aspects from the same storyboard, add `--props='{"aspect":"9:16"}'`. Native re-layout always beats cropping. → `references/10-render-export.md`

### 9. Post & export
`scripts/post_export.sh out/master.mp4 [--srt subs.srt] [--reframe 9:16,1:1] [--gif] [--webm]` does the following: two-pass loudness normalization to -14 LUFS, faststart, burned-in and sidecar subtitles, fallback reframes, thumbnail and previews.

### 10. QA (always)
Run `scripts/qa_video.sh out/export/master-web.mp4 <project>`. It checks size, fps and frame count against the storyboard, loudness and true peak, and black or frozen stretches. Also pull 3–4 frames with ffmpeg and **look at them** before you say the video is done. Report what you checked.

## Tool map — what to reach for

| Need | Use | Why |
|---|---|---|
| Rendering, timing, audio mix, transitions | **Remotion** (+ `@remotion/transitions`, `@remotion/media`) | frame-accurate, React, CLI/Lambda render |
| Simple fades/moves/scales | Remotion `interpolate` + `spring` | zero deps, editable in Studio |
| Complex multi-element choreography, text splitting, morphs | **GSAP** (`useGsapTimeline`) | best timeline/position-parameter model; SplitText & MorphSVG are free |
| SVG line drawing, grid staggers, path morph | **Anime.js** (`useAnimeTimeline`) | `svg.createDrawable`, `stagger` grid |
| UI-mock physics (bouncy cards, flick/momentum) | **Motion** generators (`motionAt.ts`) | designer-tuned `bounce`/`visualDuration` springs, inertia |
| Character / illustrated animation from After Effects | **Lottie** (`@remotion/lottie`) or **dotLottie** | huge free library; dotLottie for `.lottie`, themes |
| Interactive-style vector characters made in Rive | **Rive** (timeline animations only) | small files, rich rigs |
| 3D product shots, logo extrusions, abstract 3D | **Three.js + R3F + Drei** | via `@remotion/three` `<ThreeCanvas>` |
| Cinematic glow, vignette, DOF | **React Postprocessing** | use the `PostFxWarmUp` pattern |
| Physics (falling/colliding objects) | **React Three Rapier** — but **bake** it | live physics isn't frame-seekable → `references/07-3d-r3f.md` |
| Thumbnails, cards, lower-thirds from data | **Satori** (+ resvg for PNG) | JSX → SVG, batchable |
| Clean SVGs for animation | **SVGO** (skill config) | smaller, keeps ids/paths |
| Media metadata, VO durations, in-browser transcode | **Mediabunny** | fast, no ffmpeg needed for probing |
| Loudness, subtitles, reframes, GIF/WebM, compression | **FFmpeg** | the finishing tool |
| Code/math explainers with a coding-first workflow | **Motion Canvas** (separate project) | see `references/08-motion-canvas.md`; don't mix with Remotion |
| Auditioning SFX in an interactive browser page | **Howler.js** | preview only — never in the render path |

## Setup

```bash
bash <skill>/scripts/init_project.sh my-video --with three,lottie,motion   # pick modules
cd my-video && npx remotion studio                                          # live preview
```
GSAP and Anime.js are always included. The optional modules are `three`, `lottie`, `dotlottie`, `rive` and `motion`.

The official agent skills cover library details, so install them alongside this one when you need deeper API guidance: `npx skills add remotion-dev/skills`, `npx skills add https://github.com/greensock/gsap-skills`, and `npx motion-ai` (Motion AI Kit). This skill decides *what* to build and *how the pieces connect*. Those skills cover API specifics.

### Sandbox / offline gotchas (learned the hard way)
- If Remotion can't download Chrome Headless Shell, point it at an existing Chromium: `REMOTION_BROWSER=/path/to/chrome npx remotion render …`. `remotion.config.ts` reads this variable.
- **Nothing may load from the network at render time.** The template bundles Inter locally (Vietnamese included) instead of Google Fonts. Lottie, Rive and SVG assets live in `public/`. The dotLottie and Rive WASM files are copied to `public/wasm/`. Drei `<Environment preset>` downloads HDRs, so use `Lightformer`s or a local `.hdr` instead.
- Remote SFX URLs (e.g. remotion.media) may be blocked. Use `make_sfx.sh` or local files.

## Project layout (after init)

```
my-video/
  storyboard.json          ← edit this most
  src/Root.tsx             composition (reads storyboard, aspect override via props)
  src/Main.tsx             TransitionSeries + VO/SFX/music on absolute timeline + captions
  src/theme.tsx  fonts.ts  colors, type scale, easing, safe area
  src/scenes/*.tsx         TitleCard, BulletList, StatCounter, ImageFocus, EndCard,
                           GsapShapes, AnimeLineDraw, SvgReveal (+ optional modules)
  src/bridges/*.ts         frame-driven adapters
  src/components/          Background, Stage (safe area), Captions, Music (ducking)
  public/                  audio/ svg/ lottie/ images/ cards/ wasm/
```

## Reference files — read when you reach the stage

| File | Read when |
|---|---|
| `references/01-brief-and-script.md` | writing brief/script, hook formulas, timing math |
| `references/02-storyboard-schema.md` | writing storyboard.json |
| `references/03-design-system.md` | colors, type, layout per aspect, brand fonts |
| `references/04-assets-svg-satori.md` | SVG prep, Satori cards, Lottie/Rive/3D asset intake |
| `references/05-animation-principles.md` | choreographing motion, kinetic type, transitions |
| `references/06-library-bridges.md` | writing scenes with GSAP / Anime.js / Motion / Lottie / Rive |
| `references/07-3d-r3f.md` | any 3D, postprocessing or physics |
| `references/08-motion-canvas.md` | user wants Motion Canvas or a code/math explainer |
| `references/09-audio.md` | VO/TTS, music, SFX, ducking, captions, Howler |
| `references/10-render-export.md` | render flags, platform presets, FFmpeg recipes, QA |

## Deliverables checklist

When you finish, the project folder should contain: `brief.md`, `script.md`, `storyboard.json`, the source, `out/master.mp4`, `out/export/*` (web master, plus subtitles, reframes and thumbnail as requested), and the QA output. Tell the user where each file is, what you checked, and what you assumed.
