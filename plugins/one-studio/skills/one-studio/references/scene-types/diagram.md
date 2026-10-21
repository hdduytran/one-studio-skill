# Scene type: diagram (flows, architecture, how-it-works)

Read `_common.md` first. Template: `templates/scenes/diagram.html`.

- Draw the diagram as inline SVG inside `.os-diagram` with a `viewBox` (≈ 1600×600 landscape; the template scales it). For complex diagrams generate the SVG with `archify` / `ak:diagram` (optional skill, ask first), save under `assets/<id>/`, run `optimize-assets.mjs` (SVGO keeps ids), then paste it inline.
- Style with classes, not colours: `stroke`, `stroke-primary`, `stroke-accent`, `fill-primary`, `fill-accent`, `fill-muted`; text inherits the body font.
- Reveal in reading order: nodes `S.enter(".node", { kind: "pop", stagger })`, connectors `S.draw(".edge", { stagger: 0.3 })`, labels last with `kind: "fade"`.
- One accent element per diagram: the thing the VO is about.
- Max ~7 nodes per scene; split bigger diagrams into two scenes.
