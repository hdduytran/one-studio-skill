# Rendering, review and assembly

## Incremental render model
- Scene hash = scene source + every local file it references (CSS, fonts, JS, SVG, Lottie) + brand version + engine version + width/height/fps. VO, captions and sound files (`assets/sfx/`, `assets/music/`, `assets/audio-cues.js`) are not in it.
- `<style data-ratio="9:16,4:5">` blocks count only for those ratios: the main hash skips them, the export ratio's variant hash includes them. Put each block on its own lines; comments go inside the CSS.
- Every snapshot and render is staged per ratio with the other ratios' blocks removed (`stripRatioStyles`). Removal is the guarantee, not os.js: HyperFrames merges adjacent `<style>` blocks when it loads a scene and drops `data-ratio`, so a runtime switch-off cannot hold. Projects created before this (no `render.ratio_stage` in `studio.json`) re-make stills and clips of scenes with ratio blocks once. Scoping rules with `.os-portrait` / `.os-square` inside the block is still allowed.
- Gates 5–6 compare a layout-only hash (no `data-duration`, no `os-lines` timings), so build-audio fitting scenes to the VO never re-opens them; clips are still re-rendered because the full hash changed.
- Clips: `out/preview/<id>-<hash>.mp4` (low-res) and `out/scenes/<id>-<hash>.mp4` (final). A clip that exists for the current hash is never rendered again; old hashes of the same scene are deleted.
- A scene renders only if its keyframes were approved for that exact hash (`studio.json → scenes[].approved_hash`). Editing a scene clears that, so the user sees a new still first.
- Every clip is normalised to one encode (H.264 high, yuv420p, project fps/size, timescale 15360, no audio), so the concat is a stream copy.

## Commands
| Step | Command |
|---|---|
| stills + contact sheet (changed scenes) | `keyframe-stills.mjs D [ids] [--all] [--ratios 9:16 \| --no-exports]` → `review/sheet.jpg`, `review/sheet-<ratio>.jpg` |
| approve stills | `status.mjs D --approve-scenes s01,s03` (or `all`) |
| what would render | `render-changed-scenes.mjs D [--preview] --dry-run` |
| render | `render-changed-scenes.mjs D [--preview]` (exit 2 = some scenes blocked) |
| assemble | `concat-and-mix.mjs D [--preview]` → `out/<name>[-preview].mp4` + `.srt` (VO + music + SFX, captions per mode) |
| brand presets side by side | `compare-presets.mjs D [--presets a,b] [--scenes s01,s02]` → `review/presets.jpg`; `--apply <preset>` |

## Before showing a render to the user
- Read the printed summary: duration ≈ storyboard total, size/fps right, loudness ≈ −14 LUFS when there is audio.
- Gate 8 shows the preview; gate 9 renders final clips for every scene (they share the approval, so no new review) and assembles again.

## Brand change
Changing `brand.json` changes every scene hash. Before doing it, run `render-changed-scenes.mjs D --dry-run` after `prepare-project.mjs` to show how many scenes will need review and render, and ask. Reverting the change restores the cache.

## Troubleshooting
- `sub_timeline_script_failure`: a script came from the network. Use `assets/vendor/…`.
- Chrome not found: `npx hyperframes@0.8.181 browser ensure` or `HYPERFRAMES_BROWSER_PATH`.
- Clip QA mismatch: concat-and-mix re-normalises automatically; if it persists, delete that clip and render again.
- FFmpeg without `drawtext` (Homebrew FFmpeg 8 core has no freetype): contact sheets are built without labels (tiles in storyboard order). Without libass (`subtitles` filter): `burn` captions are delivered as `mux`. `check-external.mjs` reports both.
