# Scene authoring — common rules (HyperFrames scenes)

Read once per session before writing the first scene; each type file adds only its own rules.

## Workflow per scene
1. `node "$S/scripts/prepare-project.mjs" D` (once per session and after any brand change).
2. `node "$S/scripts/new-scene.mjs" D <id>` → `scenes/<id>.html` from the type template.
3. Edit only the markup inside `.os-frame` and the `<script>` timeline. Keep the `<head>` and the root `<div>` as generated.
4. `node "$S/scripts/keyframe-stills.mjs" D <id>` → look at `review/sheet.jpg` yourself first, fix, then show the user.

## Hard rules
- Colours, fonts, sizes: brand variables and `os-*` classes only (`var(--c-accent)`, `.os-h1`, `.os-accent`…). Never a literal hex in a scene.
- Sizes in `calc(N * var(--u))` (1 unit = 1 px at 1080 on the short side) so 9:16 / 1:1 exports work.
- Keep the bottom `--caption-zone` empty (captions are burned there).
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
S.tl                                    // raw GSAP timeline for anything else (absolute positions)
S.done();                               // transitions from data-transition-in/out or brand default — always call last
```

## Pacing
- Hook within 3 s; one idea per scene; text on screen ≤ 12 words at once.
- Reveal text when the VO says it: line timings come from `audio/manifest.json` (`scenes[].lines[].start`, scene-relative) after gate 7; before that, space reveals ~2.5 s per sentence.
- Hold the final state ≥ 1 s before the out-transition.
