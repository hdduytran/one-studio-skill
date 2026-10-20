# Library bridges — using animation libraries inside Remotion

**Principle:** build the animation *once, paused*; on every frame, move the playhead to `frame / fps`. Never let a library run its own clock. Scene-local frame: `useCurrentFrame()` is 0 at the start of the current `<Sequence>`.

## Remotion native (default choice)
```tsx
const frame = useCurrentFrame(); const { fps } = useVideoConfig();
const p = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out });
const s = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 160 } });
<div style={{ opacity: p, translate: `0 ${(1 - p) * 40}px`, scale: String(s) }} />
```
Helpers in `src/lib/anim.ts`: `enter(frame, delay, dur)`, `pop(frame, fps, delay)`, `exit(frame, total, dur)`.

## GSAP — `src/bridges/useGsapTimeline.ts`
Best for choreography of many elements, labels, position parameters (`"<"`, `"-=0.2"`), SplitText, MorphSVG, MotionPath (all free).
```tsx
const scope = useGsapTimeline<HTMLDivElement>((tl, q) => {
  tl.from(q(".title .char"), { yPercent: 100, stagger: 0.02, duration: 0.5, ease: "power3.out" })
    .from(q(".card"), { scale: 0.8, autoAlpha: 0, stagger: 0.08, ease: "back.out(1.7)" }, "-=0.2")
    .to(q(".card"), { y: -20, repeat: 1, yoyo: true, ease: "sine.inOut" }, "+=0.3");
});
return <div ref={scope}>…</div>;
```
- Times are **seconds of scene time**. Keep total timeline ≤ scene duration.
- Plugins: `gsap.registerPlugin(SplitText, MorphSVGPlugin, MotionPathPlugin)` at module top. SplitText must run inside the build callback (after fonts load — fonts are loaded before render by `src/fonts.ts`).
- Don't use ScrollTrigger, `gsap.ticker`, `repeat: -1` (infinite — use a finite repeat).
- Elements GSAP animates should not also get the same property from React style (GSAP will be overwritten on re-render). Give GSAP-owned props to GSAP only.

## Anime.js v4 — `src/bridges/useAnimeTimeline.ts`
Best for SVG line drawing (`svg.createDrawable`), morphing (`svg.morphTo`), grid staggers (`stagger(50, { grid: [6,4], from: "center" })`).
```tsx
import { stagger, svg } from "animejs";
const scope = useAnimeTimeline<HTMLDivElement>((tl, root) => {
  tl.add(svg.createDrawable(root.querySelectorAll("path")), { draw: ["0 0", "0 1"], duration: 1200, delay: stagger(80), ease: "inOutQuad" })
    .add(root.querySelectorAll(".dot"), { scale: [0, 1], delay: stagger(40, { grid: [8, 4], from: "center" }) }, "-=400");
});
```
- Times are **milliseconds**. `tl.seek(ms)` is called for you.
- v4 API: `createTimeline`, `animate`, `stagger`, `svg`, eases like `"outCubic"`, `"inOutQuad"`, `"outElastic(1, .5)"`.

## Motion — `--with motion` → `src/bridges/motionAt.ts`
Motion's `animate()` / `<motion.div>` run on wall-clock time: **don't use them in renders**. Use the pure generators, sampled at the frame:
```tsx
import { motionSpring, motionKeyframes, motionInertia } from "../bridges/motionAt";
const s = motionSpring(frame, fps, { from: 0, to: 1, delay: 6, bounce: 0.4, visualDuration: 0.5 });
const x = motionKeyframes(frame, fps, { values: [0, 120, 80], duration: 0.8, ease: "easeInOut" });
const flick = motionInertia(frame, fps, { velocity: -300, power: 0.5, min: -200, max: 0, delay: 30 });
```
Use for UI mocks (cards, sheets, lists) where Motion's spring feel matches a real product. `mix`, `mixColor`, `interpolate` from `motion` are also pure and fine to use. Motion AI Kit (`npx motion-ai`) helps with spring tuning and docs search.

## Lottie — `--with lottie` → `LottieScene`
`@remotion/lottie` syncs to the frame. `loop`, `playbackRate`, `direction` props. Load JSON with `delayRender` (done for you).

## dotLottie — `--with dotlottie` → `DotLottieScene`
`new DotLottie({ canvas, src, autoplay:false })` → on `load`, `setFrame((frame/fps) * (totalFrames/duration))`. WASM loaded from `public/wasm`. Use for `.lottie` packages and theming.

## Rive — `--with rive` → `RiveScene`
`new Rive({ autoplay:false, animations:"name" })` → `rive.scrub("name", frame/fps)`. Linear animations only; state machines aren't deterministic.

## Writing a new bridge (pattern)
1. Create the instance in `useLayoutEffect`/`useEffect` with autoplay off; hold `delayRender` until it's loaded, then `continueRender`.
2. In `useLayoutEffect([frame])`, set its time from `frame / fps`.
3. Clean up on unmount (`revert`, `destroy`, `cleanup`).
4. Never rely on the previous frame's state — frames can be rendered in any order. If a library is stateful (physics, particles with integration), **bake** it (see `bake_physics.mjs`) or re-simulate from 0 deterministically.
5. Test: render the same `--frame` twice and compare hashes; render a short range with `--concurrency=4` and look for flicker at chunk boundaries.

## Choosing quickly
- ≤ 3 elements, simple moves → Remotion `interpolate/spring`.
- Many elements with relative timing → GSAP.
- SVG strokes/morph → Anime.js (or GSAP DrawSVG/MorphSVG if already using GSAP).
- "Feels like a real app" → Motion springs.
- Illustrated characters → Lottie/dotLottie (or Rive if the asset is Rive).
