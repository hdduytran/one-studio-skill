---
phase: 7
title: Series, publish & packaging
status: done
depends_on: [5, 6]
---

# Phase 7 — Series, publish & packaging

## Mục tiêu
Sản xuất series nhất quán; xuất nhiều tỉ lệ; plugin hoàn chỉnh.

## Việc cần làm
1. `init-project.mjs --series <name>` tái dùng brand, intro/outro, voice preset; không hỏi lại.
2. Publish: render 16:9 / 9:16 / 1:1 (layout responsive theo CSS var `--aspect`), thumbnail Satori, `out/manifest.json`.
3. README plugin: cài đặt, yêu cầu (Node ≥ 20, FFmpeg, Chrome), cấu hình TTS env.
4. Version plugin, `marketplace.json` cập nhật.

## Done khi
- Tập 2 của series tạo không hỏi lại brand/voice và khớp màu/font với tập 1.
- 1 lệnh publish ra 3 tỉ lệ + thumbnail.

## Kết quả (2026-10-21)
- Tập mới của series kế thừa brand, giọng, đồng ý TTS, định dạng; `series-bumper.mjs` lưu intro/outro dùng chung.
- `publish.mjs`: 1 lệnh → nhiều tỉ lệ (dựng lại bố cục, cache theo scene + tỉ lệ), thumbnail mỗi tỉ lệ, contact sheet, `out/manifest.json`.
- Plugin 0.2.0, icon, README đầy đủ (yêu cầu, biến môi trường, lệnh).
