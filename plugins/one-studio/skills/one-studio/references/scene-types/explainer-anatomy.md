# Scene type: explainer (anatomy isometric figure)

Read `_common.md` first. Use only when the idea is best explained as a real physical machine (anatomy's rule: "the object is the explanation"). Otherwise use `diagram`.

## Steps
1. `node "$S/scripts/check-external.mjs" --tool anatomy` → install only after the user agrees.
2. Read the anatomy `SKILL.md` (workflow + craft rules) and open the ONE closest example (`examples/dial-indicator/` is the smallest). Size `figure` (40–80 parts) unless `explainer.size` is `hero` (2–4 h, already accepted in the estimate).
3. Build the figure in `D/assets/<id>/figure/` with its own `build.mjs` (anatomy's kit), output the standalone page. Name moving parts `<g data-part="…">`. Use the theme from `explainer.theme` (dark default).
4. `node "$S/scripts/new-scene.mjs" D <id>` (explainer template), then
   `node "$S/scripts/anatomy-to-svg.mjs" D/assets/<id>/figure/<page>.html --into D <id> [--theme dark|light]`
   — inlines the figure with its CSS scoped to the figure (keeps `data-part`; never SVGO'd).
5. Animate in the scene timeline (anatomy's own live motion is real-time and is NOT used in video):
   - camera: the template pushes from 1.25× to 1× over 60 % of the scene; add `transformOrigin` on the subject for a focused push-in;
   - parts: `S.enter('[data-part="x"]', …)`, slides `S.tl.fromTo('[data-part="carriage"]', { x: -40 }, { x: 40 }, t)`, rotations with `svgOrigin`;
   - readouts / labels: HTML overlays in `.os-frame` with brand classes, not text inside the drawing.
6. Stills → review as usual. The figure SVG is part of the scene hash, so rebuilding the figure re-renders only this scene.

## Limits
- Per-frame geometry changes (shapes that morph) need several exported poses swapped on the timeline, or keep the motion to rigid parts.
- Big figures (>1 MB SVG) slow the render; prefer `figure` size.
