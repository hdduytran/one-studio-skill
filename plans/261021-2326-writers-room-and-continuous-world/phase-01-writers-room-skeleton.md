# Phase 1 — writers-room skeleton

## Context
Gate 1–2 hiện chỉ có `templates/brief.md` (bảng field) và `templates/script.md` (bullet câu). `script.md` không bị parse, chỉ hash làm input gate 2, nên đổi định dạng an toàn.

## Requirements
- Sub-skill mới `plugins/one-studio/skills/writers-room/` với `SKILL.md` ≤ 90 dòng: quy trình research → info doc → angle → beat outline → visual abstract → script 2 cột → lint → đọc to → cắt; router chọn playbook/format/tone.
- `playbooks/index.md`: 1 dòng/playbook (id · dùng khi · tín hiệu trong yêu cầu của user).
- Templates: `brief-story-core.md` (bảng Story core: angle, người thật, căng thẳng, hiểu lầm, 3 chi tiết riêng, quan điểm/giọng, lời hứa & trả nợ, nguồn), `research.md` (fact · trích dẫn · nguồn · ngày · "thú vị nhưng không dùng"), `script-av.md`.
- Script 2 cột vẫn giữ quy ước hiện có: `## sNN · title`, mỗi `- ` là 1 câu TTS; thêm dòng `> visual:`, `> camera:`, `> sfx:`, `> silence: 1.5s`, `> source: <id>`.
- `studio.schema.json` thêm `story: { playbook, format, tone, modes[] }` (tuỳ chọn).
- one-studio `SKILL.md` gate 1–2: "đọc writers-room SKILL.md"; gate 1 hỏi tối đa 3 câu Story core user chưa trả lời (angle, người thật/hiểu lầm, quan điểm).

## Files
Tạo: `skills/writers-room/SKILL.md`, `playbooks/index.md`, `templates/*.md`. Sửa: `one-studio/SKILL.md`, `references/workflow-gates.md`, `schemas/studio.schema.json`, `templates/brief.md` (thêm phần Story core), `.claude-plugin/plugin.json` nếu cần khai báo skill.

## Steps
1. Kiểm cách plugin khai báo nhiều skill (`claude plugin validate`).
2. Viết SKILL.md + index + templates.
3. Mở rộng schema, test schema cho `story`.
4. Sửa gate 1–2 trong one-studio.

## Validation
`npm test`, `npm run validate:plugin`, `npm run validate:demo`. Đếm dòng SKILL.md/index.

## Risk
Hai skill cùng trigger "làm video": description của writers-room chỉ nói "được one-studio gọi ở gate 1–2" + trigger "viết kịch bản video".
