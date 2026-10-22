# Phase 3 — playbooks, formats, tones

## Requirements
Mẫu bắt buộc mỗi playbook (≤ 90 dòng): Dùng khi · Câu hỏi của người xem · Câu hỏi Story core riêng · Khung beat (% thời lượng) · 3 kiểu hook · Visual mode gợi ý · Nghiên cứu cần gì · Bẫy hay gặp · Checklist duyệt. Mỗi playbook có một ví dụ beat outline ngắn bằng tiếng Việt.

14 playbook (`playbooks/<id>.md`), nội dung lấy từ report mục 5 và 9:
- Thương mại: `saas-product`, `opensource-devtool`, `comparison`, `customer-story`, `tutorial-walkthrough`, `brand-story`.
- Thông tin: `news-recap`, `mechanism-system`, `concept-explainer`, `data-story`, `history-timeline`, `review-teardown`, `video-essay`.
- Xã hội: `list-countdown`.

4 format (`formats/<id>.md`, ≤ 40 dòng): `short-vertical`, `long-form`, `series-episode`, `no-voice`.
`tones.md`: 5 giọng, mỗi giọng 3 câu mẫu vi + 3 en + điều cấm.

## Steps
1. Viết 1 playbook mẫu (`mechanism-system`) và review mẫu với user trước khi viết 13 cái còn lại.
2. Viết phần còn lại, cập nhật `index.md`.
3. Test: script kiểm cấu trúc (đủ 9 heading, ≤ 90 dòng, visual mode được nhắc đến phải tồn tại ở phase 4).

## Validation
`tests/playbooks.test.mjs` kiểm cấu trúc và giới hạn dòng.

## Risk
Playbook nhạt, chung chung → mỗi playbook phải có ví dụ cụ thể và "bẫy" rút từ research, không viết lời khuyên ai cũng biết.
