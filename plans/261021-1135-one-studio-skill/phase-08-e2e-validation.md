---
phase: 8
title: End-to-end validation
status: done
depends_on: [7]
---

# Phase 8 — E2E validation

## Kịch bản test
| # | Kịch bản | Kiểm |
|---|---|---|
| a | Brief → video 2D 45s tiếng Việt | đủ gate, có duyệt script/storyboard/keyframe |
| b | Thêm 1 scene | chỉ 1 render, hash cũ giữ nguyên |
| c | Tập 2 của series | không hỏi lại brand |
| d | Ước tính credit | bảng hiện trước gate 5, 6, 9 |
| e | Keyframe review | không render full khi chưa duyệt |
| f | Scene explainer + character | concat không lỗi |

## Kiểm tự động
- `node --test plugins/one-studio/skills/one-studio/scripts/*.test.mjs` (hash, captions timing, validate schema, estimate).
- ffprobe QA trên `out/final.mp4`.

## Done khi
Tất cả (a)–(f) pass; ghi kết quả vào `plans/reports/tester-*.md`.

## Kết quả (2026-10-21)
Tất cả (a)–(f) pass. Báo cáo: `plans/reports/tester-261021-e2e.md`. Test nằm ở `tests/` (không đặt trong plugin để plugin nhẹ).
