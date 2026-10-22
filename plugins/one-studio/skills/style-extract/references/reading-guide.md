# Reading guide: what to look at, what to answer

Inputs: the two sheets, `metrics.json` -> `summary` (+ `speech.hook_text`), and the draft from `style-draft.mjs`. Open each sheet once. Output: fill the open fields, mark them `seen`, then write STYLE.md.

## Sheets have no labels on this machine
Check `sheets.<name>.labelled`. When false, tiles are in `sheets.<name>.cells` order, row by row, `cols` per row.
- `frames`: one tile per entry of `cells` (`#shot time`), spread over the video.
- `cuts`: 3 tiles per cut = before, at, after, in `cells` order (cut 1 first).
Never guess which tile is which from the picture; count.

## When the numbers are weak, trust your eyes more
- `pacing.shots` has 1 shot, or `cuts_per_min` is 0: crossfades or animation in place. Transitions, shot length and motion durations are `guessed`: judge them from the `frames` sheet (how much changes between tiles) and say so.
- Palette has 1 to 2 colours or `bg` and `fg` look alike: the draft's colours are unreliable. Pick roles from the frames; mark them `seen`.
- `sheets.cuts` is null: no transition evidence; leave `transitions.default` as drafted.

## Questions to answer (one line each, in STYLE.md)
1. Type: heading family class (see font-map.md), weight, caps or lower case, tracking (tight, normal, wide), size relative to the frame.
2. Layout: where text sits (centre, left third, lower third), grid or free, how much text per frame (words), margins, frame fill (busy or airy).
3. Surface: `flat` (solid shapes, no blur) or `glass` (frosted, translucent panels, soft shadows).
4. Captions: present? position (`top`/`middle`/`bottom`), size relative to the frame, background (none, box, outline), colour, highlights word by word (note it in STYLE.md only: the caption renderer has no such field, so it never goes into `style.json`).
5. Transitions (cuts sheet): hard cut, fade, slide-left/up, wipe, zoom, blur; same everywhere or varied.
6. Camera and motion: locked, slow push or drift, handheld, fast whip; how things enter (fade, slide, pop, type-on).
7. Visual mode (<= 3) and format: nearest modes in `writers-room/visual-modes/index.md`; hints in mapping.md.
8. Tone and hook: tone id from `tones.md`; hook kind from `hook_text` and the first tile.
9. `do_not_copy`: every logo, mascot, character, slogan, on-screen copy, music or voice seen or heard. Describe it, do not transcribe slogans.

## Rules
- Do not name or guess a commercial font; classify the letterform and use font-map.md. State the pick and the reason to the user; they can change it.
- Write only what you can see. If unsure, set the field `guessed` with a `note`, or leave it out.
- Colours: keep measured hex values. Change one only when a frame clearly shows another (e.g. text colour), and record it as `seen`.
- Describe to the user in plain words, in their language ("nền kem, chữ đen đậm, nhấn đỏ"), not metric names.
- Run `style-draft.mjs D <slug> --check` until only items you accept as guessed remain; show those to the user.
