# screen — a recorded web flow with a cinematic camera

HyperFrames scene (`mode: "screen-cinema"`). A real page is recorded once by `capture-screen.mjs`; the scene plays it in a window/device frame with an auto-zoom camera, a redrawn cursor, click ripples and motion blur. Read `_common.md` first.

## Flow → capture → scene
1. Write `flows/<id>.json` (schema `schemas/flow.schema.json`): `url`, `viewport {width,height,deviceScaleFactor}`, optional `storage_state` (a Playwright-style JSON the user supplies), `steps[]`: `{goto}` `{click: sel}` `{type: sel, text, cps}` `{press: key}` `{scroll: {to|by}}` `{hover: sel}` `{wait: ms|sel}` `{mark: name}`. Put a `mark` before and after each beat the scenes will play.
2. Ask the user's consent once, then set `studio.json → services.capture: true`. Only the flow's own origin is opened. Never type credentials: `type` into a password field is refused; signed-in pages use `storage_state`.
3. `node "$S/scripts/capture-screen.mjs" D <flow-id>` → `capture/<id>/video.mp4` (constant fps) + `events.json`. Re-run only records again when the flow changed; `--recapture` forces it. Dynamic pages differ between takes, so a recording is a fixed asset: re-record on purpose.
4. Storyboard: `{ "type": "screen", "mode": "screen-cinema", "screen": { "flow": "<id>", "from_mark": "a", "to_mark": "b", "frame": "window|device|none", "zoom": "auto|manual", "cursor": { "size": 30, "smooth": 0.5 } } }`, then `new-scene.mjs` and `keyframe-stills.mjs` as usual.

## Rules
- The scene lasts at most the span between its marks (validate.mjs checks it). VO longer than the span: add steps or `wait`s to the flow, never freeze the picture.
- Zoom `auto`: clicks and typing within ~1.2 s share one zoom, each zoom holds ≥ 1.2 s, tiny moves between zooms are ignored. `manual`: no automatic zoom; pass `OS_SCREEN.mount(S, { zooms: [{ at, hold, rect: {x,y,w,h} }] })` (rect in recorded-page px, `at` in scene seconds).
- 9:16 and other ratios recompute the layout and zoom frames themselves; do not hand-place anything over the recording.
- Everything is a pure function of scene time (video via HyperFrames `data-start`/`data-media-start`; no playback calls). Cursor spring and blur are deterministic.
- Sensitive data on screen: record against a test account; the recording is what ships.
