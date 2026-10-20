# storyboard.json — schema & conventions

The composition (`src/Main.tsx`) renders directly from this file, and
`scripts/storyboard_to_timeline.mjs` reads it with the same timing code
(`src/lib/timeline.ts`). Edit timing here, never in components.

## Schema

```jsonc
{
  "meta": {
    "title": "App launch 30s",
    "fps": 30,                    // 30 default; 60 for fast UI scrolls; 24 for "film" feel
    "aspect": "9:16",             // "16:9" | "9:16" | "1:1" | "4:5"  (or set width/height)
    "language": "vi",             // used for VO length estimates
    "voPadding": 0.4,             // seconds of air after each VO line (default 0.4)
    "captions": true              // burn simple captions from vo.text (see 09-audio.md)
  },
  "theme": {
    "colors": { "bg": "#0B1020", "surface": "#161D3A", "primary": "#6C8CFF",
                "accent": "#FFB547", "text": "#F5F7FF", "muted": "#9AA3C7" },
    "fontFamily": "Inter"         // optional; must be loaded in src/fonts.ts
  },
  "audio": {
    "music": { "src": "audio/music.mp3", "volume": 0.5, "duckTo": 0.15, "fadeOut": 1.5 }
  },
  "scenes": [
    {
      "id": "hook",               // unique, kebab-case; used for VO filenames
      "beat": "hook",             // hook | problem | solution | proof | cta (documentation)
      "component": "TitleCard",   // key in src/scenes/index.ts
      "duration": 3,              // seconds; final = max(duration, vo.duration + delay + voPadding)
      "transition": { "type": "slide", "duration": 0.5, "direction": "from-right" },
                                  // INTO this scene: none|fade|slide|wipe|flip|clockWipe
                                  // direction: from-left|from-right|from-top|from-bottom
      "props": { "title": "…" },  // passed to the component
      "vo": { "text": "…", "src": "audio/vo/hook.mp3", "duration": 2.41, "delay": 0.15 },
                                  // duration is written by probe_audio.mjs — don't hand-edit
      "sfx": [ { "src": "audio/sfx/whoosh.wav", "at": 0.0, "volume": 0.5 } ],
                                  // at = seconds from the scene's start
      "notes": "camera pushes in slowly; logo in brand blue"
    }
  ]
}
```

All `src` paths are relative to `public/` (or full URLs — avoid URLs for renders).

## How timing resolves
- Scenes run back-to-back in a `TransitionSeries`. A transition **overlaps** the two scenes, so it shortens the total: `total = Σ durations − Σ transitions`.
- A transition is clamped so it is never longer than either neighbor (warning printed).
- VO starts `vo.delay` (0.15s) after the scene starts and the scene grows to fit it.
- Music, VO and SFX sit on absolute-time `<Sequence>`s, so transitions never shift audio.

## Built-in components & props

| component | props |
|---|---|
| `TitleCard` | `kicker?`, `title`, `subtitle?` — word-by-word blur-rise |
| `BulletList` | `title?`, `items[]`, `stepFrames?` (default 10) |
| `StatCounter` | `value`, `prefix?`, `suffix?`, `label`, `decimals?` |
| `ImageFocus` | `src`, `caption?`, `zoom?` [from,to], `fit?` cover/contain |
| `EndCard` | `title`, `cta?`, `logo?` |
| `GsapShapes` | `caption?`, `count?` — GSAP demo/pattern |
| `AnimeLineDraw` | `caption?` — Anime.js SVG draw demo/pattern |
| `SvgReveal` | `src` (svg in public/), `caption?`, `drawFrames?`, `size?` — logo draw-on |
| `Scene3D` *(three)* | `count?`, `bloom?` |
| `LottieScene` *(lottie)* | `src`, `size?`, `loop?`, `playbackRate?` |
| `DotLottieScene` *(dotlottie)* | `src`, `size?`, `loop?`, `speed?` |
| `RiveScene` *(rive)* | `src`, `animation`, `artboard?`, `size?` |
| `MotionCards` *(motion)* | `title?`, `cards[]` |

Custom scene: create `src/scenes/MyScene.tsx` exporting `MyScene`, add it to the `SCENES` map in `src/scenes/index.ts`, reference it as `"component": "MyScene"`. Inside, `useCurrentFrame()` is **scene-local** (0 at the scene start), and `useVideoConfig().durationInFrames` is the scene length.

## Example — 30s vertical app promo

```json
{
  "meta": { "title": "Ví Xanh 30s", "fps": 30, "aspect": "9:16", "language": "vi", "captions": true },
  "theme": { "colors": { "primary": "#22C55E", "accent": "#FACC15" } },
  "audio": { "music": { "src": "audio/music.mp3", "volume": 0.5, "duckTo": 0.15 } },
  "scenes": [
    { "id": "hook", "beat": "hook", "component": "TitleCard", "duration": 3,
      "props": { "kicker": "MỖI THÁNG", "title": "Tiền đi đâu hết?" },
      "vo": { "text": "Cuối tháng lại hết tiền mà không biết vì sao?", "src": "audio/vo/hook.mp3" },
      "sfx": [{ "src": "audio/sfx/impact.wav", "at": 0.2 }] },
    { "id": "problem", "beat": "problem", "component": "StatCounter", "duration": 4,
      "transition": { "type": "wipe", "duration": 0.4, "direction": "from-bottom" },
      "props": { "value": 68, "suffix": "%", "label": "người trẻ không ghi chép chi tiêu" },
      "vo": { "text": "Sáu mươi tám phần trăm người trẻ không hề ghi chép chi tiêu.", "src": "audio/vo/problem.mp3" } },
    { "id": "demo", "beat": "solution", "component": "ImageFocus", "duration": 6,
      "transition": { "type": "slide", "duration": 0.5, "direction": "from-right" },
      "props": { "src": "images/app-home.png", "caption": "Tự động phân loại", "fit": "contain" },
      "vo": { "text": "Ví Xanh tự động phân loại mọi khoản chi chỉ trong một chạm.", "src": "audio/vo/demo.mp3" } },
    { "id": "features", "beat": "solution", "component": "BulletList", "duration": 6,
      "transition": { "type": "fade", "duration": 0.4 },
      "props": { "title": "Ví Xanh giúp bạn", "items": ["Biết tiền đi đâu", "Đặt hạn mức", "Nhắc hoá đơn"] } },
    { "id": "cta", "beat": "cta", "component": "EndCard", "duration": 4,
      "transition": { "type": "fade", "duration": 0.5 },
      "props": { "title": "Tải Ví Xanh miễn phí", "cta": "vixanh.app", "logo": "svg/logo.svg" },
      "sfx": [{ "src": "audio/sfx/ding.wav", "at": 0.5 }] }
  ]
}
```

## Checklist before approval ◆
- Run `storyboard_to_timeline.mjs` → no warnings (or warnings explained).
- Total length within ±10% of the brief.
- Every scene has a visual idea that matches its VO line.
- Hook scene shows text by frame ~10; CTA holds ≥ 2.5s.
