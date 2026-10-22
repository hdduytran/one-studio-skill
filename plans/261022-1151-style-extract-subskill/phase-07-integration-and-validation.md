# Phase 7 — tích hợp, docs, e2e, kiểm chứng

## Design
- **`SKILL.md` của style-extract hoàn chỉnh:** bảng bước + lệnh, câu hỏi consent (vi/en), bảng cụm từ customize, luật approval (chỉ `style-apply` sau khi người dùng OK trong chat), budget context.
- **one-studio:**
  - gate 0 có nhánh "lấy style từ video";
  - `status.mjs` hiện dòng style đang dùng (`story.style`) và cảnh báo nếu `style.json` mới hơn lần apply (`!` như gate đã đổi);
  - `validate.mjs` kiểm `story.style` trỏ tới style tồn tại;
  - `check-external.mjs` đã có yt-dlp từ phase 2.
- **Docs:**
  - README: mục "Lấy style từ video" (bảng lệnh, consent, ghi chú theo nền tảng, những gì không lấy); bảng biến môi trường thêm `ONE_STUDIO_YTDLP`; bảng yêu cầu thêm yt-dlp (khi dùng link).
  - `references/workflow-gates.md`: bảng edit-after-approval.
  - `package.json` có `npm run test` bao gồm `tests/style.test.mjs` (tự động nếu dùng glob).
- **E2e** (`tests/e2e/style.test.mjs`, cần Chrome + FFmpeg, không mạng):
  1. fixture tổng hợp → fetch (file);
  2. analyze → draft;
  3. điền giả trường `seen` bằng giá trị cố định;
  4. compare;
  5. enhance `--accept`, `style-set` một trường;
  6. apply vào bản sao của `examples/demo`, rồi `validate` sạch, `render-changed-scenes --dry-run` báo đúng số scene, `--as-preset` vào cache tạm.
- **Kiểm chứng tay:**
  - lấy style từ video tham khảo của `videos/vpbank-infinity-board` (hoặc clip người dùng chọn) bằng đường file local;
  - so token với preset `infinity-board` (ΔE2000 ≤ 10 mỗi token, nền sáng, flat);
  - thêm 1 link YouTube và 1 TikTok qua yt-dlp nếu người dùng bật `services.download`;
  - ghi vào `plans/reports/tester-261022-style-extract.md`.

## Files
Sửa: `skills/style-extract/SKILL.md`, one-studio `SKILL.md`, `scripts/status.mjs`, `scripts/validate.mjs`, `README.md`, `references/workflow-gates.md`, `package.json` (nếu cần).
Tạo: `tests/e2e/style.test.mjs`, `plans/reports/tester-261022-style-extract.md`.

## Validation
- `npm test`, `npm run test:e2e`, `npm run validate:demo`, `npm run validate:gps`, `npm run validate:plugin` đều xanh.
- Đối chiếu 10 tiêu chí chấp nhận trong `plan.md`, ghi kết quả từng tiêu chí vào báo cáo tester.
- Review code (`code-reviewer` / `/code-review`) trước khi mở PR vì đổi `applyPreset`, `loadPresets`, `compare-presets` và schema `studio`.

## Risk
Video tham khảo của infinity-board không còn → dùng clip khác người dùng chọn, tiêu chí 10 đổi thành người dùng chấm sheet compare.
