# screen-cinema

## Use when
SaaS demos, devtools, tutorials: a real interface is shown, with the camera zooming to where the action happens.

## Technique
The recorded screen sits in a window or device frame on a brand background. A virtual camera zooms to the click target, holds, and eases out; nearby clicks share one zoom; tiny movements are ignored. The cursor is redrawn smoothly with a ripple on click and motion blur on fast moves. One idea per step.

## Storyboard fields
Scene: `type: "screen"`, `mode: "screen-cinema"`, with a `screen` block naming a flow and the marks to play between, for example `screen: { flow: "signup", from_mark: "open", to_mark: "done" }`. Flows live in `flows/<id>.json`.

## Build notes
Build it with the one-studio `screen` scene type (`../../one-studio/references/scene-types/screen.md`): write `flows/<id>.json` (steps `goto`, `click`, `type`, `press`, `scroll`, `hover`, `wait`, `mark`), get the user's consent and set `services.capture`, run `capture-screen.mjs <project> <flow-id>` (video + `events.json`), then `new-scene.mjs`. The storyboard `screen` block: `flow`, `from_mark`, `to_mark`, `frame` (`window|device|none`), `zoom` (`auto|manual`), `cursor {size, smooth}`. Opening a page is a user-consented action and only the flow's origin is opened; `type` into a password field is refused, so sign-in uses a storage-state file the user supplies. 9:16 recomputes the zoom frames. Brand variables only; deterministic. A recording is a fixed asset: re-record only on purpose (`--recapture`).

## Traps
- Zooming on every cursor wiggle makes viewers seasick; require a minimum hold per zoom.
- Sensitive data on screen (emails, tokens): blur or use a test account.
- Showing every feature: the demo test is that the value still lands without the demo beats.
- Waiting on a slow page in real time: cut the wait in the flow.
