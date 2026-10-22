# Phase 8 — tích hợp, docs, video mẫu

## Requirements
- one-studio `SKILL.md` router: thêm `screen`, cột "mode", trỏ gate 1–3 sang writers-room; giữ ≤ 100 dòng.
- `workflow-gates.md`: gate 1 Story core, gate 2 lint + đọc to, gate 3 chọn mode/world, gate 5 seam sheet.
- `credit-estimation`: thêm chi phí world (scene dài hơn), capture.
- README: mục writers-room, playbook, world, capture.
- Video mẫu `examples/gps-world/` theo `mechanism-system` + `world-camera`: brief có Story core, research, script 2 cột, storyboard 5–7 scene cùng một world, render đủ gate. So với `examples/demo` cũ bằng 8 tiêu chí ở report mục 8; user duyệt.
- Đo ngân sách: ghi số dòng thực tế nạp ở mỗi gate vào report kết quả.

## Validation
`npm test`, `npm run test:e2e`, `npm run validate:plugin`, `validate:demo`, render video mẫu.

## Output
Report `plans/reports/tester-<date>-writers-room.md`: kết quả test, seam diff, ngân sách context đo được, nhận xét của user về video mẫu.
