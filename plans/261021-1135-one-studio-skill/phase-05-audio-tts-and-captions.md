---
phase: 5
title: Audio, TTS & captions
status: done
depends_on: [4]
---

# Phase 5 — Audio, TTS & captions

## Mục tiêu
VO theo từng câu qua API OpenAI-compatible, khớp duration scene, nhạc nền + SFX, phụ đề.

## Files
- `references/audio-tts.md`
- `scripts/tts-openai-compatible.mjs` — POST `{base_url}/v1/audio/speech` theo câu; `vi` → ZeroTTS, khác → OmniVoice; key từ env (`ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY`).
- `scripts/build-captions.mjs` — ffprobe duration từng câu → cộng dồn (+ khoảng nghỉ) → `captions.srt` + timing scene.
- cập nhật `concat-and-mix.sh` — mix VO + nhạc (sidechain ducking), `loudnorm` -14 LUFS, burn hoặc mux phụ đề.

## Việc cần làm
1. Cache audio theo hash(text + voice + model) → sửa 1 câu chỉ gen lại câu đó.
2. Scene duration = max(storyboard duration, tổng VO của scene + padding); cập nhật → scene đó dirty.
3. Hỏi user trước khi gọi TTS lần đầu (endpoint, voice); không hỏi lại trong cùng project.
4. Nhạc: user cung cấp hoặc để trống; SFX tuỳ chọn.

## Done khi
- Script VI 6 câu → 6 file audio, captions.srt đúng timing (lệch < 100ms so với audio).
- Sửa 1 câu → 1 lần gọi TTS, 1 scene render lại.
- Output đo loudness ≈ -14 LUFS.

## Kết quả (2026-10-21)
- `build-audio.mjs` (TTS theo câu, cache, hỏi trước khi gọi, khớp thời lượng scene mà vẫn giữ duyệt), `lib/captions.mjs` (SRT), `tts-openai-compatible.mjs --probe/--say`, trộn nhạc có ducking + loudnorm hai lượt.
- Kiểm bằng server giả lập: phụ đề lệch ≤ 20 ms, −13.9 LUFS, sửa 1 câu → 1 lần gọi.
- **Pending:** gọi thật ZeroTTS / OmniVoice trên máy user.
