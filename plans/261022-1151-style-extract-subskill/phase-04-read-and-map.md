# Phase 4 — đọc & map sang one-studio

## Design
Chia hai phần: phần **xác định** do code làm (`style-draft.mjs`), phần **nhìn** do Claude làm theo hướng dẫn.

1. `style-draft.mjs <dir> <slug>` → bản nháp `style.json` từ `metrics.json` (mọi trường ghi `measured`):
   - **Màu:** gán vai trò từ palette. `bg` = cụm ở viền/lớn nhất; `fg` = cụm có tương phản cao nhất với `bg`; `primary`/`secondary`/`accent` = các cụm chroma cao theo trọng số, cách nhau ΔE ≥ 15; `muted` = cụm chroma thấp ở giữa `bg` và `fg`. Thiếu cụm thì để trống (phase 6 bổ sung).
   - **Motion:**
     - `motion.duration.base` suy từ ASL (bảng trong `mapping.md`, ví dụ ASL < 1.2 s → 0.3, 1.2–3 s → 0.5, > 3 s → 0.8);
     - `ease` suy từ `motion.profile`;
     - `stagger` suy từ `motion.class`.
   - **Storyboard:** `target_shot_seconds` = trung vị shot; `sfx_density` từ số cắt/phút; `transitions.default` = `cut` nếu không có fade, ngược lại `fade`.
   - **Audio:** `lufs`, `silence_ratio`, `has_voice`; bed gần nhất trong `lib/music.mjs` (`PRESETS`/`MOODS`) theo năng lượng (motion + số cắt/phút) và độ sáng.
   - **Writing:** `words_per_minute`; `format` = `short-vertical` nếu 9:16 và < 90 giây.
   - Trường cần mắt nhìn được đặt `null` + `provenance: guessed` để Claude điền.
2. Claude đọc 2 sheet + `metrics.summary` + `hook_text`, theo `references/reading-guide.md`, rồi điền và ghi `seen`:
   - kiểu chữ (họ, độ đậm, hoa/thường, tracking) → font qua `references/font-map.md`;
   - bố cục và lưới, chữ đặt ở đâu, mật độ chữ;
   - phụ đề: vị trí, cỡ, nền, highlight từng từ;
   - kiểu chuyển cảnh (từ sheet `cuts`);
   - surface (flat/glass);
   - visual mode gần nhất trong `writers-room/visual-modes/index.md`; tone theo `tones.md`; kiểu hook;
   - `do_not_copy[]`.
   Sau đó viết `STYLE.md` (≤ 60 dòng, từ `templates/STYLE.md`).
3. `references/font-map.md`: bảng họ chữ → font Fontsource có đủ dấu tiếng Việt kèm version đã pin, ví dụ:
   - geometric sans → Be Vietnam Pro / Montserrat;
   - grotesk → Inter;
   - serif hiển thị → Fraunces / Playfair Display;
   - mono → JetBrains Mono;
   - rounded → Nunito;
   - viết tay → Patrick Hand.
   Mỗi dòng ghi đã kiểm tra subset `vietnamese`. Font chưa có trong cache được tải qua `vendorFontsource` như hiện nay.
4. `references/mapping.md`: các bảng ASL → motion, metrics → visual mode/format/tone, metrics → bed nhạc, quy ước điền `provenance`.
5. `references/reading-guide.md`: checklist nhìn sheet (≤ 80 dòng), câu hỏi cần trả lời, không đoán tên font thương mại, cách mô tả để người dùng hiểu.
6. Kiểm tra: `style-draft --check` validate schema, cảnh báo trường còn `null`.

## Files
Tạo: `scripts/style-draft.mjs`, `scripts/lib/style-map.mjs` (gán vai trò màu, các bảng map), `skills/style-extract/references/{reading-guide,font-map,mapping}.md`, `skills/style-extract/templates/STYLE.md`.
Sửa: `tests/style.test.mjs`.

## Validation
- Gán vai trò màu: palette nền sáng/chữ đen/1 nhấn đỏ → `bg`, `fg`, `primary` đúng; palette tối kiểu neon → đúng.
- Bảng ASL → motion và metrics → bed: test theo từng ngưỡng.
- Mọi font trong `font-map.md` resolve được qua `vendorFontsource` (test offline chỉ kiểm cú pháp spec; e2e tải thật).
- Bản nháp trên fixture phase 3 hợp lệ theo schema với `provenance` đầy đủ.

## Risk
Claude đoán kiểu chữ sai → luôn hiện font đã chọn + lý do ở bước compare; phase 6 cho đổi font nhanh. Không bao giờ ghi một font thương mại vào brand.
