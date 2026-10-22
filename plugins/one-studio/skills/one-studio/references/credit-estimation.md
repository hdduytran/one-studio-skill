# Credit estimation

"Credit" = Claude tokens. Local TTS and rendering cost time, not tokens, and are reported separately.

## When

Run `node "$S/scripts/status.mjs" D --estimate` and show the table:
- gate 4 (first time the storyboard is complete),
- before gate 5 (keyframes), gate 6 (build) and gate 9 (render) when anything changed since the last estimate,
- whenever the user asks "tốn bao nhiêu?".

Scenes already rendered with an approved, unchanged hash show `cached` and cost nothing.

## Model

Per scene to build, by cost level of its type:

| Level | Types | Tokens |
|---|---|---|
| low | text | 2k–4k |
| medium | diagram, data, lottie, rive | 5k–9k |
| high | explainer (figure), character, 3d | 15k–30k |
| — | explainer size `hero` | 40k–80k |

Plus:
- world scenes (`scene.world`): the camera move needs a longer scene (usually 6–10 s) and the world file is written once, so count its tokens once (medium), not per scene; each same-world pair adds a seam snapshot (~5 s of local time) at gate 5,
- `screen` scenes: medium tokens; capture time is real-time, ~30 s per flow (`capture-screen.mjs`), local and free, only after the user's consent,- each reference file loaded once per session: its size / 4 (1.5k when not measurable),
- keyframe review: ~1.6k per scene (one contact-sheet image),
- upper bound × 1.3 for fix-up rounds.

Render time (local, rough): seconds of video × 2.5 (HyperFrames), × 3 (lemo), × 4 (Remotion), + 5 s start-up per scene; seam checks ~5 s per same-world pair; screen capture ~30 s per flow.

## Warnings (⚠) — stop and ask

- more scenes to build than `studio.json → credit.warn_scenes` (default 8),
- a scene type listed in `credit.warn_types` (default 3d, character, explainer),
- an explainer of size `hero`.

## How to cut the cost (offer these)

- Merge short scenes; drop scenes that do not carry a key message.
- Use `text`/`diagram` instead of `explainer`; 2D instead of 3D; `figure` instead of `hero`.
- Reuse a scene file from the same series as a starting point.
- For an edit, change only the scene concerned; never regenerate the whole storyboard.
