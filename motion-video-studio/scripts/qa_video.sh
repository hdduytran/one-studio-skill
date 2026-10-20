#!/usr/bin/env bash
# Quality gate for a rendered video: checks size/fps/duration against the storyboard
# timeline, measures loudness and true peak, and flags black or frozen stretches.
#
# Usage: qa_video.sh <video.mp4> [project-dir] [--lufs -14]
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VID="${1:?usage: qa_video.sh <video> [project-dir] [--lufs N]}"
PROJ="${2:-}"
[[ "$PROJ" == --* ]] && PROJ=""
LUFS=-14
for ((i = 1; i <= $#; i++)); do [[ "${!i}" == "--lufs" ]] && { j=$((i + 1)); LUFS="${!j}"; }; done
FAIL=0
ok() { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; FAIL=1; }
warn() { echo "  ⚠ $*"; }

echo "QA: $VID"
IFS=, read -r W H FPS NB < <(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=width,height,r_frame_rate,nb_read_packets -of csv=p=0 "$VID")
FPSN=$(awk -v f="$FPS" 'BEGIN{split(f,a,"/"); printf "%.3f", a[1]/(a[2]?a[2]:1)}')
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
echo "  ${W}x${H} @ ${FPSN}fps, ${NB} frames, ${DUR}s"

if [[ -n "$PROJ" ]]; then
  EXP=$(node "$SKILL_DIR/scripts/storyboard_to_timeline.mjs" "$PROJ" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s);console.log(t.width,t.height,t.fps,t.durationInFrames)})')
  read -r EW EH EF ED <<< "$EXP"
  # A file rendered with --props aspect override legitimately differs in size; only warn.
  [[ "$W" == "$EW" && "$H" == "$EH" ]] && ok "dimensions match storyboard (${EW}x${EH})" || warn "dimensions ${W}x${H} ≠ storyboard ${EW}x${EH} (ok if rendered with an aspect override)"
  awk -v a="$FPSN" -v b="$EF" 'BEGIN{exit !(a-b<0.01 && b-a<0.01)}' && ok "fps matches ($EF)" || bad "fps $FPSN ≠ storyboard $EF"
  [[ "$NB" == "$ED" ]] && ok "frame count matches ($ED)" || bad "frame count $NB ≠ storyboard $ED"
fi

if [[ -n "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$VID")" ]]; then
  R=$(ffmpeg -hide_banner -nostats -i "$VID" -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary:/,$p')
  I=$(echo "$R" | awk '/I:/{print $2; exit}')
  TP=$(echo "$R" | awk '/Peak:/{print $2; exit}')
  awk -v i="$I" -v t="$LUFS" 'BEGIN{d=i-t; exit !(d<1.5 && d>-1.5)}' && ok "loudness $I LUFS (target $LUFS)" || warn "loudness $I LUFS, target $LUFS — run post_export.sh"
  awk -v p="$TP" 'BEGIN{exit !(p<=-1.0)}' && ok "true peak $TP dBTP" || warn "true peak $TP dBTP > -1 (risk of clipping after platform transcode)"
else
  warn "no audio track"
fi

BL=$(ffmpeg -hide_banner -nostats -i "$VID" -vf "blackdetect=d=0.25:pix_th=0.06" -an -f null - 2>&1 | grep -o "black_start:[0-9.]* black_end:[0-9.]*" || true)
[[ -z "$BL" ]] && ok "no black stretches ≥0.25s" || { warn "black frames:"; echo "$BL" | sed 's/^/      /'; }
FR=$(ffmpeg -hide_banner -nostats -i "$VID" -vf "freezedetect=n=0.001:d=1.5" -an -f null - 2>&1 | grep -o "freeze_start: [0-9.]*\|freeze_duration: [0-9.]*" | paste - - || true)
[[ -z "$FR" ]] && ok "no frozen stretches ≥1.5s" || { warn "static stretches (fine for holds, bad if unexpected):"; echo "$FR" | sed 's/^/      /'; }

[[ $FAIL -eq 0 ]] && echo "PASS" || echo "FAIL"
exit $FAIL
