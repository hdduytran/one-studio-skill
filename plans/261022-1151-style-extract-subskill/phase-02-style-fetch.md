# Phase 2 — `style-fetch.mjs`: file local + link

## Design
- `style-fetch.mjs <dir> <url|file> [--slug s] [--from 0:00] [--to 1:30] [--max 90] [--keep]`
  - **File local:** cắt đúng đoạn bằng FFmpeg (stream copy nếu được, ngược lại re-encode ≤ 720p) vào `style-refs/<slug>/source.mp4`; ghi `info.json` (`file`, `title` = tên file, `duration`, `range`, `accessed`).
  - **Link:**
    - Dừng với thông báo nếu `services.download !== true`. Câu hỏi consent nằm trong `SKILL.md`: video dùng làm tham khảo style, file bị xoá sau khi áp dụng, người dùng có trách nhiệm với điều khoản của nền tảng.
    - Tìm `yt-dlp` (PATH hoặc `ONE_STUDIO_YTDLP`). Thiếu thì `check-external.mjs` in lệnh cài (`brew install yt-dlp` / `pipx install yt-dlp`); không tự cài.
    - Chạy `yt-dlp` với: `-f "bv*[height<=720]+ba/b[height<=720]"`, `--download-sections "*<from>-<to>"`, `--no-playlist`, `--write-info-json`, `--write-subs --write-auto-subs --sub-langs "vi.*,en.*" --sub-format vtt`, `--no-cookies-from-browser`, `-o` vào thư mục slug; không truyền cookies.
    - Gọi bằng `spawnSync` với mảng args (không qua shell); kiểm URL là `http(s)` trước khi gọi.
    - Từ `.info.json` của yt-dlp chỉ giữ `title`, `uploader`, `webpage_url`, `duration`, `extractor`, `width`, `height` → `info.json` của ta; xoá file gốc của yt-dlp (có thể chứa dữ liệu thừa).
  - **Phân loại lỗi** (đọc stderr): cần đăng nhập/riêng tư/giới hạn tuổi, extractor hỏng (gợi ý `yt-dlp -U`), không có định dạng, mạng. Mỗi loại một thông báo tiếng Việt/Anh; với nhóm đăng nhập: "Hãy tự tải video rồi chạy lại với đường dẫn file."
  - `--max` (mặc định 90 giây) chặn khi `--to - --from` vượt quá; `--max 0` = không giới hạn.
  - In ra slug, đường dẫn, thời lượng, có phụ đề hay không.
- Phát hiện nền tảng (`youtube|tiktok|facebook|instagram|other`) theo extractor, ghi vào `info.json` để phase 3 biết có cần che watermark TikTok hay không.
- `check-external.mjs`: thêm `yt-dlp` vào `CHECKS`; `neededTools` trả về nó khi `style-refs/*/info.json` có `url` mà thiếu `source.*`.

## Files
Tạo: `scripts/style-fetch.mjs`, `scripts/lib/ytdlp.mjs` (dựng args, phân loại lỗi, lọc info).
Sửa: `scripts/check-external.mjs`, `tests/style.test.mjs`.

## Validation
- Unit (không mạng): dựng args cho mọi tổ hợp `--from/--to/--max`; mỗi mẫu stderr đã lưu phân loại đúng nhóm; URL không phải http bị từ chối; khi `services.download` false thì thoát trước khi tìm yt-dlp.
- File local: clip lavfi 120 giây + `--to 0:30` → source dài 30 giây ±1 khung, `info.json` hợp lệ.
- Thử tay (ghi vào báo cáo tester, không chạy trong CI): 1 link YouTube, 1 Shorts, 1 TikTok, 1 Facebook reel công khai.

## Risk
Extractor của yt-dlp hỏng theo nền tảng → không phụ thuộc vào nó: đường file local luôn chạy được, và thông báo lỗi chỉ cách tự tải.
