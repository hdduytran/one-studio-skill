---
phase: 4
title: Keyframe review & incremental render
status: done
depends_on: [3]
---

# Phase 4 — Keyframe review & incremental render

## Mục tiêu
User duyệt frame mẫu trước khi render; thêm/sửa scene chỉ render lại phần thay đổi.

## Files
- `scripts/keyframe-stills.mjs` — render 1–3 still/scene (đầu, giữa, cuối) → `review/<id>-<n>.png` + contact sheet `review/sheet.png`.
- `scripts/scene-hash.mjs` — hash = nội dung scene + asset hashes + brand.version + engine version + fps/size.
- `scripts/render-changed-scenes.mjs` — render scene có hash mới → `out/scenes/<id>-<hash>.mp4`; cập nhật `studio.json`.
- `scripts/concat-and-mix.sh` — FFmpeg concat demuxer (`-c copy`) theo thứ tự storyboard.
- `references/render-ffmpeg.md`

## Việc cần làm
1. Gate 5: tạo contact sheet → hiển thị cho user → ghi `approved: true` theo scene.
2. Chỉ render scene đã approved; scene đổi nội dung tự reset approved.
3. QA trước concat: ffprobe kiểm fps, resolution, pix_fmt, codec giống nhau; sai → render lại scene đó với preset chuẩn.
4. Preview low-res (gate 8): render 540p nhanh, concat, cho user xem.

## Done khi
- Thêm 1 scene vào video 4 scene → chỉ 1 lần render, 4 clip cũ giữ nguyên hash, concat ra video 5 scene.
- Sửa brand.version → script báo "5 scene sẽ render lại" và hỏi user.

## Kết quả (2026-10-21)
- `keyframe-stills.mjs` (contact sheet có nhãn, chỉ scene thay đổi), `status.mjs --approve-scenes`, `render-changed-scenes.mjs` (chặn scene chưa duyệt, exit 2), `concat-and-mix.mjs` (stream copy). Gate 5–10 dùng hash scene/audio; sửa scene chỉ mở lại scene đó.
- Thêm 1 scene → đúng 1 lần render (E2E). Clip của mọi engine được chuẩn hoá về một kiểu encode.
- Khác plan: `concat-and-mix` viết bằng Node (.mjs) thay cho .sh để chạy được trên Windows.
