# exploded-cutaway

## Use when
Mechanisms, products, teardowns: show how parts fit and where something flows through them.

## Technique
Explode the object along one axis, one part per beat, each with one label. Cut away a layer to reveal the path; follow one flowing thing (energy, data, packets) from input to output and keep its colour fixed for the whole video. Slow down at the key moment, end with the whole machine running at normal speed.

## Storyboard fields
Scene: `type: "diagram"` (or `explainer`), `mode: "exploded-cutaway"`, `explainer: { object: "heat pump", size: "hero" }`, `lines` with one part per line.

## Build notes
`S.draw` for the flow path, `S.enter` per part with the part's `data-line` so it appears when named, `S.drive` for a custom flow animation. Flow colour is a brand accent variable. Labels use the brand type classes (`.os-h2` and smaller). Keep every part inside the safe area and above the caption zone. Deterministic.

## Traps
- Naming the object but not the flow: viewers see parts, not how it works.
- Changing the flow colour between scenes.
- Exploding everything at once instead of one part per beat.
- Labels smaller than readable at 9:16.
