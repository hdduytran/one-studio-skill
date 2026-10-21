---
phase: 1
title: Research & contracts
status: done
depends_on: []
---

# Phase 1 — Research & contracts

## Mục tiêu
Chốt các hợp đồng dữ liệu (schema) và cách gọi từng phụ thuộc trước khi viết code.

## Việc cần làm
1. Đọc `DIRECTOR.md`, `TECHNIQUE.md`, 1 `styles/<x>/STYLE.md` của lemo-opuscar; ghi lại lệnh render clip và output (fps, size, đường dẫn mp4).
2. Đọc `SKILL.md` + `kit/` của anatomy; xác nhận cách xuất SVG tĩnh/tách lớp (`scripts/capture.mjs`, `print.mjs`).
3. Đọc skill `hyperframes-cli`, `hyperframes-keyframes` đã cài: lệnh init, preview, snapshot frame, render; ghi flag cần dùng.
4. Gọi thử ZeroTTS và OmniVoice `/v1/audio/speech` với 1 câu: ghi format trả về (wav/mp3), sample rate, voice id.
5. Viết schema:
   - `studio.schema.json` (project manifest: meta, brand ref, engine, scenes[], audio, render).
   - `storyboard.schema.json` (scene: id, type, duration, script lines, assets, transition).
   - `brand.schema.json` (colors, fonts, logo, motion tokens, caption style, voice preset).

## Files tạo
- `plans/reports/researcher-261021-dependencies.md`
- `<plugin>/skills/one-studio/schemas/{studio,storyboard,brand}.schema.json`

## Done khi
- Report có lệnh chính xác cho HyperFrames, anatomy, lemo, 2 TTS.
- 3 schema validate được 1 file ví dụ (`node scripts/validate.mjs examples/demo/studio.json`).

## Rủi ro
- Lệnh CLI HyperFrames khác giả định → cập nhật phase 3 trước khi code.

## Kết quả (2026-10-21)
- Report: `plans/reports/researcher-261021-dependencies.md` (HyperFrames đã chạy thật: render + snapshot; anatomy, lemo đọc từ source).
- 3 schema + `validate.mjs` (không phụ thuộc ngoài) pass trên `examples/demo/`.
- **Pending cho user:** gọi thử ZeroTTS / OmniVoice `/v1/audio/speech` trên máy local (server local không truy cập được từ cloud) — checklist ở mục 5 của report.
- Ảnh hưởng tới phase sau: GSAP phải nạp local (`assets/vendor/gsap.min.js`), CDN làm hỏng render; `snapshot` chỉ nhận thư mục project → phase 4 dựng thư mục review tạm cho từng scene; render từng scene bằng `render -c scenes/<id>.html` chạy được.
