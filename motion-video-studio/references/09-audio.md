# Audio: voice-over, music, SFX, captions

Sound is half the video. Keep it simple and loudness-correct.

## Voice-over
Options, best first:
1. **User-recorded** VO (one file per scene, or one file that you split with `ffmpeg -ss/-to`).
2. **TTS** — ElevenLabs (multilingual, good Vietnamese: `eleven_multilingual_v2`), OpenAI TTS, Google Cloud TTS (`vi-VN-Neural2-*`), Azure (`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`). Ask the user for the provider and API key; never invent keys. Generate one file per scene: `public/audio/vo/<scene-id>.mp3`. The Remotion skills' `voiceover` rule has a ready ElevenLabs script.
3. **Offline placeholder** (English only) for animatics: `ffmpeg -f lavfi -i "flite=text='Your line here':voice=slt" public/audio/vo/hook.wav`.

Then:
```bash
node <skill>/scripts/probe_audio.mjs <project>   # Mediabunny measures → writes scene.vo.duration
node <skill>/scripts/storyboard_to_timeline.mjs <project>
```
Scenes stretch to `vo.duration + delay (0.15s) + voPadding (0.4s)`. Clean VO: `ffmpeg -i raw.wav -af "highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-16" vo.wav`. Trim silence: `silenceremove=start_periods=1:start_threshold=-45dB`.

## Music
- `storyboard.audio.music = { src, volume: 0.5, duckTo: 0.15, fadeOut: 1.5 }`. `src/components/Music.tsx` ducks under every VO line (0.25s ramps) and fades out at the end; it loops if shorter than the video.
- Pick tempo to the edit: 90–100 BPM calm explainer, 110–128 BPM promo/social. Cutting scene changes on the beat: at BPM b, one beat = `fps*60/b` frames (30fps, 120 BPM → 15f) — make scene durations multiples of that.
- Licences: user's library, YouTube Audio Library, Pixabay Music, or `make_sfx.sh`'s `music-bed.wav` as a placeholder.

## SFX
- `scene.sfx: [{ src, at, volume }]`, `at` in seconds from scene start. Offline kit: `bash <skill>/scripts/make_sfx.sh public/audio/sfx` → `whoosh, swoosh, pop, click, ding, riser, impact, music-bed`.
- Where: whoosh on slides/zooms (start 2–3f **before** the motion), pop/click on element appear, riser into a reveal, impact on logo hit, ding on CTA.
- Less is more — 1 SFX per hit, volume 0.3–0.6 under VO. Remotion's SFX URLs (`https://remotion.media/*.wav`) work only with network access at render time; download them into `public/` first.

## Captions
- Social videos are mostly watched muted → captions on (`meta.captions: true`). The template's `Captions` splits `vo.text` into 6-word chunks evenly across the VO — good enough for TTS.
- Word-accurate captions: transcribe the VO with Whisper via `@remotion/install-whisper-cpp` + `@remotion/captions` (`createTikTokStyleCaptions`) — see the Remotion skills' `remotion-captions`. Or produce an SRT and use `post_export.sh --srt` for burn-in/sidecar.
- Vietnamese: make sure the caption font has Vietnamese glyphs (Inter does).

## Loudness targets
| Platform | Integrated | True peak |
|---|---|---|
| YouTube, TikTok, Instagram, Facebook | -14 LUFS | -1 dBTP |
| Apple / podcasts / web players | -16 LUFS | -1 dBTP |
| Broadcast (EBU R128) | -23 LUFS | -1 dBTP |
`post_export.sh --lufs N` normalizes (two-pass loudnorm); `qa_video.sh` measures.

## Howler.js — preview only
Howler plays audio in a browser in real time. It has no place in the render path (Remotion mixes audio itself). Use it to build a quick SFX audition page so the user can pick sounds:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>
<button onclick="new Howl({src:['public/audio/sfx/whoosh.wav']}).play()">whoosh</button>
```
