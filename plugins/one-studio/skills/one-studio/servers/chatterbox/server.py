"""OpenAI-compatible TTS server for Chatterbox (Resemble AI, MIT).

Endpoints (what one-studio's scripts/lib/tts.mjs calls):
  GET  /v1/models          -> {"data": [{"id": "chatterbox"}]}
  GET  /v1/audio/voices    -> {"voices": ["default", <name of each voices/*.wav>]}
  POST /v1/audio/speech    -> audio bytes; body {model, input, voice, response_format, speed}

Voices: "default" is Chatterbox's built-in voice. Any `<name>.wav` (5-15 s of clean
speech) dropped into the voices folder becomes voice `<name>` (zero-shot clone).

Env:
  CHATTERBOX_VOICES_DIR   voices folder (default ~/.one-studio/chatterbox/voices)
  CHATTERBOX_DEVICE       cuda | cpu | mps (default: cuda if present, else cpu)
  CHATTERBOX_EXAGGERATION emotion intensity 0.25-2 (default 0.5)
  CHATTERBOX_CFG          pace/adherence 0-1 (default 0.5)
  CHATTERBOX_API_KEY      if set, requests must send "Authorization: Bearer <key>"
Run: python server.py --port 8002
"""
import argparse
import io
import os
import subprocess
import threading
from pathlib import Path

import torch
import torchaudio
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

VOICES_DIR = Path(os.environ.get("CHATTERBOX_VOICES_DIR", Path.home() / ".one-studio/chatterbox/voices")).expanduser()
EXAGGERATION = float(os.environ.get("CHATTERBOX_EXAGGERATION", "0.5"))
CFG = float(os.environ.get("CHATTERBOX_CFG", "0.5"))
API_KEY = os.environ.get("CHATTERBOX_API_KEY")
MIME = {"wav": "audio/wav", "mp3": "audio/mpeg", "flac": "audio/flac", "opus": "audio/ogg"}


def pick_device() -> str:
    forced = os.environ.get("CHATTERBOX_DEVICE")
    if forced:
        return forced
    # Apple MPS is supported but measured ~9x slower than CPU on an M-series Mac
    # (133 s vs 15 s for 7 s of speech), so Macs use the CPU unless CHATTERBOX_DEVICE=mps.
    return "cuda" if torch.cuda.is_available() else "cpu"


DEVICE = pick_device()
if DEVICE == "mps":
    # Checkpoints were saved on CUDA; map every load onto the Mac GPU.
    _load = torch.load
    torch.load = lambda *a, **k: _load(*a, **{**k, "map_location": k.get("map_location", torch.device("mps"))})

from chatterbox.tts import ChatterboxTTS  # noqa: E402  (after the torch.load patch)

model = ChatterboxTTS.from_pretrained(device=DEVICE)
lock = threading.Lock()  # one generation at a time: the model is not thread-safe
app = FastAPI(title="chatterbox-openai")


def voices() -> list[str]:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    return ["default"] + sorted(p.stem for p in VOICES_DIR.glob("*.wav"))


def check_key(authorization: str | None):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(401, "bad or missing API key")


class SpeechRequest(BaseModel):
    input: str
    model: str = "chatterbox"
    voice: str = "default"
    response_format: str = "wav"
    speed: float = 1.0


@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": "chatterbox", "object": "model", "owned_by": "resemble-ai"}]}


@app.get("/v1/audio/voices")
def list_voices():
    return {"voices": voices()}


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest, authorization: str | None = Header(None)):
    check_key(authorization)
    text = req.input.strip()
    if not text:
        raise HTTPException(400, "input is empty")
    if req.voice not in voices():
        raise HTTPException(400, f'voice "{req.voice}" not found. Available: {", ".join(voices())}')
    fmt = req.response_format if req.response_format in MIME else "wav"
    ref = None if req.voice == "default" else str(VOICES_DIR / f"{req.voice}.wav")
    with lock, torch.inference_mode():
        wav = model.generate(text, audio_prompt_path=ref, exaggeration=EXAGGERATION, cfg_weight=CFG)
    buf = io.BytesIO()
    torchaudio.save(buf, wav.cpu(), model.sr, format="wav")
    data = buf.getvalue()
    # Chatterbox has no speed control: apply it (and any non-wav format) with ffmpeg.
    if abs(req.speed - 1.0) > 1e-3 or fmt != "wav":
        speed = min(max(req.speed, 0.5), 2.0)
        out_fmt = {"opus": "ogg"}.get(fmt, fmt)
        args = ["ffmpeg", "-v", "error", "-i", "pipe:0", "-af", f"atempo={speed}", "-f", out_fmt, "pipe:1"]
        data = subprocess.run(args, input=data, capture_output=True, check=True).stdout
    return Response(content=data, media_type=MIME[fmt])


if __name__ == "__main__":
    import uvicorn

    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8002)
    a = p.parse_args()
    print(f"chatterbox on {DEVICE}, voices in {VOICES_DIR}: {', '.join(voices())}")
    uvicorn.run(app, host=a.host, port=a.port)
