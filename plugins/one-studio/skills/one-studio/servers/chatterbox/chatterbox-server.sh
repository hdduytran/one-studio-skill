#!/usr/bin/env bash
# Install (once) and run the local Chatterbox TTS server (OpenAI-compatible, port 8002).
#   chatterbox-server.sh install      create ~/.one-studio/chatterbox/.venv (Python 3.11, needs uv)
#   chatterbox-server.sh [--port N]   start the server (installs first if needed)
# Clone a voice: copy 5-15 s of clean speech to ~/.one-studio/chatterbox/voices/<name>.wav
set -euo pipefail
HOME_DIR="${CHATTERBOX_HOME:-$HOME/.one-studio/chatterbox}"
VENV="$HOME_DIR/.venv"
HERE="$(cd "$(dirname "$0")" && pwd)"

install() {
  command -v uv >/dev/null || { echo "uv is required: brew install uv" >&2; exit 1; }
  mkdir -p "$HOME_DIR/voices"
  [ -x "$VENV/bin/python" ] || uv venv --python 3.11 "$VENV"
  uv pip install --python "$VENV/bin/python" chatterbox-tts fastapi "uvicorn[standard]" "setuptools<81"
  # setuptools<81 keeps pkg_resources, which the perth watermarker still imports.
}

if [ "${1:-}" = "install" ]; then install; exit 0; fi
[ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c "import chatterbox, pkg_resources" 2>/dev/null || install
exec "$VENV/bin/python" "$HERE/server.py" "$@"
