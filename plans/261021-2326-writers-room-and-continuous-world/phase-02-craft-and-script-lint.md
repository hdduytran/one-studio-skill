# Phase 2 — craft files + script-lint

## Requirements
- `craft/story-core.md` (angle, người thật, hiểu lầm, promise/payoff), `craft/beat-outline.md` (but/therefore, % thời lượng, re-hook), `craft/write-for-the-ear.md` (nói như người, số cho TTS vi/en, nhịp, khoảng lặng, câu có quan điểm), `craft/research-and-info-doc.md`. Mỗi file ≤ 60 dòng.
- `scripts/script-lint.mjs <project> [--json]` đọc `script.md` (+ `research.md`, `studio.json → story`):
  - cụm sáo rỗng theo ngôn ngữ (`data/slop-vi.json`, `data/slop-en.json`, có regex);
  - câu > 20 từ; chữ số / ký hiệu chưa viết cho tai (cảnh báo, gợi ý dùng `say`);
  - số lần "và rồi / rồi thì / and then" giữa beat (> 1 là lỗi);
  - scene thiếu `> visual:`; video không có `> silence:` nào (cảnh báo);
  - playbook `news-recap`: câu không có `> source:` hoặc id không có trong `research.md`;
  - tổng từ vs thời lượng (vi 2.8, en 2.5 từ/s; cảnh báo khi > 90%).
  - Chỉ in vi phạm (file:dòng · luật · gợi ý). Exit 1 khi có lỗi.
- Gate 2: chạy lint trước khi xin duyệt; `status.mjs --approve script` từ chối khi lint lỗi (có `--force-lint` khi user chấp nhận).

## Files
Tạo: 4 craft file, `scripts/script-lint.mjs`, `scripts/data/slop-*.json`, `tests/script-lint.test.mjs`, fixture script tốt/xấu. Sửa: `scripts/status.mjs`.

## Validation
Unit test từng luật, cả vi lẫn en; fixture demo cũ chỉ được cảnh báo, không lỗi (tương thích).

## Risk
Danh sách cấm quá rộng gây báo nhầm → mỗi mục có `severity` và ví dụ thay thế; giữ ngắn.
