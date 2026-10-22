# Scene authoring — common rules (HyperFrames scenes)

Read once per session before writing the first scene; each type file adds only its own rules.

## Workflow per scene
1. `node "$S/scripts/prepare-project.mjs" D` (once per session and after any brand change).
2. `node "$S/scripts/new-scene.mjs" D <id>` → `scenes/<id>.html` from the type template.
3. Edit only the markup inside `.os-frame` and the `<script>` timeline. Keep the `<head>` and the root `<div>` as generated (it loads howler.js + `audio-cues.js` for the studio SFX preview; renders never play sound).
4. `node "$S/scripts/keyframe-stills.mjs" D <id>` → look at `review/sheet.jpg` yourself first, fix, then show the user.

## Hard rules
- Colours, fonts, sizes: brand variables and `os-*` classes only (`var(--c-accent)`, `.os-h1`, `.os-accent`…). Never a literal hex in a scene.
- Sizes in `calc(N * var(--u))` (1 unit = 1 px at 1080 on the short side) so 9:16 / 1:1 exports work.
- Keep the bottom `--caption-zone` empty (captions are burned there).
- Ratio-specific layout: a `<style data-ratio="9:16">` (or `"1:1,4:5"`) block in `<head>`, comments inside the CSS. It applies only at that ratio and is hashed only for it, so the main ratio's approval and clip stay valid. Keep using `.os-portrait` / `.os-square` selectors inside it if you like.
- Cards: `.os-card` (or `.os-glass`). With `brand.surface: "glass"` they become frosted glass over a brand-colour wallpaper automatically; never link extra CSS for it.
- Deterministic: every tween on the scene timeline via the `OS.scene()` helpers or `S.tl` at an absolute time. No `setTimeout`, `requestAnimationFrame`, `Date.now()`, unseeded `Math.random()`, CSS animations or network fetches.
- Assets local under `assets/` (run `optimize-assets.mjs` after adding SVG/Lottie). No CDN URLs.
- Never edit `data-duration`: the audio step owns it.

## Helper API (`assets/os.js`)
```js
const S = OS.scene("<id>");            // timeline registered for HyperFrames, root gets os-landscape|portrait|square
S.enter(sel, { at, kind: "up|down|left|right|fade|scale|pop", dur, stagger });
S.exit(sel, { at, dur });
S.words(sel, { at, stagger });          // kinetic type, keeps inline <span class="os-accent">
S.count(sel, { at, to, from, decimals, suffix, prefix, separator });
S.draw(sel, { at, dur, stagger });      // SVG stroke reveal
S.bars(nodes, { at });                  // with OS.barChart(container, rows, { label, value, highlight, scale, format, labelFormat })
S.drive(t => render(t), { at, dur });   // per-frame canvas / three.js / custom renderer
S.lottie(sel, window.LOTTIE[name], { loop, speed });
S.lines({ kind, offset });              // reveal every [data-line="s02-2"] when its VO sentence starts (see Pacing)
S.line("s02-2", fallback)               // that sentence's start in scene seconds (for custom tweens)
S.tl                                    // raw GSAP timeline for anything else (absolute positions)
S.camera(from, to, { move, ease, at, dur }) // world scenes: place id or {x,y,zoom}; move cut|push|fly|orbit|follow; dur defaults to the rest of the scene
S.state("beacon", "signal", { at });    // world scenes: switch a world element's data-state (instant, deterministic)
S.done();                               // transitions from data-transition-in/out or brand default — always call last
```

## Visual modes
Staging styles (world camera, match cut, exploded view, desk collage…) live in `writers-room/visual-modes/`; the storyboard `mode`/`world`/`motif` fields point at them. For a hand-made judder (`motion: "stepped-12"`), add `data-motion="stepped-12"` to the scene root and call `S.done()` last: the timeline is sampled at 12 steps/s while the render stays at full fps.

## Pacing
- Hook within 3 s; one idea per scene; text on screen ≤ 12 words at once.
- Reveal text when the VO says it: tag the element `data-line="<line-id>"` (optional `data-enter="up|fade|pop|words"`, `data-at="2.5"` until the VO exists) and call `S.lines()`. build-audio writes the real timings into the scene (`<script id="os-lines">`) without touching its approval. Never edit that block by hand.
- Hold the final state ≥ 1 s before the out-transition.
