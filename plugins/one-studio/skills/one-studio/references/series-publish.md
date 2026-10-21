# Series and publishing

## Series
- `init-project.mjs <dir> --series <name>` keeps the brand kit in `<series-root>/<name>/brand/` (default series root: the project's parent folder + `/series`) and lists episodes in `series.json`.
- A new episode reuses, without asking: brand kit (colours, fonts, logo, captions style, voice preset), the previous episode's language, aspect ratio and exports, TTS endpoints and TTS consent, render and credit settings. Flags override any of them.
- Series intro/outro: build the scene once in an episode (brand assets only), get it approved, then `series-bumper.mjs <project> <scene-id> --as intro|outro`. Every later episode starts/ends with it (`scenes/intro.html`, `scenes/outro.html`, first/last in the storyboard). `{{title}}` and `{{episode}}` in the template are filled per episode.
- Changing the series brand affects every episode that re-renders afterwards; bump `version` and say so.

## Publish (gate 10)
`node "$S/scripts/publish.mjs" D [--ratios 9:16,1:1] [--thumb-title "…"] [--thumb-subtitle "…"]`
- Needs a current final render (gate 9). Ratios default to `studio.json → format.exports`.
- Each extra ratio re-renders every scene from the same sources at the new size (HyperFrames and lemo re-layout; `.os-portrait` / `.os-square` classes let scenes adapt), cached per scene and ratio in `out/<ratio>/scenes/`. Remotion scenes are fitted from their main clip over a blurred copy.
- Audio and captions are shared; portrait captions are 1.35× larger.
- Look at `out/<ratio>/sheet.jpg` (one frame per scene) before telling the user it is done; fix scenes that do not fit (usually wide diagrams) with `.os-portrait` CSS in that scene.
- Thumbnails: `out/<name>-thumb-<ratio>.jpg`, brand title card (accent bar, title, series · episode, logo).
- `out/manifest.json`: every video (ratio, size, duration, LUFS, bytes, sha256), thumbnails, captions, scene hashes, audio hash.
