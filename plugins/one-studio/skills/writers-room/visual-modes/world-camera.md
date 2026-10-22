# world-camera

## Use when
Concepts, scale, systems, timelines: the beats are places in one big picture and the camera travels between them, so the video feels like one shot.

## Technique
One shared canvas larger than the frame; each scene is a camera move inside it. Adjacent scenes in the same world continue exactly: the camera `to` of scene N equals the camera `from` of scene N+1, element states carry over, and the transition between them is `cut`. Infinite zoom: nest layers and scale on a log curve so zoom speed looks even. Show only places near the camera.

## Storyboard fields
Root: `worlds: { city: { file: "worlds/city.html", size: { w: 4000, h: 2400 } } }`.
Scene: `mode: "world-camera"`, `world: "city"`, `camera: { from: "downtown", to: { x: 1200, y: 800, zoom: 2 }, move: "fly", ease, at, dur }`, `exit_state: { satellite: "signal" }`, optional `enter_state`. `from`/`to` are a place id or `{x, y, zoom}`; `move` is cut, push, fly, orbit or follow. Without `dur` the move spans the scene.

## Build notes
- `new-scene` copies `templates/worlds/basic.html` to `worlds/<name>.html` when the file is missing (never overwrites it), and gives each world scene a `<link rel="x-world">` plus an `.os-world` layer; `os.js` fills it, so editing the world re-renders every scene that uses it. Edit the world file: places are `data-place="id"` elements in world units (1 unit = 1px, brand variables only, no CSS transitions), variants are `data-state` attributes styled with `[data-state="x"]`.
- Camera: `S.camera(from, to, { move, ease, at, dur })` with a place id or `{x, y, zoom}`; zoom 1 = the whole world fits the frame, a place fills 90% of the frame on its tighter axis, so 16:9, 9:16 and 1:1 need no extra CSS. Zoom runs on a log scale (even speed), `dur` defaults to the rest of the scene so VO-fitted scenes stretch, and the last frame holds `to` exactly. If you do not call it, the storyboard `camera` runs on its own.
- State: `S.state("beacon", "signal", { at })`. A scene starts in the previous same-world scene's `exit_state` (or its own `enter_state`) and `exit_state` ids you did not switch change half a second before the end.
- Continuity is checked: `camera.to` of N equals `camera.from` of N+1 (same form: place id, or the same numbers), `exit_state` equals the next `enter_state`; transitions between them are `cut`. `seam-check.mjs` compares the real frames (gate 5 runs it).
- Brand variables only; deterministic.

## Traps
- Camera ends where the next scene does not start: seam-check fails, the viewer sees a jump.
- Two scenes in one world with a fade between them: use `cut`.
- Huge world, every place rendered: slow renders; keep far places simple.
- Moving the camera while text is being read: hold still on the reading beat.
