# Phase 4 — visual modes + storyboard schema

## Requirements
- `writers-room/visual-modes/index.md` + mỗi mode một file ≤ 60 dòng (dùng khi, kỹ thuật, tham số, bẫy): `world-camera`, `match-cut-motif`, `screen-cinema`, `desk-collage`, `exploded-cutaway`, `kinetic-type`, `split-compare`, `archive-documents`, `data-story-motion`.
- Mode là cách dàn dựng, không phải scene type mới (trừ `screen`). Một scene có thể `type: diagram` + `mode: exploded-cutaway`.
- `storyboard.schema.json` (tuỳ chọn, tương thích ngược):
  - gốc: `worlds: { <name>: { file, size: {w,h} } }`, `motifs: [{ id, selector, note }]`;
  - scene: `mode`, `world`, `camera: { from, to, move: cut|push|fly|orbit|follow, ease }` (from/to là `place` id hoặc `{x,y,zoom}`), `handoff: { selector, to_scene }`, `motion: "smooth" | "stepped-12"`;
  - line: `kind: fact|quote|opinion|narration`, `source`;
  - `sceneType` thêm `screen`.
- `motion: stepped-12`: os.js lượng tử hoá thời gian timeline về 12 fps cho scene đó (kiểu Vox), render vẫn 30/60 fps.
- Cross-check trong `--approve storyboard`: world/place tồn tại, motif dùng đúng id, mode có file.

## Files
Tạo: mode files, test. Sửa: `schemas/storyboard.schema.json`, `scripts/lib/schema.mjs`, `templates/hyperframes-project/assets/os.js` (`stepped-12`), `references/scene-types/_common.md` (1 đoạn trỏ sang mode).

## Validation
Schema test cho storyboard cũ + mới; test stepped-12 cho cùng frame ở t và t+1/60 khi cùng bước.
