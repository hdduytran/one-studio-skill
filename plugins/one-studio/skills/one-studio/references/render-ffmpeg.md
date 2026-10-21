# Rendering, review and assembly

## Incremental render model
- Scene hash = scene source + every local file it references (CSS, fonts, JS, SVG, Lottie) + brand version + engine version + width/height/fps. VO and captions are not in it.
- Clips: `out/preview/<id>-<hash>.mp4` (low-res) and `out/scenes/<id>-<hash>.mp4` (final). A clip that exists for the current hash is never rendered again; old hashes of the same scene are deleted.
- A scene renders only if its keyframes were approved for that exact hash (`studio.json → scenes[].approved_hash`). Editing a scene clears that, so the user sees a new still first.
- Every clip is normalised to one encode (H.264 high, yuv420p, project fps/size, timescale 15360, no audio), so the concat is a stream copy.

## Commands
| Step | Command |
|---|---|
| stills + contact sheet (changed scenes) | `keyframe-stills.mjs D [ids] [--all]` → `review/sheet.jpg` |
| approve stills | `status.mjs D --approve-scenes s01,s03` (or `all`) |
| what would render | `render-changed-scenes.mjs D [--preview] --dry-run` |
| render | `render-changed-scenes.mjs D [--preview]` (exit 2 = some scenes blocked) |
| assemble | `concat-and-mix.mjs D [--preview]` → `out/<name>[-preview].mp4` + `.srt` |

## Before showing a render to the user
- Read the printed summary: duration ≈ storyboard total, size/fps right, loudness ≈ −14 LUFS when there is audio.
- Gate 8 shows the preview; gate 9 renders final clips for every scene (they share the approval, so no new review) and assembles again.

## Brand change
Changing `brand.json` changes every scene hash. Before doing it, run `render-changed-scenes.mjs D --dry-run` after `prepare-project.mjs` to show how many scenes will need review and render, and ask. Reverting the change restores the cache.

## Troubleshooting
- `sub_timeline_script_failure`: a script came from the network. Use `assets/vendor/…`.
- Chrome not found: `npx hyperframes@0.8.181 browser ensure` or `HYPERFRAMES_BROWSER_PATH`.
- Clip QA mismatch: concat-and-mix re-normalises automatically; if it persists, delete that clip and render again.
