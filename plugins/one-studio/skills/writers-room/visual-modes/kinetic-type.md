# kinetic-type

## Use when
Hooks, opinions, key sentences: the words are the picture and move with the voice (stress, pause), not captions made bigger.

## Technique
One short phrase at a time (at most 12 words on screen). Stressed words get the accent colour and a stronger entrance; pauses hold the frame. Reveal by word on the VO timing. Vary scale between a stressed word and its neighbours; keep a single typeface family.

## Storyboard fields
Scene: `type: "text"`, `mode: "kinetic-type"`, lines with `kind: "opinion"` or `"narration"`. Stressed words are marked in the line text with `<span class="os-accent">` in the scene markup.

## Build notes
`S.words(sel, { at, stagger })` on `.os-display` or `.os-h1`; `data-line` plus `S.lines({ kind: "words" })` ties each phrase to its sentence. Type sizes `calc(N * var(--u))`; stay out of the caption zone. Brand fonts and colours only; deterministic.

## Traps
- Animating every word equally: nothing stands out.
- Text still moving when the sentence ends: the viewer cannot finish reading.
- Duplicating the burned-in caption: place kinetic type above the caption zone or turn captions off for the scene.
- Long sentences: split into two phrases across two lines.
