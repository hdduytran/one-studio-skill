# split-compare

## Use when
Comparisons, before/after, review verdicts: two things under the same task, the same clock, the same frame.

## Technique
Two halves (side by side in landscape, stacked in portrait) running the same task with one shared timer. Criteria appear one at a time, never the whole table at once. Treat the other side fairly, and show the verdict last. No competitor names or logos without third-party data.

## Storyboard fields
Scene: `type: "diagram"` or `"data"`, `mode: "split-compare"`, `data: [{ label, a, b }]` for the criteria, `lines` one per criterion.

## Build notes
Two columns made with `.os-card`, switched to stacked in a `<style data-ratio="9:16">` block. `S.count` for numbers on both sides with the same duration; `S.bars` for a bar pair; reveal each row with `S.lines()`. A single accent colour marks the winner on each row. Brand variables only; deterministic.

## Traps
- A strawman side: viewers notice, trust drops.
- Different durations or easing on the two sides.
- Whole table on screen at once: nobody reads it.
- Only the good criteria: include one honest weakness.
