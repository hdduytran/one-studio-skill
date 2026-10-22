# Phase 3 — `style-analyze.mjs`: đo bằng FFmpeg

## Design
`style-analyze.mjs <dir> <slug> [--threshold 10] [--frames 12] [--cuts 6]` → `style-refs/<slug>/metrics.json`, `frames/*.jpg`, `review/style-<slug>-frames.jpg`, `review/style-<slug>-cuts.jpg`. Không gọi mạng, không token.

Các phép đo (logic thuần trong `lib/style-metrics.mjs`, phần gọi FFmpeg trong script):

| Nhóm | Cách đo | Trường |
|---|---|---|
| Định dạng | `probe` | `width`, `height`, `aspect`, `fps`, `duration`; letterbox qua `cropdetect` |
| Nhịp | `scdet=threshold=T` + `metadata=print` → điểm cắt; `blackdetect` → fade đen | `cuts[]`, `shots[] {start,end}`, `asl`, `median_shot`, `cuts_per_min`, `shot_hist`, `fades` |
| Màu | mỗi shot 1 khung giữa, thu nhỏ còn 160 px → raw RGB qua pipe → k-means trong OKLab (seed cố định), che vùng watermark (TikTok: góc + vệt di chuyển theo vị trí đã biết) và dải phụ đề dưới cùng 18% | `palette[] {hex, weight, L, C}`, `bg_luma`, `saturation` |
| Sáng/bão hoà | `signalstats` YAVG, SATAVG | `luma_mean`, `sat_mean`, `contrast` (p95−p5 của Y) |
| Chuyển động | `lavfi.scd.mafd` mỗi khung, gom theo shot | `motion.mean`, `motion.class` (`static <2`, `drift <6`, `kinetic`), `motion.profile` (`front-loaded|even|back-loaded`) → gợi ý ease |
| Âm thanh | `ebur128`, `silencedetect=-35dB:d=0.3` | `lufs`, `lra`, `silence_ratio`, `pause_mean`, `has_audio` |
| Lời | đọc `subs.vtt` nếu có (bỏ cue trùng của auto-subs) | `words_per_minute`, `sentence_words_mean`, `hook_text` (3 giây đầu), `has_voice` (heuristic: có phụ đề hoặc silence_ratio thấp + LRA hẹp) |

Contact sheet (dùng `contactSheet` của `keyframe-stills.mjs` / `lib/contact-sheet.mjs`; nhãn vẽ bằng Chrome vì máy không có drawtext):
- `frames`: ≤ 12 khung lấy đều theo các shot, nhãn `#shot thời-điểm`.
- `cuts`: ≤ 6 điểm cắt có score cao nhất; mỗi điểm 3 khung (−2, 0, +2 khung) để thấy kiểu chuyển cảnh (cut, fade, wipe, zoom, match).

`metrics.json` ghi kèm `tool_versions` (ffmpeg) và tham số, để kết quả lặp lại được. Có `summary` ≤ 40 dòng để phase 4 nạp thay cho bản đầy đủ.

## Files
Tạo: `scripts/style-analyze.mjs`, `scripts/lib/style-metrics.mjs` (k-means OKLab, gom shot, phân loại motion, đọc VTT, tóm tắt), `scripts/lib/color.mjs` (sRGB↔OKLab/OKLCH, ΔE2000, độ tương phản WCAG; phase 4 và 6 dùng chung), `tests/fixtures/style/` (script sinh fixture, không commit video).
Sửa: `tests/style.test.mjs`.

## Validation
- Fixture sinh bằng `ffmpeg -f lavfi`: 5 đoạn `color=` (màu và độ dài biết trước) nối bằng cắt gắt + 1 fade đen, có `sine` + khoảng lặng. Assert điểm cắt ±1 khung, ASL đúng, palette chứa đúng 5 màu (ΔE2000 ≤ 3), có phát hiện fade, `silence_ratio` đúng ±5%.
- Fixture chuyển động: `testsrc2` (kinetic) vs `color` tĩnh (static).
- VTT mẫu có cue trùng kiểu auto-subs → số từ/phút đúng.
- Chạy 2 lần → `metrics.json` giống hệt (bỏ qua timestamp).
- Clip 60 giây 720p xong < 30 giây.

## Risk
- Video motion có nhiều chuyển động mượt mà ít cắt → `scdet` báo thiếu cắt. Ngưỡng chỉnh được bằng `--threshold`; sheet `cuts` cho người xem kiểm lại; `asl` ghi kèm `confidence` khi score sát ngưỡng.
- k-means bị nền chiếm phần lớn → tách `bg` (cụm lớn nhất ở viền khung) khỏi màu nhấn trước khi xếp hạng.
