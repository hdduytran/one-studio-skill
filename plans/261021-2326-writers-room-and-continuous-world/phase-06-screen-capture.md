# Phase 6 — tự quay màn hình + scene `screen`

## Design
- `flows/<id>.json` (schema mới `flow.schema.json`): `url`, `viewport`, `storage_state?` (đường dẫn file user cung cấp), `steps[]`: `goto | click(selector) | type(selector, text, cps) | press | scroll(to|by) | hover | wait(ms|selector) | mark(name)`.
- `capture-screen.mjs <project> <flow-id>`: Playwright + Chrome đã có; quay video CFR (re-encode FFmpeg) và ghi `capture/<id>/events.json` (t, vị trí con trỏ, rect phần tử được click/gõ, scroll, mark). Ẩn con trỏ thật. Chỉ mở URL trong flow; không bao giờ nhập mật khẩu (từ chối step `type` vào `input[type=password]`).
- Scene `type: screen` (`screen: { flow, from_mark, to_mark, frame: window|device|none, zoom: auto|manual, cursor: { size, smooth } }`):
  - video đặt trong khung cửa sổ/thiết bị trên nền brand;
  - camera ảo zoom vào rect của click (auto: gộp các click gần nhau, tối thiểu 1.2 s mỗi lần zoom, bỏ chuyển động nhỏ);
  - con trỏ vẽ lại, nội suy spring xác định từ events (drag dùng dữ liệu thô), ripple khi click, motion blur khi lia nhanh;
  - 9:16 tự tính lại khung zoom.
- Hash scene gồm flow + video đã quay; quay lại chỉ khi flow đổi (`--recapture` để ép).
- Consent: quay là thao tác trên trang của user → hỏi một lần, ghi `services.capture: true`.

## Files
Tạo: `schemas/flow.schema.json`, `scripts/capture-screen.mjs`, `templates/scenes/screen.html`, `references/scene-types/screen.md`, `tests/capture.test.mjs` (trang fixture local). Sửa: `lib/engines.mjs`, `lib/schema.mjs`, `new-scene.mjs`, `check-external.mjs`, router trong one-studio `SKILL.md`.

## Validation
- Fixture HTML local: flow click 3 nút → events có 3 rect đúng; scene zoom vào đúng vùng (đo trong still).
- Render 2 lần ra cùng hash frame (xác định).
- Từ chối gõ vào ô password.

## Risk
Trang động (animation, quảng cáo) làm video khác nhau mỗi lần quay → video quay là asset cố định, chỉ quay lại khi user yêu cầu.
