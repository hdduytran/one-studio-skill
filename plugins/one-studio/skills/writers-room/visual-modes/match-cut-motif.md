# match-cut-motif

## Use when
Any genre where scene N hands a shape, colour or motion to scene N+1 (a logo circle becomes a wheel), or one object runs through the whole video and changes state (crumpled invoice, then flat).

## Technique
Cut at the peak of the motion. The last frame of N and the first frame of N+1 share the element at the same position and size, even though everything else changes. A motif keeps one selector and one visual identity; only its state changes across scenes.

## Storyboard fields
Root: `motifs: [{ id: "invoice", selector: "#motif-invoice", note: "crumpled to flat" }]`.
Scene: `mode: "match-cut-motif"`, `motif: ["invoice"]`, `handoff: { selector: "#motif-invoice", to_scene: "s04" }`. `to_scene` must be the next scene.

## Build notes
Give the element the same selector in both scenes and place it from the same numbers (a shared `--` variable in brand.css or the same `calc` expression). Start scene N+1 with the element already in place, then animate away from it. Set `data-transition-in="cut"` and `data-transition-out="cut"` on both roots. `keyframe-stills` and `seam-check.mjs` put the last frame of N next to the first of N+1 in `review/seams.jpg` with their pixel difference; for a handoff the difference is informational (the motif's box is not measured), so judge the match by eye. Brand variables only; deterministic.

## Traps
- Element is close but not identical: reads as a glitch, not a match. Share the numbers.
- A fade over the match cut hides the match.
- Motif used in every scene: it stops meaning anything. Pick 2-4 moments.
- Handoff to a scene that is not next: the validator rejects it.
