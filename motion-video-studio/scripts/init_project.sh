#!/usr/bin/env bash
# Scaffold a Remotion motion-video project from the skill template.
#
# Usage:
#   init_project.sh <target-dir> [--with three,lottie,dotlottie,rive,motion] [--no-install]
#
# Optional modules (assets/optional/<name>/):
#   three      Three.js + React Three Fiber + Drei + Postprocessing (Scene3D)
#   lottie     Lottie JSON via @remotion/lottie (LottieScene)
#   dotlottie  .lottie via dotLottie WASM player (DotLottieScene)
#   rive       Rive .riv timeline animations (RiveScene)
#   motion     Motion springs/inertia sampled per frame (MotionCards + bridges/motionAt.ts)
# GSAP and Anime.js are always included (bridges/useGsapTimeline.ts, useAnimeTimeline.ts).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:?usage: init_project.sh <target-dir> [--with a,b] [--no-install]}"
shift
WITH=""
INSTALL=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with) WITH="$2"; shift 2 ;;
    --with=*) WITH="${1#*=}"; shift ;;
    --no-install) INSTALL=0; shift ;;
    *) echo "Unknown option $1" >&2; exit 1 ;;
  esac
done

if [[ -e "$TARGET/package.json" ]]; then
  echo "Refusing to overwrite: $TARGET already has a package.json" >&2
  exit 1
fi
mkdir -p "$TARGET"
cp -R "$SKILL_DIR/assets/remotion-template/." "$TARGET/"
TARGET="$(cd "$TARGET" && pwd)"
echo "✓ Template copied to $TARGET"

# License-free placeholder SFX + music bed so the first render has sound offline.
"$SKILL_DIR/scripts/make_sfx.sh" "$TARGET/public/audio/sfx" >/dev/null && echo "✓ SFX kit generated in public/audio/sfx"

DEPS=()
POST=()
IFS=',' read -ra MODS <<< "$WITH"
for mod in "${MODS[@]}"; do
  [[ -z "$mod" ]] && continue
  dir="$SKILL_DIR/assets/optional/$mod"
  [[ -d "$dir" ]] || { echo "Unknown module '$mod'" >&2; exit 1; }
  for f in "$dir"/*.tsx "$dir"/*.ts; do
    [[ -e "$f" ]] || continue
    name="$(basename "$f")"
    if [[ "$name" == *.tsx ]]; then
      cp "$f" "$TARGET/src/scenes/$name"
      comp="${name%.tsx}"
      # Register the scene: import at top, entry at the marker.
      sed -i.bak "1i import { $comp } from \"./$comp\";" "$TARGET/src/scenes/index.ts"
      sed -i.bak "s|  // @optional-scenes|  $comp,\n  // @optional-scenes|" "$TARGET/src/scenes/index.ts"
      rm -f "$TARGET/src/scenes/index.ts.bak"
    else
      cp "$f" "$TARGET/src/bridges/$name"
    fi
  done
  while read -r dep; do [[ -n "$dep" ]] && DEPS+=("$dep"); done < "$dir/deps.txt"
  case "$mod" in
    dotlottie) POST+=("mkdir -p public/wasm && cp node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm public/wasm/") ;;
    rive) POST+=("mkdir -p public/wasm && cp node_modules/@rive-app/canvas/rive.wasm public/wasm/") ;;
  esac
  echo "✓ Module '$mod' added"
done

if [[ $INSTALL -eq 1 ]]; then
  cd "$TARGET"
  echo "… npm install (this can take a minute)"
  npm install --no-audit --no-fund --loglevel=error
  if [[ ${#DEPS[@]} -gt 0 ]]; then
    npm install --no-audit --no-fund --loglevel=error "${DEPS[@]}"
  fi
  for cmd in "${POST[@]}"; do bash -c "$cmd"; done
  echo "✓ Dependencies installed"
else
  if [[ ${#DEPS[@]} -gt 0 ]]; then
    echo "Skipped install. Later run: npm install && npm install ${DEPS[*]}"
  fi
  for cmd in "${POST[@]}"; do echo "Then: $cmd"; done
fi

cat <<MSG

Next steps (in $TARGET):
  1. Edit storyboard.json (scenes, VO text, transitions)
  2. node $SKILL_DIR/scripts/storyboard_to_timeline.mjs .   # check timing
  3. npx remotion studio                                     # live preview
  4. npx remotion render Main out/master.mp4                 # final render
MSG
