#!/usr/bin/env bash
# Post-production with FFmpeg: loudness normalization, web-optimized master,
# burned-in or sidecar subtitles, fallback reframes, thumbnail, GIF/WebM previews.
#
# Usage: post_export.sh <master.mp4> [options]
#   --out DIR          output folder (default: <master dir>/export)
#   --lufs N           target integrated loudness (default -14 = YouTube/TikTok/IG;
#                      -16 Apple/podcasts, -23 EBU broadcast)
#   --srt FILE         subtitles: copies FILE as a sidecar AND makes a burned-in version
#   --reframe LIST     comma list of 9:16,1:1,4:5 → blurred-background reframes
#                      (fallback only — natively re-rendering each aspect looks better)
#   --thumb SECONDS    grab a JPG thumbnail at this time (default 1.0)
#   --gif              6s GIF preview (480px wide)
#   --webm             VP9/Opus WebM version
set -euo pipefail

IN="${1:?usage: post_export.sh <master.mp4> [options]}"; shift
OUT="$(dirname "$IN")/export"; LUFS=-14; SRT=""; REFRAME=""; THUMB=1.0; GIF=0; WEBM=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --lufs) LUFS="$2"; shift 2 ;;
    --srt) SRT="$2"; shift 2 ;;
    --reframe) REFRAME="$2"; shift 2 ;;
    --thumb) THUMB="$2"; shift 2 ;;
    --gif) GIF=1; shift ;;
    --webm) WEBM=1; shift ;;
    *) echo "Unknown option $1" >&2; exit 1 ;;
  esac
done
mkdir -p "$OUT"
NAME="$(basename "${IN%.*}")"
FF="ffmpeg -hide_banner -loglevel error -y"
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$IN" | head -1)

# 1) Two-pass EBU R128 loudness normalization (true peak -1.5 dBTP), video stream copied.
MASTER="$OUT/$NAME-web.mp4"
if [[ -n "$HAS_AUDIO" ]]; then
  STATS=$(ffmpeg -hide_banner -i "$IN" -af "loudnorm=I=$LUFS:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
  get() { echo "$STATS" | grep "\"$1\"" | sed -E 's/.*: "?([^",]*)"?,?/\1/'; }
  $FF -i "$IN" -c:v copy -af "loudnorm=I=$LUFS:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" \
    -c:a aac -b:a 192k -movflags +faststart "$MASTER"
  echo "✓ $MASTER  (loudness $(get input_i) → $LUFS LUFS)"
else
  $FF -i "$IN" -c copy -movflags +faststart "$MASTER"
  echo "✓ $MASTER  (no audio track)"
fi

# 2) Subtitles: sidecar + burned-in (needs libass).
if [[ -n "$SRT" ]]; then
  cp "$SRT" "$OUT/$NAME.srt"
  ESC=$(printf '%s' "$(cd "$(dirname "$SRT")" && pwd)/$(basename "$SRT")" | sed "s/'/\\\\'/g; s/:/\\\\:/g")
  $FF -i "$MASTER" -vf "subtitles='$ESC':force_style='FontName=Inter,FontSize=18,Bold=1,Outline=2,Shadow=0,MarginV=40'" -c:a copy -crf 18 -preset medium -movflags +faststart "$OUT/$NAME-subs.mp4"
  echo "✓ $OUT/$NAME-subs.mp4 + $NAME.srt"
fi

# 3) Fallback reframes: sharp video centered over a blurred, scaled copy of itself.
IFS=',' read -ra RF <<< "$REFRAME"
for r in "${RF[@]}"; do
  [[ -z "$r" ]] && continue
  case "$r" in
    9:16) W=1080; H=1920 ;; 1:1) W=1080; H=1080 ;; 4:5) W=1080; H=1350 ;; 16:9) W=1920; H=1080 ;;
    *) echo "skip unknown aspect $r" >&2; continue ;;
  esac
  $FF -i "$MASTER" -filter_complex "[0:v]split[a][b];[a]scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,gblur=sigma=40,eq=brightness=-0.08[bg];[b]scale=$W:$H:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p" \
    -c:a copy -crf 19 -movflags +faststart "$OUT/$NAME-${r/:/x}.mp4"
  echo "✓ $OUT/$NAME-${r/:/x}.mp4"
done

# 4) Thumbnail.
$FF -ss "$THUMB" -i "$MASTER" -frames:v 1 -q:v 2 "$OUT/$NAME-thumb.jpg" && echo "✓ $OUT/$NAME-thumb.jpg"

# 5) Previews.
if [[ $GIF -eq 1 ]]; then
  $FF -t 6 -i "$MASTER" -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "$OUT/$NAME-preview.gif"
  echo "✓ $OUT/$NAME-preview.gif"
fi
if [[ $WEBM -eq 1 ]]; then
  $FF -i "$MASTER" -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -c:a libopus -b:a 128k "$OUT/$NAME.webm"
  echo "✓ $OUT/$NAME.webm"
fi
