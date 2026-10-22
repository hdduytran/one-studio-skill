# Mapping: metrics -> one-studio fields

`scripts/style-draft.mjs` applies these tables in code (`lib/style-map.mjs`, `lib/style-color-roles.mjs`); change both together. You fill the rest by eye (see reading-guide.md).

## Colour roles (from `color.palette`, drops clusters under 1 % weight)
| Role | Rule |
|---|---|
| `bg` | the cluster flagged `bg` (largest at the frame border) |
| `fg` | highest WCAG contrast against `bg`, at least 4.5:1; otherwise black/white and `guessed` |
| `primary`, `secondary`, `accent` | clusters with OKLCH chroma >= 0.08, ranked by weight x chroma; each at least dE2000 15 from bg, fg and one another; none left means the role is left out |
| `muted` | chroma <= 0.06 and lightness between bg and fg, nearest the middle |

## ASL -> motion
| Condition | `duration` fast / base / slow (s) |
|---|---|
| ASL < 1.2 s | 0.15 / 0.3 / 0.6 |
| 1.2 s to 3 s | 0.25 / 0.5 / 1.0 |
| ASL > 3 s | 0.4 / 0.8 / 1.6 |
| fewer than 2 shots (no cuts) | by motion class: kinetic = row 1, drift = row 2, static = row 3; `guessed` |

| `motion.profile` | `ease` in / out / inOut |
|---|---|
| front-loaded | power2.in / expo.out / power3.inOut |
| even | sine.in / sine.out / sine.inOut |
| back-loaded | power3.in / power2.out / power2.inOut |

`stagger` by `motion.class`: static 0.12, drift 0.08, kinetic 0.04.

## Pacing, transitions, sound effects
- `storyboard.target_shot_seconds` = median shot length (fallback 4 and `guessed` without cuts).
- `transitions.default` = `fade` when fades exist (duration = median fade), `cut` for hard cuts only, `fade` + `guessed` for one long shot. Refine to slide/wipe/zoom/blur from the cuts sheet.
- `sfx_density` by cuts/min: < 3 none, < 12 low, < 30 medium, otherwise high; `none` when the reference has no audio.

## Bed (`audio.music`, from `lib/music.mjs` BUILTIN_BEDS)
Energy = motion class (static 0, drift 1, kinetic 2) + cuts/min tier (< 6: 0, < 20: 1, otherwise 2).
| Energy | Frame luma < 0.35 | 0.35 to 0.6 | >= 0.6 |
|---|---|---|---|
| 0-1 | `ambient` | `ambient` | `ambient-bright` |
| 2-4 | `lofi-dark` | `lofi` | `lofi` |
Written as `{preset, mood, bpm}` of that bed. Only a mood hint: the reference track is never reused.

## Format, mode, tone (by eye, using these hints)
- `writing.format` = `short-vertical` when 9:16 and shorter than 90 s (set by the draft); otherwise `long-form` when the reference runs over 3 minutes, else leave out.
- Visual mode (index of `writers-room/visual-modes/index.md` only): words as the picture -> `kinetic-type`; app UI with zooms -> `screen-cinema`; paper/tape collage -> `desk-collage`; charts moving -> `data-story-motion`; two panels side by side -> `split-compare`; parts flowing through a mechanism -> `exploded-cutaway`; one continuous camera move -> `world-camera`; dated documents and maps -> `archive-documents`; a shape handed between scenes -> `match-cut-motif`. At most 3.
- Tone (ids in `writers-room/tones.md`): plain direct address -> `knowing-friend`; precise, numbers, understated -> `dry-expert`; quick, joking -> `playful`; attributed facts -> `neutral-newsroom`; few words, long pauses -> `cinematic-minimal`.
- `writing.hook`: a short kind label (question, stake, surprising number, claim), never the reference's words.

## Provenance rules
- Key = field path cut at three segments (`brand.colors.primary`, `brand.transitions.default`, `audio.music.bpm`, `storyboard.camera`); every value needs one, and none for absent fields.
- `measured`: a script produced it. `seen`: you read it from a frame (set it when you fill or overwrite a field). `guessed`: a fallback or an inference; add a `note`; list these to the user.
- Overwriting a drafted field by eye: change the value and set its provenance to `seen`.
