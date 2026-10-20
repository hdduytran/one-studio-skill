#!/usr/bin/env bash
# Synthesize a small, license-free SFX kit with FFmpeg (no network needed).
# Usage: make_sfx.sh <output-dir>   (e.g. my-video/public/audio/sfx)
set -euo pipefail
OUT="${1:-public/audio/sfx}"
mkdir -p "$OUT"
q() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# whoosh: pink noise swept through a band-pass, swelling in and out (0.6s)
q -f lavfi -i "anoisesrc=d=0.6:c=pink:a=0.9" \
  -af "bandpass=f=900:w=1.2,afade=t=in:d=0.25:curve=exp,afade=t=out:st=0.3:d=0.3,volume=2" "$OUT/whoosh.wav"
# swoosh-down: lower, longer whoosh for transitions (0.9s)
q -f lavfi -i "anoisesrc=d=0.9:c=brown:a=0.9" \
  -af "lowpass=f=1500,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.5,volume=3" "$OUT/swoosh.wav"
# pop: short pitched blip for elements appearing
q -f lavfi -i "sine=f=880:d=0.09" -af "asetrate=44100*1.5,aresample=44100,afade=t=out:st=0.02:d=0.07,volume=0.8" "$OUT/pop.wav"
# click: UI tap
q -f lavfi -i "anoisesrc=d=0.03:c=white:a=1" -af "highpass=f=2500,afade=t=out:d=0.03" "$OUT/click.wav"
# ding: bell-ish tone for CTA / success
q -f lavfi -i "sine=f=1318:d=1.2" -f lavfi -i "sine=f=2637:d=1.2" \
  -filter_complex "[0][1]amix=inputs=2:weights=1 0.35,afade=t=out:st=0.05:d=1.15:curve=exp,volume=1.5" "$OUT/ding.wav"
# riser: rising tone building tension before a reveal (1.5s)
q -f lavfi -i "aevalsrc=0.4*sin(2*PI*(200*t+300*t*t)):d=1.5" -af "afade=t=in:d=1.2,afade=t=out:st=1.45:d=0.05" "$OUT/riser.wav"
# impact: low boom for logo hits
q -f lavfi -i "aevalsrc=0.9*sin(2*PI*55*t)*exp(-4*t):d=1.2" -f lavfi -i "anoisesrc=d=0.15:c=brown:a=0.6" \
  -filter_complex "[1]afade=t=out:d=0.15[n];[0][n]amix=inputs=2,volume=2" "$OUT/impact.wav"

# music-bed: soft 16s ambient pad (Cmaj7 → Am7) — a placeholder until real music is chosen
q -f lavfi -i "aevalsrc='0.08*(sin(2*PI*261.6*t)+sin(2*PI*329.6*t)+sin(2*PI*392*t)+sin(2*PI*493.9*t))*lt(t,8)+0.08*(sin(2*PI*220*t)+sin(2*PI*261.6*t)+sin(2*PI*329.6*t)+sin(2*PI*392*t))*gte(t,8)':d=16" \
  -af "tremolo=f=0.5:d=0.3,lowpass=f=2000,afade=t=in:d=1,afade=t=out:st=15:d=1" -ac 2 "$OUT/music-bed.wav"

echo "SFX written to $OUT:"; ls -1 "$OUT"
