# Phase 7 — tin tức: research theo yêu cầu + nhãn nguồn

## Requirements
- Playbook `news-recap` hỏi ở gate 1: "Có muốn mình research thêm không? (cần web search)". Có → `services.web: true`.
- Research chạy trong subagent (researcher) với brief cố định: chủ đề, khoảng thời gian, ≥ 2 nguồn độc lập cho mỗi fact, ghi ngày, tách fact/trích dẫn/ý kiến. Trả về đúng `research.md` theo template; trang thô không vào context chính.
- `research.md`: mỗi mục có `id`, loại, nội dung, nguồn (URL, tên báo), ngày đăng, ngày truy cập.
- Storyboard line `kind` + `source`; render:
  - `opinion` → chip "Ý KIẾN"/"OPINION" (brand class `os-label-opinion`) khi câu đó đang đọc;
  - `quote` → hiển thị tên người nói + nguồn;
  - mô tả nguồn hiện góc màn hình hoặc trong khung "Nguồn" cuối video; `publish` ghi danh sách nguồn vào `out/manifest.json` và mô tả video.
- Ảnh chụp tiêu đề báo: tự chụp bằng `capture-screen` (mode still) kèm URL, không tải ảnh bản quyền.
- Lint (phase 2): fact thiếu nguồn = lỗi; trích dẫn không có trong research = lỗi.

## Files
Sửa: `playbooks/news-recap.md`, `templates/research.md`, `os.js` (`S.lines` gắn chip theo `kind`), `brand-to-css.mjs` (class nhãn), `publish.mjs`, `studio.schema.json` (`services.web`). Tạo: `tests/news.test.mjs`.

## Validation
Fixture storyboard có fact/quote/opinion → still có chip đúng lúc; manifest có nguồn; lint bắt fact thiếu nguồn.
