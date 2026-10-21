# Scene types: lottie, rive

Read `_common.md` first.

## Lottie (verified)
- Put the `.json` or `.lottie` file in `assets/`, list it in the scene's `assets` in storyboard.json, run `optimize-assets.mjs` → `assets/lottie/<name>.js` (`window.LOTTIE[name]`, loaded synchronously).
- Template `templates/scenes/lottie.html` loads `assets/vendor/lottie.min.js` (lottie-web SVG renderer, vendored by prepare-project) and drives frames from scene time: `S.lottie("#anim", window.LOTTIE.name, { loop: true, speed: 1 })`. Never `autoplay`.
- Lottie colours are baked in; prefer animations in brand colours or recolour the JSON (`c.k` arrays are 0–1 RGBA).
- Sources: the user's files or LottieFiles (check the licence; ask before downloading).

## Rive (not verified yet — test on the user's machine first)
- Needs `@rive-app/canvas` (wasm). Load the runtime and `.riv` from `assets/` (no CDN), create the instance with `autoplay: false`, then advance deterministically: `S.drive(t => { r.advance? … })` setting the state-machine/animation time to `t`.
- If deterministic seeking is not possible with the installed runtime, render the Rive animation once to a PNG sequence/WebM outside the scene and use it as a video asset instead.
