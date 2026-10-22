# Plan: subskill `style-extract` — lấy style từ video có sẵn

Status: draft · Created: 2026-10-22 · Research: [researcher-261022-1151-video-style-extract-subskill.md](../reports/researcher-261022-1151-video-style-extract-subskill.md)

## Outcome

Người dùng đưa một file video hoặc link YouTube/TikTok/Facebook/Instagram. one-studio trích xuất ra một style card (`style.json` + `STYLE.md`), cho xem cạnh 3 scene mẫu dựng lại theo style đó, cho enhance (nhận cải tiến Claude đề xuất) và customize (chỉnh qua chat hoặc trang chỉnh offline) nhiều vòng, rồi áp vào `brand.json` + gợi ý storyboard/writers-room/audio. Style lưu được thành preset dùng lại.

## Quyết định (mặc định cho các câu hỏi mở trong báo cáo)

| # | Câu hỏi | Chọn |
|---|---|---|
| 1 | Lệnh gọi | Qua `/one-studio` (lựa chọn ở gate 0 + câu "lấy style từ <link>"). Skill có `description` riêng nên cũng được gọi trực tiếp; không thêm slash command. |
| 2 | Gemini | Không trong bản này. 100% offline: script đo + vision của Claude trên contact sheet. |
| 3 | Audio | Thông số (LUFS, tỉ lệ im lặng, có lời, số từ/phút) + gợi ý bed gần nhất trong `lib/music.mjs` (`preset`, `mood`, `bpm`) để `make-music --use` dùng. Không bắt chước bản nhạc. |
| 4 | Đoạn phân tích | Mặc định 90 giây đầu; `--from` / `--to` để chọn đoạn. |
| 5 | Nơi lưu preset | Cache người dùng `$(cacheDir)/presets/<tên>.json` (`ONE_STUDIO_CACHE`, mặc định `~/.cache/one-studio`). `loadPresets()` gộp preset của plugin và của cache; preset của plugin không bao giờ bị ghi. |
| 6 | Trang chỉnh | Trang file:// tĩnh + nút "Sao chép thay đổi" ra một dòng `style-set …`, dán vào chat. Không có server local. |
| – | Tên | `style-extract` (lý do ở báo cáo). Trong `description` có từ khoá "clone style", "bắt chước style", "giống video này". |

## Constraints

- Tương thích ngược: project, preset, test hiện có giữ nguyên; `npm test` xanh.
- Không gọi mạng khi không có `studio.json → services.download: true`. Không cài `yt-dlp` khi chưa hỏi. Không dùng cookies trình duyệt tự động.
- Không có asset nào của video gốc (khung hình, audio, logo) lọt vào `assets/` hay `out/`. Khung gốc chỉ nằm trong `style-refs/` và `review/`.
- File nguồn `style-refs/*/source.*` bị gitignore và mặc định bị xoá sau `style-apply` (`--keep` để giữ).
- Phép đo xác định: cùng input + cùng tham số → cùng `metrics.json`.
- Theo các quy tắc sẵn có: đổi brand thì bump `version` và báo số scene phải duyệt lại; approval chỉ từ chat.
- Script mới ≤ ~200 dòng mỗi file. Logic thuần (đo, màu, layer, enhance) đặt trong `lib/`, có unit test.

## Non-goals

- Không clone giọng, không tách hay dùng lại nhạc, không nhận dạng chính xác font thương mại.
- Không đo đường cong easing chính xác (chỉ ước lượng từ năng lượng chuyển động).
- Không có Gemini, không có OCR, không có PySceneDetect (FFmpeg `scdet` là đủ cho bản này).
- Không có server local cho trang chỉnh.

## Context budget

| Bước | Được nạp | Trần |
|---|---|---|
| Fetch + analyze | `style-extract/SKILL.md` | ~120 dòng |
| Đọc & map | `references/reading-guide.md` + `references/mapping.md` + 2 sheet + `metrics.json` (đã rút gọn) + 30 giây transcript đầu | ~250 dòng + 2 ảnh |
| Enhance | `references/enhance-rules.md` + output của `style-enhance` | ~120 dòng |
| Customize | bảng `style-diff` | ~40 dòng |

`visual-modes/index.md` và `tones.md` của writers-room chỉ đọc phần index khi map.

## Phases

| # | Phase | Phụ thuộc | File |
|---|---|---|---|
| 1 | Skeleton, schema, consent, router, bố cục `style-refs/` | – | [phase-01](phase-01-skeleton-schema-and-consent.md) |
| 2 | `style-fetch.mjs`: file local + yt-dlp | 1 | [phase-02](phase-02-style-fetch.md) |
| 3 | `style-analyze.mjs`: đo bằng FFmpeg + 2 contact sheet | 1 | [phase-03](phase-03-style-analyze.md) |
| 4 | Đọc & map: snap màu, bảng font, map mode/tone/bed, hướng dẫn đọc | 1, 3 | [phase-04](phase-04-read-and-map.md) |
| 5 | Compare, apply, preset cache, merge nhiều video | 4 | [phase-05](phase-05-compare-apply-merge.md) |
| 6 | Enhance & customize: layer, đề xuất, `style-set`, `style-diff`, `style-editor`, biến thể | 4, 5 | [phase-06](phase-06-enhance-and-customize.md) |
| 7 | Tích hợp, docs, e2e, kiểm chứng trên `vpbank-infinity-board` | 1–6 | [phase-07](phase-07-integration-and-validation.md) |

Phase 2 và 3 độc lập sau phase 1 (file riêng). Phase 3 test bằng video tổng hợp, không cần phase 2.

## Acceptance criteria

1. `npm test` xanh, không cần mạng; có test mới cho schema, metrics trên fixture tổng hợp, snap màu, layer, enhance, `style-set` round-trip, preset cache.
2. Fixture tổng hợp: điểm cắt đúng ±1 khung, màu chủ đạo đúng ΔE2000 ≤ 3, `metrics.json` giống nhau qua 2 lần chạy.
3. Clip 60 giây local → `metrics.json` + 2 sheet trong < 30 giây trên máy dev.
4. `style.json` hợp lệ theo schema; mỗi trường có `source: measured | seen | guessed`.
5. Link chỉ tải khi `services.download: true`; link cần đăng nhập dừng lại với hướng dẫn tự tải; không có cookies.
6. Sau khi customize, trích xuất lại hoặc merge không ghi đè trường đã có trong `style.custom.json` hoặc bị khoá.
7. Đề xuất enhance có lý do và ảnh trước/sau, chỉ áp khi người dùng nhận; style áp dụng xong luôn đạt WCAG AA cho chữ chính trên nền.
8. `style-editor.html` chạy qua file:// không cần mạng; chạy dòng "Sao chép thay đổi" bằng `style-set` cho ra đúng giá trị đang hiển thị (test round-trip).
9. `style-apply` chỉ đổi `brand.json` (+ `studio.json → story.style`, gợi ý storyboard), bump version; không có file nào từ `style-refs/` bị chép sang `assets/`; preset lưu trong cache và hiện được ở `compare-presets`.
10. Kiểm chứng: lấy style từ video tham khảo của `videos/vpbank-infinity-board` cho ra bảng màu gần preset `infinity-board` (mỗi token ΔE2000 ≤ 10, cùng nền sáng, cùng surface flat); người dùng xem sheet so sánh và đồng ý.

## Unresolved

- Video tham khảo gốc của `vpbank-infinity-board` có còn trên máy không (cho tiêu chí 10)? Nếu không, người dùng chọn một clip khác làm mẫu kiểm chứng.
