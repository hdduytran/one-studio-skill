# Audio: voice-over, music, captions (gate 7)

## TTS servers (OpenAI-compatible)
- `POST {base_url}/v1/audio/speech` with `{model, input, voice, response_format: "wav", speed}`; any audio format the server returns is converted to 48 kHz mono WAV.
- `studio.json → audio.tts`: `vi` → ZeroTTS, `default` → OmniVoice. Per-line override: `lines[].lang`, `lines[].voice`. Brand voice preset (`brand.json → voice.<lang>`) wins over the endpoint's default voice, so a series keeps one voice.
- Keys only from env: `ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY` (names in `key_env`). Never write a key into a file.
- Check a server once: `node "$S/scripts/tts-openai-compatible.mjs" --probe D` (prints models, codec, sample rate, latency). Try a voice: `--say "…" --out test.wav D --voice <id>`.

## Before the first call
`build-audio.mjs D --dry-run` → "N TTS call(s) needed". If `services.tts` is not true, ask the user ("Gọi ZeroTTS @ <url> cho N câu nhé?"), then run with `--allow-tts` (it records the consent). Never call TTS silently.

## Build
`node "$S/scripts/build-audio.mjs" D [--allow-tts]`
- One call per sentence; cache key = text + model + voice + speed (`audio/cache/`). Editing one sentence → one call.
- Leading/trailing silence trimmed (`audio.trim: false` to keep it).
- Timing per scene: `lead_in` (0.3 s) + sentences separated by `sentence_pause` (0.25 s, per-line `pause_after`) + `scene_padding` (0.5 s).
- Scene length = max(storyboard duration, VO + padding). A longer scene gets its `data-duration` rewritten and re-renders, but its keyframe approval is kept.
- Outputs: `audio/vo.wav`, `captions.srt` (one cue per sentence, wrapped at `brand.captions.max_chars`, two lines max), `audio/manifest.json` with absolute and scene-relative line timings — use `scenes[].lines[].start` to sync on-screen reveals with the VO.
- Spell numbers out in `say` ("thứ tư") and keep digits in `text` ("thứ 4").

## Music & SFX
- Music only from the user (`studio.json → audio.music`, path in the project). It is looped, faded out over the last 2 s and ducked under the VO (sidechain compressor).
- SFX: not automated yet; if needed, mix them into a WAV and use it as the music bed, or add `<audio>` clips inside a HyperFrames scene.

## Mix and captions (in concat-and-mix)
- Two-pass `loudnorm` to `audio.loudness` (−14 LUFS, true peak −1.5 dB); the summary prints the measured value.
- `brand.captions.mode`: `burn` (default, re-encodes the final once), `mux` (soft subtitle track, stream copy), `sidecar` (only `out/<name>.srt`). The `.srt` is always written next to the video.
