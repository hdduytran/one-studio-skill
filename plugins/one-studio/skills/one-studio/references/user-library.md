# User library

One folder, shared by every project, for what the user wants to keep: looks (presets), mockup kits and story structures (playbooks). The plugin's own presets and playbooks are never changed.

```
<library>/
  presets/<name>.json        brand presets (same shape as templates/brand-presets.json)
  kits/<kit>/kit.css         component styles, brand variables only
  kits/<kit>/components/*.html   markup snippets, first line <!-- title -->
  kits/<kit>/kit.json        optional { "about", "preset" } (preset styles the gallery)
  kits/<kit>/gallery.html    every component on one page (generated)
  playbooks/<id>.md          writers-room playbooks, same nine sections as the built-in ones
```

## Where it is

First match wins:
1. `ONE_STUDIO_LIBRARY=<folder>`.
2. Walking up from the project: a `one-studio.library.json` (`{ "path": "<folder>" }`, relative to the file; default its own folder) or a folder named exactly `library` holding `presets/`, `kits/` or `playbooks/` (same idea as the series root `../series`).
3. The cache `${ONE_STUDIO_CACHE:-~/.cache/one-studio}`, where presets were saved before the library existed.

The cache's `presets/` is always read after the library (a symlink there keeps working); on a name clash the library wins, and a plugin preset name always wins. `library.mjs <dir>` prints which library a project sees.

## Commands

| Command | Does |
|---|---|
| `library.mjs --init <folder>` | creates `presets/`, `kits/`, `playbooks/` |
| `library.mjs D [--presets \| --kits \| --playbooks]` | where the library is; what it holds |
| `library.mjs D --save-preset <name> [--about "…"]` | the project's current look (colours incl. surface, fonts, motion, captions…) as a preset, no style re-apply |
| `style-apply.mjs D <slug> --as-preset <name>` | an extracted style as a preset |
| `library.mjs D --import-cache` | copies presets saved in the cache into the library (never overwrites) |
| `init-project.mjs D --preset <name>`, `compare-presets.mjs D` | use library presets like plugin ones (`init-project --help` lists them) |
| `new-scene.mjs D <id> --kit <kit> [--component <name>]` | copies `kit.css` into the scene as `<style data-kit="<kit>">`; `--component` starts the scene from that snippet (`templates/scenes/kit.html`) |
| `new-scene.mjs D <id> --kit <kit>` on an existing scene | refreshes only that block (the scene re-opens for review) |
| `library.mjs D --kit-gallery <kit>` | `review/kit-<kit>.html` with the project's brand; without a project, `<kit>/gallery.html` with the kit's preset |

## Rules

- Kits use brand variables only (`var(--c-*)`, `var(--font-*)`, sizes as `calc(N * var(--u))`); `--kits` and `validate.mjs` flag literal colours. Panels use `var(--c-surface)` (the brand's optional card colour) with a fallback.
- A scene keeps its own copy of the kit CSS, so it renders the same on a machine without the library, and the kit is part of the scene hash. `validate.mjs` warns when a scene's copy is older than the library's kit.
- A library playbook whose id is built in is skipped; pick another id. Put a `Signals:` line under `## Use when` so it can be matched to requests.
- Seeded example: `examples/library/` (the Claude Duet look, its nine-component kit and the `product-launch-short` playbook).
