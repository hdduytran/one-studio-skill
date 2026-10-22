# Font map: letterform class -> Fontsource font

Never name or ship a commercial font. Classify the letterforms you see, pick the row, write `{family, weight, fontsource, fallback}` into `brand.typography.*` (provenance `seen`), and tell the user the class, the chosen font and why.

`Subset` is the check that the package ships a `vietnamese` @font-face (needed for full Vietnamese diacritics):
- `verified`: the `vietnamese` blocks were found in the cached package (`$ONE_STUDIO_CACHE/npm/@fontsource+<name>@<version>`).
- `unverified`: believed to ship it but not checked offline. Before using, vendor it (`vendorFontsource`, existing path) and confirm `vietnamese` appears in the generated CSS; if not, take a verified row instead. Say "unverified" to the user.
- A `-` pin means no version is pinned yet: pin the current Fontsource version the first time it is vendored, never guess one.

| Class | Family | Fontsource spec | Subset | Weights | Fallback | Pick when |
|---|---|---|---|---|---|---|
| geometric sans | Be Vietnam Pro | `be-vietnam-pro@5.3.0` | verified | 400 500 700 800 | `system-ui, sans-serif` | round bowls, friendly, heavy headings; best default for Vietnamese |
| geometric sans (wide) | Montserrat | `montserrat@-` | unverified | 400 600 700 800 | `system-ui, sans-serif` | wide caps, tech or finance headlines |
| grotesk / neutral sans | Inter | `inter@5.2.8` | verified | 400 500 700 800 | `Helvetica, Arial, sans-serif` | plain UI, Swiss, news |
| display serif | Fraunces | `fraunces@5.3.0` | unverified | 400 700 | `Georgia, serif` | editorial, warm, high-contrast serif |
| display serif (classic) | Playfair Display | `playfair-display@-` | unverified | 400 700 | `Georgia, serif` | fashion, luxury, thin hairlines |
| mono | JetBrains Mono | `jetbrains-mono@5.3.0` | unverified | 400 500 700 | `ui-monospace, monospace` | code, terminal, data labels |
| rounded sans | Nunito | `nunito@-` | unverified | 400 700 800 | `system-ui, sans-serif` | soft, kids, casual apps |
| handwriting | Patrick Hand | `patrick-hand@-` | unverified | 400 | `cursive` | whiteboard notes, marker text |

## Choosing
- Heading and body may differ; two families at most. Use the heavier weight seen for headings (800 for fat display, 700 bold, 500 medium).
- All caps, tracking and case are not font properties: note them in STYLE.md; they do not change the row.
- Condensed or script faces with no row: choose the nearest class, say it is an approximation, add the real look to STYLE.md.
- The family used in `brand.captions.font` is the body family name only (the Fontsource entry lives in `brand.typography`).
