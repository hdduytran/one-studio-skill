# Phase 5 — thế giới liên tục + camera

## Context
Mỗi scene là một clip, ghép copy stream. Hash scene đã theo mọi file tham chiếu (`lib/hash.mjs`), nên một file thế giới dùng chung làm re-render đúng các scene dùng nó.

## Design
- `worlds/<name>.html`: canvas lớn (đơn vị `--u`), các vị trí `data-place="<id>"`, trạng thái có tên `data-state` cho phần tử (vd. vệ tinh `idle|signal`). Brand variables như scene thường.
- Scene có `world` sẽ nhúng thế giới (template `new-scene` sinh sẵn) và gọi:
  - `S.camera(from, to, { move, ease, at, dur })` — tính transform từ rect của place, giữ tỉ lệ khung; hỗ trợ zoom sâu (lồng lớp, scale log để tốc độ zoom đều);
  - `S.state(id, name, { at })` — đổi trạng thái phần tử thế giới, deterministic.
- Liên tục: nếu sN và sN+1 cùng world thì `sN.camera.to == sN+1.camera.from` và trạng thái cuối sN = trạng thái đầu sN+1 (khai báo `exit_state` / tự suy từ lệnh `S.state`); transition giữa chúng ép `cut`.
- `seam-check.mjs <project> [--pairs]`: chụp frame cuối sN và frame đầu sN+1 (dùng engine stills), so sánh pixel (ngưỡng mặc định), xuất `review/seams.jpg`. Chạy trong gate 5 cho các cặp cùng world hoặc có `handoff`.
- `handoff` (scene không cùng world): đo bbox selector ở cuối sN và đầu sN+1 qua Playwright, cảnh báo khi lệch > 2%.
- Ratio khác (9:16): camera tính lại từ place nên không cần CSS riêng; `<style data-ratio>` vẫn dùng được.
- VO kéo dài scene: camera `dur` mặc định = cả scene, nên giãn theo; frame cuối giữ nguyên nên seam vẫn khớp.

## Files
Tạo: `templates/worlds/basic.html`, `scripts/seam-check.mjs`, `tests/world.test.mjs`, fixture 2 scene cùng world. Sửa: `os.js`, `new-scene.mjs`, `keyframe-stills.mjs` (gọi seam sheet), `validate.mjs`, `concat-and-mix.mjs` (không chèn transition giữa cặp cùng world), `references/workflow-gates.md`, `visual-modes/world-camera.md`.

## Validation
- Unit: tính camera transform, kiểm continuity.
- e2e: 2 scene cùng world → seam diff dưới ngưỡng; sửa scene 2 → chỉ scene 2 render lại; sửa world → cả 2.

## Risk
- Thế giới lớn làm render chậm: chỉ hiển thị place gần camera (culling theo viewport), ảnh tối ưu bằng `optimize-assets`.
- Encode khác nhau ở frame nối có thể nháy: mọi clip đã chuẩn hoá cùng encode; seam-check bắt sớm.
