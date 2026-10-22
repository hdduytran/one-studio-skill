# desk-collage

## Use when
News, history, commentary: a desk of cut paper, tape, halftone photos, clippings and highlighted lines, with a human, hand-made feel.

## Technique
Layers of paper cards over a textured brand background; slight rotation, drop shadow, tape strips. Highlights are marker strokes drawn over real text. Items enter with small offsets, not smooth slides. Pair with `motion: "stepped-12"` for the hand-cut judder.

## Storyboard fields
Scene: `mode: "desk-collage"`, `motion: "stepped-12"` (optional), `assets: ["assets/clipping-1.png"]`. Lines of kind `fact` or `quote` carry `source`, shown as a small caption on the item.

## Build notes
Use `.os-card` for paper, `S.enter` with `kind: "pop"` or `"left"`, `S.draw` for marker underlines, `S.lines()` to reveal each item when its sentence starts. For stepped motion set `data-motion="stepped-12"` on the scene root. Screenshots of headlines come from the user or a capture, with the URL as source, never downloaded copyrighted images. Brand variables only; deterministic.

## Traps
- Too many items at once: keep text on screen to 12 words.
- Random rotation with unseeded `Math.random()`: use fixed numbers.
- Stepped motion on text being read makes it hard to follow; keep body text still and step only the paper.
- Fake clippings of real outlets: never invent a headline.
