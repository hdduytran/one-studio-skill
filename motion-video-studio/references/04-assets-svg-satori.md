# Assets: SVG, Satori cards, Lottie, Rive, images, 3D

All assets go in `public/` and are referenced by path (`"svg/logo.svg"`). Never hot-link at render time.

## SVG → SVGO
```bash
bash <skill>/scripts/optimize_svgs.sh raw-svgs/ my-video/public/svg/
```
Uses `assets/svgo.config.mjs`: keeps ids (animation targets), doesn't merge paths (each stroke can be staggered), keeps groups and primitive shapes, drops width/height so CSS sizes it, keeps viewBox. Typical saving 30–60%.

Prep tips for designers' SVGs:
- Outline strokes **not** converted to fills if you want draw-on animation (needs `stroke`).
- Name layers in Illustrator/Figma → they become ids.
- Text → outlines (fonts won't exist at render).
- Use with `SvgReveal` (draw-on + fill), or inline the markup into a custom component and animate parts with GSAP/Anime by id.

## Satori cards (thumbnails, title cards, lower-thirds, quotes)
```bash
cd my-video && npm i -D satori@0.63.2 @resvg/resvg-js@2.6.2 @fontsource/inter@5.3.0
node <skill>/scripts/render_cards.mjs . cards.json      # → public/cards/<name>.{svg,png}
```
`cards.json`:
```json
{ "theme": { "colors": { "accent": "#FACC15" } },
  "cards": [
    { "name": "thumb", "template": "thumbnail", "props": { "kicker": "Hướng dẫn", "title": "Làm video motion từ A đến Z", "badge": "MỚI" } },
    { "name": "lt-host", "template": "lowerThird", "props": { "name": "Nguyễn Văn An", "role": "Host" } },
    { "name": "q1", "template": "quote", "width": 1080, "height": 1350, "props": { "quote": "…", "author": "…" } }
  ] }
```
Templates: `thumbnail` (1280×720), `title` (1920×1080), `lowerThird` (transparent 1920×1080), `quote` (1080×1080). Add new templates in the script with the `h(type, style, ...children)` helper.

Satori gotchas (all handled in the script, remember them when adding templates):
- Fonts must be TTF/OTF/WOFF — **not WOFF2**.
- Fontsource ships subsets; give each subset its own family name and set `fontFamily: "A, B, C"` as a fallback chain or Vietnamese diacritics render as NO GLYPH boxes.
- Every element is flexbox; text that must wrap needs an explicit `width` + `flexWrap: "wrap"`.
- Padding on the root element **adds** to its size — position inner boxes absolutely instead.
- Use cases inside the video: lower-third PNG overlaid with `<Img>`; data-driven cards for 50 product variants; YouTube thumbnail that matches the video exactly.

## Images & screenshots
- Put PNG/JPG/WebP in `public/images/`. Use ≥ the frame size (2× for zooms).
- App screenshots: wrap in a device frame component or a rounded `surface` card with shadow; animate a slow push (`ImageFocus`) or scroll (translate a tall screenshot).

## Lottie (`--with lottie`)
- `.json` from After Effects (Bodymovin) or LottieFiles → `public/lottie/`.
- Avoid expressions and effects Bodymovin can't export; check in the LottieFiles preview first.
- Recolor: edit fill colors in the JSON (search `"c":{"a":0,"k":[r,g,b,1]}`, values 0–1) or use dotLottie themes.
- The animation's own fps doesn't need to match the video — `@remotion/lottie` maps time.

## dotLottie (`--with dotlottie`)
- `.lottie` (zipped, can hold several animations + themes) or `.json`.
- Renders on canvas through a WASM player; init copies `dotlottie-player.wasm` into `public/wasm/` — `DotLottie.setWasmUrl(staticFile(...))` prevents a CDN fetch.

## Rive (`--with rive`)
- `.riv` → `public/rive/`. You need the **name of a timeline animation** (Rive editor → Animations list). State machines are input-driven and not frame-seekable — ask for a timeline export.
- WASM is copied to `public/wasm/rive.wasm` and loaded via `RuntimeLoader.setWasmUrl`.

## 3D models (`--with three`)
- glTF/GLB → `public/models/`. Compress with `npx gltf-transform optimize in.glb out.glb --texture-compress webp`.
- Load with Drei `useGLTF(staticFile("models/x.glb"))` inside `<Suspense>`; Remotion waits for Suspense in `<ThreeCanvas>`.
- See `07-3d-r3f.md`.

## Licences
Track every third-party asset (music, SFX, Lottie, fonts, images) in `brief.md` with its licence. Prefer: own work, CC0, or the user's licensed library.
