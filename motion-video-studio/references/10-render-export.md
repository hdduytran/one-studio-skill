# Render, export & QA

## Remotion render commands
```bash
npx remotion studio                                         # live preview, scrub, edit props
npx remotion still Main out/f.png --frame=120               # single frame (style frames, QA)
npx remotion render Main out/draft.mp4 --scale=0.5          # fast animatic (scale must give integer size)
npx remotion render Main out/master.mp4 --codec=h264 --crf=18
npx remotion render Main out/vertical.mp4 --props='{"aspect":"9:16"}'   # same storyboard, native 9:16
npx remotion render Main out/part.mp4 --frames=120-240      # re-render a range while iterating
```
Useful flags: `--concurrency=N` (default ~half the cores; lower it if memory is tight), `--gl=angle|swangle|egl` (3D), `--log=verbose` (debug delayRender timeouts), `--timeout=60000` (slow asset loads), `--muted`, `--audio-bitrate=192k`, `--pixel-format=yuv420p` (default, max compatibility).

Codecs: `h264` (default MP4), `h265` (smaller, less compatible), `vp9` (WebM), `prores --prores-profile=4444` (+ `--image-format=png --pixel-format=yuva444p10le`) for **transparent** overlays to hand to editors, `gif` (short loops).

Scale up: Remotion Lambda / Cloud Run for long or batch renders (`npx remotion lambda render …`) — needs the user's cloud account; ask first.

Environment: no Chrome download possible → `REMOTION_BROWSER=/path/to/chrome-headless-shell npx remotion render …` (read by `remotion.config.ts`).

## Platform presets
| Platform | Aspect | Size | fps | Length | Notes |
|---|---|---|---|---|---|
| YouTube | 16:9 | 1920×1080 (or 3840×2160) | 30/60 | any | thumbnail 1280×720 (Satori), chapters in description |
| YouTube Shorts | 9:16 | 1080×1920 | 30/60 | ≤ 60s (≤3 min allowed) | hook < 1s, captions |
| TikTok | 9:16 | 1080×1920 | 30 | 15–60s sweet spot | keep text out of bottom 20% / right 12% |
| Instagram Reels | 9:16 | 1080×1920 | 30 | ≤ 90s | cover frame = thumbnail |
| Instagram/Facebook feed | 4:5 or 1:1 | 1080×1350 / 1080×1080 | 30 | ≤ 60s | captions |
| LinkedIn | 1:1 or 16:9 | 1080×1080 / 1920×1080 | 30 | 30–90s | captions mandatory (muted autoplay) |
| Website hero loop | 16:9 | 1920×1080 | 30 | 6–15s loop, no audio | `--muted`, WebM + MP4, poster image |

Native re-render per aspect beats cropping. `post_export.sh --reframe` (blurred background) is the fallback when there's no time to re-layout.

## Post-production — `scripts/post_export.sh`
```bash
bash <skill>/scripts/post_export.sh out/master.mp4 --srt subs.srt --reframe 9:16,1:1 --thumb 2.5 --gif --webm
```
Produces in `out/export/`: `master-web.mp4` (two-pass loudnorm to -14 LUFS, TP -1.5, AAC 192k, faststart), `master-subs.mp4` + `master.srt`, `master-9x16.mp4`, `master-1x1.mp4`, `master-thumb.jpg`, `master-preview.gif`, `master.webm`.

## Other FFmpeg recipes
```bash
# Compress for messaging apps (~8 MB / 30s)
ffmpeg -i in.mp4 -c:v libx264 -crf 26 -preset slow -vf "scale=-2:720" -c:a aac -b:a 96k -movflags +faststart small.mp4
# Seamless web loop (no audio)
ffmpeg -i in.mp4 -an -c:v libx264 -crf 22 -movflags +faststart loop.mp4
# Mix an external music track under an existing video, ducked by the VO (sidechain)
ffmpeg -i video.mp4 -i music.mp3 -filter_complex "[1:a]volume=0.5[m];[m][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[d];[0:a][d]amix=inputs=2:normalize=0[a]" -map 0:v -map "[a]" -c:v copy -c:a aac out.mp4
# Concatenate renders with identical codecs
printf "file 'a.mp4'\nfile 'b.mp4'\n" > list.txt && ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4
# Extract contact sheet for review
ffmpeg -i in.mp4 -vf "fps=1/2,scale=480:-1,tile=4x3" -frames:v 1 sheet.png
```

## Mediabunny (browser or Node)
- Probing durations/metadata: `scripts/probe_audio.mjs` (Node, `FilePathSource`).
- In-browser conversion (e.g. a web app where users export their own clip): `Conversion.init({ input, output })` with `Mp4OutputFormat` / `WebMOutputFormat` — WebCodecs, no server. Also `@remotion/web-renderer` / `@remotion/media` use it under the hood.
- Use it when ffmpeg isn't available (browser, edge function) or for quick metadata; use FFmpeg for heavy finishing.

## QA — `scripts/qa_video.sh` (always run)
```bash
bash <skill>/scripts/qa_video.sh out/export/master-web.mp4 <project>
```
Checks: dimensions / fps / frame count vs. the storyboard timeline, integrated loudness and true peak vs. target, black stretches ≥ 0.25s, frozen stretches ≥ 1.5s (fine for intentional holds). Then **look** at frames:
```bash
ffmpeg -i out/export/master-web.mp4 -vf "fps=1,scale=480:-1,tile=4x3" -frames:v 1 out/sheet.png
```
Check for: clipped text at safe areas, missing glyphs (□), flicker at transitions, 3D black frames, audio starting late.

Determinism spot-check: render the same `--frame` twice and compare `md5sum`. Different → something reads time/random outside the frame.
