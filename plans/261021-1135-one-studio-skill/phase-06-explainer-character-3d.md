---
phase: 6
title: Explainer (anatomy), character (lemo-opuscar), 3D
status: done
depends_on: [4]
---

# Phase 6 — Explainer, character, 3D

## Mục tiêu
Các loại scene đặc biệt, chỉ nạp khi storyboard cần.

## Files
- `references/scene-types/explainer-anatomy.md`
- `references/scene-types/character-lemo.md`
- `references/scene-types/3d.md`
- `templates/remotion-project/` (chỉ cho 3D R3F)
- `scripts/check-external-skill.mjs` — kiểm tra anatomy / lemo-opuscar / remotion skill đã cài; nếu chưa, in lệnh cài và hỏi user.

## Việc cần làm
1. **Explainer:** gọi anatomy tạo figure → xuất SVG (tách lớp) → svgo → scene HyperFrames animate bằng GSAP theo beat lời thoại.
2. **Character:** chọn 1 style lemo-opuscar, chỉ đọc `STYLE.md` đó; render clip riêng bằng pipeline của lemo với fps/size/màu nền khớp project → đưa vào `out/scenes/` như scene thường (hash gồm style + prompt).
3. **3D:** mặc định three.js thuần trong HyperFrames; Remotion + R3F/Drei/Rapier/Postprocessing khi cần physics/postfx. Render ra clip riêng.
4. Mỗi loại cập nhật bảng credit (mức "cao") để cảnh báo trước.

## Done khi
- Storyboard có 1 scene explainer + 1 character + 1 3D → render, QA và concat được với scene 2D, không lệch fps/size.

## Kết quả (2026-10-21)
- 3D mặc định three.js trong HyperFrames (đã kiểm); Remotion + R3F chỉ khi `three.physics`/`three.postfx` (`new-remotion.mjs`, đã render thật).
- Explainer: `anatomy-to-svg.mjs` tách figure anatomy thành SVG có CSS khoanh vùng, animate `data-part` bằng GSAP (đã render với ví dụ dial-indicator).
- Character: scene lemo theo hợp đồng trang, render qua `core/render/video.mjs` rồi chuẩn hoá (đã render).
- `check-external.mjs` kiểm tra và in lệnh cài cho anatomy, lemo, remotion, hyperframes, ffmpeg.
