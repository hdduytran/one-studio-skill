---
phase: 2
title: Plugin skeleton & gated workflow
status: pending
depends_on: [1]
---

# Phase 2 — Plugin skeleton & gated workflow

## Mục tiêu
`claude plugin install` được; `/one-studio` dẫn user qua các gate 0–4 (setup → brief → script → storyboard → credit estimate).

## Cấu trúc
```
.claude-plugin/marketplace.json
plugins/one-studio/
  .claude-plugin/plugin.json
  skills/one-studio/
    SKILL.md                     # < 150 dòng: flow, gate, router, quy tắc nạp reference
    references/workflow-gates.md
    references/engine-selection.md
    references/credit-estimation.md
    scripts/init-project.mjs
    scripts/validate.mjs
    scripts/status.mjs           # in trạng thái gate + scene từ studio.json
    templates/brief.md  script.md  storyboard.json
```

## Việc cần làm
1. `plugin.json`, `marketplace.json` (tham khảo layout của lemo-opuscar).
2. `SKILL.md`: mỗi gate ghi rõ (input, output file, điều kiện chuyển, câu hỏi cho user). Bước 0 hỏi: 2D/3D, ngôn ngữ VO, series/brand có sẵn chưa. Engine mặc định HyperFrames.
3. `init-project.mjs <dir> [--series <name>]`: tạo `brief.md`, `script.md`, `storyboard.json`, `studio.json`, `brand/` (link tới series nếu có).
4. `status.mjs`: đọc `studio.json`, in gate hiện tại → skill luôn resume đúng chỗ (cho phép user quay lại sau).
5. `credit-estimation.md` + hàm trong `status.mjs --estimate`: bảng scene × loại × mức token (thấp/vừa/cao) + reference sẽ nạp. Cảnh báo khi > 8 scene hoặc có 3D/character.
6. Router: bảng `scene.type → reference file + skill ngoài`. SKILL.md chỉ đọc reference khi storyboard có type đó.

## Done khi
- `claude plugin marketplace add ./` + install chạy được.
- Chạy `/one-studio` trên thư mục rỗng → tạo project, dừng chờ duyệt ở script và storyboard.
- `status.mjs --estimate` in bảng ước tính.
