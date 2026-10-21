# Audio: voice-over, music, SFX, captions (gates 0 and 7)

Everything here runs locally: TTS on the user's own server, music and SFX synthesised on this machine, no samples, no network at render. Never call TTS without consent (`studio.json → services.tts` or `--allow-tts` after asking).

## Who owns the sound
| Part | Tool | Delivered? |
|---|---|---|
| Final mix (VO + music + SFX, ducking, −14 LUFS, captions) | FFmpeg in `concat-and-mix.mjs` | yes — the only source of sound in the MP4 |
| Listening page `review/audio-picker.html` | howler.js (vendored `assets/vendor/howler.core.min.js`, MIT) | no — auditioning only |
| SFX preview in HyperFrames studio | howler.js via `os.js` + `assets/audio-cues.js` | no — skipped whenever `navigator.webdriver` is true (every render/snapshot) |

Headless renders never capture browser audio, and every clip is normalised with `-an`, so anything played in a scene is lost. The mix stays deterministic because only FFmpeg builds it from files and storyboard timings. `audio-cues.js`, `assets/sfx/` and `assets/music/` are left out of every scene hash: changing a sound never re-renders a picture.

## Voice (gate 0, confirm before the first call)
- `POST {base_url}/v1/audio/speech` with `{model, input, voice, response_format: "wav", speed}`; any audio format comes back as 48 kHz mono WAV.
- `studio.json → audio.tts`: `vi` → ZeroTTS, `default` → OmniVoice. Per-line override: `lines[].lang`, `lines[].voice`. Brand voice preset (`brand.json → voice.<lang>`) wins over the endpoint voice, so a series keeps one voice.
- `init-project.mjs` writes the placeholder voice `default`, which real servers reject. Pick a real one:
  1. `init-project.mjs D --tts-url http://localhost:8000 --probe-tts` or `tts-openai-compatible.mjs --voices D` → voice ids (ZeroTTS: `GET /v1/audio/voices`; also tries `/v1/voices`, `/voices`). Listing is not synthesis: no consent needed.
  2. Ask: "Nghe thử N giọng (N lần gọi ZeroTTS) nhé?" → `tts-openai-compatible.mjs D --samples all --text "<one line of the script>" --allow-tts` → `review/voices/<id>.wav`.
  3. `audio-picker.mjs D` → show `review/audio-picker.html`; the user picks by ear → `tts-openai-compatible.mjs D --use-voice <id>` (also updates a brand voice preset; for a series say that later episodes use it too).
- A rejected voice fails with the server's real list in the message.
- Keys only from env: `ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY` (names in `key_env`). Never write a key into a file.
- Health check: `tts-openai-compatible.mjs --probe D` (one call: models, codec, sample rate, latency).

## Captions (gate 0 question, re-ask at gate 7)
Ask once at gate 0, with the user's language:
> "Video có phụ đề không? **không** · **chỉ file .srt** · **phụ đề mềm** (bật/tắt được trong trình phát, kèm .srt) · **in cứng vào hình**"

| Answer | mode | Output |
|---|---|---|
| không / none | `none` | no `captions.srt`, nothing muxed, no `.srt` next to the video |
| chỉ file .srt / sidecar | `sidecar` | `out/<name>.srt` only |
| phụ đề mềm / soft | `mux` | `mov_text` track + `.srt` (stream copy, no libass) |
| in cứng / burn | `burn` | drawn into the picture (needs FFmpeg with libass) + `.srt` |

- New brand kit: `init-project.mjs D --captions <mode>` stores it in `brand.json → captions.enabled/mode`. Reused series kit: the episode's own answer goes to `studio.json → captions` (`status.mjs D --captions <mode>`), which always wins.
- `burn` without libass (Homebrew FFmpeg 8 core): init, `check-external.mjs`, `status.mjs` and `concat-and-mix.mjs` say so, and the video gets `mux` instead. Tell the user once.
- Changing the mode later: `status.mjs D --captions <mode>` → `build-audio.mjs` → preview/render again.

## Before the first TTS call
`build-audio.mjs D --dry-run` → "N TTS call(s) needed". If `services.tts` is not true, ask ("Gọi ZeroTTS @ <url> cho N câu nhé?"), then run with `--allow-tts` (it records the consent).

