# data-story-motion

## Use when
Data stories: a counter-intuitive number, then data moving over time, a pause at the break point, the explanation, back to the big picture.

## Technique
Narration moves in step with the data; time can run, stop and rewind to make a point. One chart, one conclusion, written as the title. Highlight the single bar or point the sentence is about; mute the rest. End on a full frame held long enough to read.

## Storyboard fields
Scene: `type: "data"`, `mode: "data-story-motion"`, `data: [{ year: 2019, value: 12 }, ...]` inline, lines with `kind: "fact"` and `source`.

## Build notes
`OS.barChart(container, rows, { highlight: "max" })` with `S.bars`, `S.count` for the headline number, `S.drive` for a time slider that scrubs the data by scene time. Number format and scale (`linear` or `log`) set explicitly; say so on the chart if log. Brand chart colours only; deterministic.

## Traps
- Truncated axis that exaggerates a change.
- Animating all series at once: viewers do not know where to look.
- Number on screen differs from the spoken one (digits vs `say`).
- Chart finishes and the scene cuts immediately: hold the last state at least 1 s.
