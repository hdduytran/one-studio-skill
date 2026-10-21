# Scene type: character (lemo-opuscar film styles)

Use for a character / mascot / short film moment in one of lemo-opuscar's 51 code-drawn styles. Expensive: one scene, a few seconds, special use only.

## Setup (once per machine, ask first)
`node "$S/scripts/check-external.mjs" --tool lemo` → clone + `npm install` (~350 MB with its browser). Set `ONE_STUDIO_LEMO_LIB` if the library is not at `~/lemo-opuscar`. `PLAYWRIGHT_CHROME=<headless shell>` reuses an installed Chrome.

## Choosing the style
- To help the user pick: list `"$LIB"/styles/*/style.json` names (`en`, `uses`) only. Never read all STYLE.md files.
- Then read `$LIB/DIRECTOR.md` §3–5 and the ONE chosen `$LIB/styles/<slug>/STYLE.md` (`storyboard → character.style`).

## Building the scene
1. `node "$S/scripts/new-scene.mjs" D <id>` → `scenes/<id>/index.html` (lemo page contract) + `brand.js` copy.
2. Rewrite `window.render(t)` to the style: deterministic, draw only from `t`, `window.DUR` set by the template (the audio step updates it), `window.READY = true` after fonts/images load. Use brand colours from `window.BRAND.colors` unless the style demands its own palette (say so to the user).
3. Library helpers are reachable with absolute URLs (`/core/lib.js`, `/node_modules/three/…`) because lemo serves the folder under `/@film/`.
4. Picture only: no TTS, music or mux from lemo — one-studio's audio step owns VO, captions and loudness.
5. Stills and render go through the normal tools (`keyframe-stills.mjs`, `render-changed-scenes.mjs`); the clip is normalised to the project's fps/size/codec so it concatenates with the other scenes.

## Hash
The whole `scenes/<id>/` folder + style + action + duration. Editing the page re-renders only this scene.
