# Animation principles for motion graphics

## The 12 principles, translated to UI/motion-graphics
| Principle | In practice (30fps) |
|---|---|
| Slow in / slow out | never linear for movement; `ease.out` for entrances, `ease.in` for exits |
| Anticipation | 3–6f small move opposite to the main move (scale 1→0.95→1.2) before a big pop |
| Follow-through & overlap | children finish 2–6f after the parent; text settles after its card |
| Staggering | siblings start 2–5f apart; stagger "from center" for grids |
| Arcs | move along curves (GSAP MotionPath, or x linear + y eased differently) |
| Squash & stretch | subtle (≤10%) on bouncy brands only |
| Secondary action | background drift, grain, light sweep — slower and smaller than the main action |
| Timing | fast = energetic (8–12f), slow = premium (20–40f); keep one tempo per video |
| Exaggeration | overshoot springs for playful, critically-damped for serious |
| Staging | one focal point per moment; dim/blur everything else |
| Solid drawing | consistent light direction, shadows, perspective |
| Appeal | rounded corners, consistent radius, generous whitespace |

## Hierarchy of a frame
1. One hero element (biggest, brightest, moving).
2. Supporting text (moves in after the hero, 4–8f later).
3. Ambient layer (background, particles) — always moving slightly so the frame never looks frozen, but low contrast.

## Kinetic typography recipes
- **Word rise** (TitleCard): each word `translateY 0.6em→0`, `blur 12→0`, opacity, stagger 4f.
- **Letter cascade**: GSAP `SplitText` (free now) → `chars`, `from({y:"100%", stagger:0.02})` inside an `overflow:hidden` line mask.
- **Highlight sweep**: a rectangle behind a keyword scales `scaleX 0→1` from left with `ease.inOut`, 10–14f.
- **Counter**: number interpolated with `ease.out` + `tabular-nums` so width doesn't jitter (StatCounter).
- **Slam**: scale 3→1 in 6f with `ease.out` + `impact.wav` + 2–3f camera shake (translate ±6px, seeded).
- **Typewriter**: `text.slice(0, Math.floor(frame / 2))` + blinking caret (`Math.floor(frame/15)%2`).
- Sync to VO: put the keyword's on-screen hit within ±3f of the spoken word (read times off the waveform in Studio or from Whisper word timestamps).

## Transitions catalog
| Transition | When | How |
|---|---|---|
| Cut | same topic, energetic pace | no `transition` |
| Fade (8–15f) | gentle topic change | `fade` |
| Slide / push | sequence/next step | `slide` with direction = reading direction |
| Wipe | reveal / compare | `wipe` |
| Flip | playful card change | `flip` |
| Clock wipe | time-related content | `clockWipe` |
| Match cut | shape in scene A becomes shape in B | end A on a shape, start B with the same shape at the same position/scale |
| Zoom-through | dive into detail | scale the outgoing scene up 1→4 + fade, incoming from 0.6→1 |
| Mask reveal | premium | `clipPath: circle(r% at x y)` driven by frame |

Rules: max 2–3 transition types per video; transition length ≤ ¼ of the shorter neighboring scene; put a whoosh on slides/zooms only.

## Camera
Even 2D scenes feel alive with a slow camera: wrap the scene in a div with `scale 1→1.05` over the scene (`ImageFocus`) or parallax layers (background moves 0.3×, midground 0.6×, foreground 1×).

## Pacing checklist
- Something changes on screen at least every ~1.5–2s (new element, camera move, color change).
- Important text holds ≥ reading time (0.3s/word + 1s).
- Last 0.5s of a scene is quieter (lets the transition breathe).
- The CTA holds still for ≥ 2.5s (no busy motion behind it).
