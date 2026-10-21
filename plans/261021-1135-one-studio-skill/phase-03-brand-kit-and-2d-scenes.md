---
phase: 3
title: Brand kit & HyperFrames 2D scenes
status: pending
depends_on: [2]
---

# Phase 3 — Brand kit & HyperFrames 2D scenes

## Mục tiêu
Sinh scene 2D (text/kinetic, diagram, data, lottie) từ storyboard, dùng chung brand tokens.

## Files
- `references/brand-kit.md`, `templates/brand.json`
- `templates/hyperframes-project/` (base layout, `brand.css` sinh từ brand.json, intro/outro, lower-third, transitions chuẩn)
- `references/scene-types/{text,diagram,data,lottie-rive}.md`
- `scripts/brand-to-css.mjs` (brand.json → CSS variables + GSAP ease/duration constants)
- `scripts/optimize-svg.sh` (svgo cho mọi SVG vào `assets/`)

## Việc cần làm
1. Brand kit: hỏi user màu/font/logo hoặc trích từ ảnh/website; lưu ở `series/<name>/brand/`, có `version`.
2. Scene template: mỗi scene 1 file HTML độc lập (`scenes/<id>.html`) chỉ dùng CSS var + motion token → không lệch style.
3. Scene diagram: dùng `archify`/`ak:diagram` sinh SVG → svgo → GSAP DrawSVG/stagger reveal.
4. Scene lottie/rive: nhúng dotLottie / Rive runtime, kiểm tra deterministic seek theo frame.
5. Thumbnail/title card bằng Satori (để phase 7 dùng).

## Done khi
- Storyboard 4 scene (text, diagram, data, lottie) → 4 file HTML preview được trong HyperFrames studio.
- Đổi 1 màu trong brand.json → tất cả scene đổi theo sau khi chạy `brand-to-css`.
