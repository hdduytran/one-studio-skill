# Design system & style frames

## Tokens
Colors live in `storyboard.json → theme.colors` (merged over defaults in `src/theme.tsx`):

| token | role | rule of thumb |
|---|---|---|
| `bg` | frame background | dark or very light; ≥ 7:1 contrast with `text` |
| `surface` | cards, panels, lower-thirds | 4–8% lighter/darker than bg |
| `primary` | brand color, main shapes | used on ~20% of the frame |
| `accent` | highlights, CTA, numbers | used sparingly (≤10%) — draws the eye |
| `text` | headings/body | near-white/near-black, never pure #000 on #fff |
| `muted` | secondary text | ≥ 4.5:1 with bg |

Pick a palette from the brand; if none, offer 2 options (e.g. "dark tech": `#0B1020/#6C8CFF/#FFB547`, "clean light": `#F7F7F2/#1F6FEB/#FF6B35`).

## Type
- `type(theme)` in `src/theme.tsx` scales from the frame's **short side**, so the same scene works at 16:9 and 9:16: display 10%, h1 7.5%, h2 5%, body 3.5%, caption 2.6%.
- Max 2 weights per video (e.g. 600 + 800). Max ~7 words per line on screen; ~3 lines max.
- Letter-spacing: tight (-0.02em) for big headlines, wide (0.2–0.3em) for small all-caps kickers.
- **Brand font**: put `.woff2/.ttf` in `public/fonts/` and in `src/fonts.ts`:
  ```ts
  import { loadFont } from "@remotion/fonts";
  import { staticFile } from "remotion";
  loadFont({ family: "Brand", url: staticFile("fonts/Brand-Bold.woff2"), weight: "700" });
  export const FONT_FAMILY = "Brand";
  ```
  Check it covers the language (Vietnamese needs ơ ư ạ ẫ …). Good Vietnamese-safe families: Inter, Be Vietnam Pro, Montserrat, Roboto, Nunito, Lexend. Fontsource packages (`@fontsource/<name>`) bundle them offline.
- Never load fonts from Google at render time in locked-down environments — bundle them.

## Layout & safe areas
- `safe(width,height)` = 6% margins. `Stage` keeps content inside it.
- **9:16 platform UI** covers the bottom ~20% (caption, buttons) and the right ~12% (like/share). Keep key text in the middle 60% vertically; captions sit above the bottom 20% (the template's `Captions` does this).
- 1:1 / 4:5 feed: center-weighted; text ≤ 70% width.
- Design for 9:16 and 16:9 separately when both are needed: same storyboard, but check each with `--props='{"aspect":"9:16"}'` stills. Use `useVideoConfig()` `width > height` to switch layouts (row vs column) inside a scene.

## Motion language (part of the design system)
Use the house easings in `theme.tsx → ease` everywhere:
- `ease.out` (0.16,1,0.3,1) — entrances (fast start, soft landing)
- `ease.in` — exits
- `ease.inOut` — on-screen moves
- `ease.overshoot` — playful pops (brand-dependent: avoid for premium/serious)

Durations at 30fps: micro 6–10f, standard 12–20f, big moves 20–40f. Stagger 2–5f between siblings. Keep one consistent rhythm through the video.

## Style frames ◆
Before animating everything, render 2–3 hero frames:
```bash
npx remotion still Main out/style-1.png --frame=45
npx remotion still Main out/style-2.png --frame=200 --props='{"aspect":"9:16"}'
```
Look at them (open the PNG) and check: hierarchy readable in 1 second? contrast? brand feel? safe areas? Then show the user. Changing colors/fonts here costs nothing; after animation it's still cheap because everything reads tokens — but layout changes get expensive.