## Build
`node "$S/scripts/build-audio.mjs" D [--allow-tts]`
- One call per sentence; cache key = text + model + voice + speed (`audio/cache/`). Editing one sentence → one call.
- Leading/trailing silence trimmed (`audio.trim: false` to keep it).
- Timing per scene: `lead_in` (0.3 s) + sentences separated by `sentence_pause` (0.25 s, per-line `pause_after`) + `scene_padding` (0.5 s).
- Scene length = max(storyboard duration, VO + padding). A longer scene gets its `data-duration` rewritten and re-renders; its keyframe approval is kept and gates 5–6 stay closed (they hash the layout only).
- VO sync: scenes that tag elements with `data-line="<line-id>"` get `<script id="os-lines">` with each line's scene-relative start/end; `S.lines()` reveals them on cue. Same rule: approvals kept, only those scenes re-render. After adding `data-line` by hand later: `sync-lines.mjs D [ids]`.
- Outputs: `audio/vo.wav`, `captions.srt` (unless `none`; one cue per sentence, wrapped at `brand.captions.max_chars`, two lines max), `audio/manifest.json` with absolute and scene-relative line timings.
- Spell numbers out in `say` ("thứ tư") and keep digits in `text` ("thứ 4").

## Music (gate 7: ask when `audio.music` is `null`)
1. `make-music.mjs D --samples [--files a.mp3,b.wav]` → built-in beds in `assets/music/` and 30 s samples with a fade-out in `review/music/*.m4a` (the user's own files too).
2. `audio-picker.mjs D` → `review/audio-picker.html` (voices, beds and SFX side by side; "Thử giọng + nhạc" plays the bed at its ducked level under a voice). Ask: "Bạn chọn nhạc nào (hoặc không nhạc)?"
3. `make-music.mjs D --use <bed|path|none>` → `studio.json → audio.music` (`false` = no music by choice). Gate 7 does not close while it is `null`.

Built-in beds (all seamless loops, 48 kHz stereo, peak −3 dBFS, same options → identical file):

| Bed | Preset | Sound |
|---|---|---|
| `ambient` | ambient, calm, 60 BPM, 16 s | Cmaj7–Am7–Fmaj7–G6 detuned sine pads (+octave, slow swell overlapping the next bar), eighth-note sparkle arpeggio two octaves up with exp decay, 0.33 s feedback delay (0.28) |
| `ambient-bright` | ambient, bright | brighter progression, louder sparkle |
| `lofi` | lofi, calm, 100 BPM, 19.2 s | soft kick on 1 and 3, swung off-beat hat, root bass, warm low-passed chords, faint vinyl dust |
| `lofi-dark` | lofi, dark | Am7–Fmaj7–Dm7–Em7, darker filter |

Custom: `make-music.mjs D --preset lofi --mood warm --bpm 90 --key D --length 30 --name my-bed` (length rounds to whole 4-bar progressions), then `--use my-bed.wav` path. Moods: `calm`, `bright`, `warm`, `dark`.

In the mix the bed is looped, faded out over the last 2 s and ducked under the VO (sidechain compressor).

## SFX
Built-in kit (FFmpeg lavfi, seeded noise → identical files): `whoosh`, `swoosh`, `pop`, `click`, `ding`, `riser`, `impact` (`make-sfx.mjs --list`). Cues live on the scene in `storyboard.json`:

```json
"sfx": [
  { "name": "whoosh", "at": 0.05 },
  { "name": "pop", "line": "s02-2", "at": 0, "gain": -6 },
  { "src": "assets/sfx/door.wav", "at": 3.2 }
]
```
- `at` seconds from the scene start, or from the VO start of `line`; `gain` in dB (default 0).
- Placed from `audio/manifest.json` timings (storyboard lengths before gate 7); never ducked. Built-ins are rendered into `assets/sfx/` on first use.
- `studio.json → audio.sfx: false` mutes all cues (projects from ≤ 0.2 have `false`: set `true` when you add cues).
- Cues are part of the audio hash: editing one re-opens gate 7, never a scene.

## Mix and captions (concat-and-mix)
- Two-pass `loudnorm` to `audio.loudness` (−14 LUFS, true peak −1.5 dB); the summary prints the measured value and the number of SFX placed.
- Output length = the video's length exactly (a soft subtitle track can no longer shorten it).
