# Phase 5 — compare, apply, preset cache, merge

## Design
- **3 scene mẫu** `skills/style-extract/templates/samples/{title,data,caption}.html`, dựng từ template scene hiện có (`text.html`, `data.html`), chỉ dùng biến brand và class `os-*`. Có chữ tiếng Việt đủ dấu, một biểu đồ dùng màu chuỗi, một dòng phụ đề theo `brand.captions`. Chạy được cả khi project chưa có scene nào (gate 0).
- **`style-compare.mjs <dir> <slug> [--variant v] [--ratio 9:16] [--offline]`**
  - Gộp các layer của style (phase 6; trước đó chỉ có `style.json`) với `brand.json` hiện tại → brand tạm.
  - Dàn dựng trong `.one-studio/styles/<slug>/` theo đúng cách `compare-presets.mjs` dựng `.one-studio/presets/<name>/` (tách `stagePreset` thành helper dùng chung, không chép code).
  - Chụp still 3 scene mẫu ở tỉ lệ của video gốc.
  - Sheet `review/style-<slug>-compare.jpg`: hàng trên là 3 khung gốc tiêu biểu, hàng dưới là 3 scene mẫu, kèm một dải màu token và tên font.
  - Không render video, không đụng approval.
- **`style-apply.mjs <dir> <slug> [--variant v] [--as-preset name] [--keep] [--dry-run]`**
  - Brand: gộp style vào `brand.json` qua cùng hàm merge của `applyPreset` (mở rộng cho motion, transitions, captions, grid, lower_third). Bump `version`, chạy logic `render-changed-scenes --dry-run` và in số scene phải duyệt lại. Script không hỏi, `SKILL.md` bắt Claude hỏi trước khi chạy khi project đã có scene được duyệt.
  - Ghi `studio.json → story.style = { slug, variant }`. Gợi ý writing (`format`, `tone`) chỉ điền vào `story` khi các trường đó còn trống, không ghi đè lựa chọn writers-room đã duyệt.
  - Gợi ý storyboard và audio ghi vào `style-refs/<slug>/hints.json`; gate 3 và gate 7 của `SKILL.md` đọc file này khi có.
  - `--as-preset`: ghi `$(cacheDir)/presets/<name>.json` theo đúng dạng một mục của `brand-presets.json` + `about` sinh từ `STYLE.md` + `source` (URL/tiêu đề).
  - Xoá `source.*` và `frames/` nếu không có `--keep`; giữ metrics, style, sheet.
- **Preset cache:** `lib/presets.mjs` → `loadPresets()` gộp plugin + cache (cache không được ghi đè tên của plugin; trùng tên thì báo lỗi). `PRESET_NAMES`, `compare-presets`, `init-project --preset` tự thấy preset mới. Câu hỏi preset ở gate 0 liệt kê thêm preset trong cache.
- **`style-merge.mjs <dir> <slug-a> <slug-b> [...] --as <slug>`**
  - Metrics số lấy trung vị.
  - Palette: các cụm xuất hiện ở ≥ 2 nguồn (ΔE ≤ 8), trọng số cộng dồn.
  - Trường `seen`: lấy giá trị đa số, hoà thì để `null` cho Claude chọn.
  - `reference` trở thành mảng.

## Files
Tạo: `scripts/style-compare.mjs`, `scripts/style-apply.mjs`, `scripts/style-merge.mjs`, `skills/style-extract/templates/samples/*.html`.
Sửa: `scripts/compare-presets.mjs` (tách helper dàn dựng ra `lib/stage-brand.mjs`), `scripts/lib/presets.mjs`, one-studio `SKILL.md` (gate 0 liệt kê preset cache; gate 3/7 đọc `hints.json`), `tests/style.test.mjs`, `tests/features.test.mjs` (preset cache).

## Validation
- `compare-presets` vẫn ra cùng sheet như trước khi tách helper (test hiện có xanh).
- `style-apply --dry-run` không ghi file nào; chạy thật thì bump version và không chép gì từ `style-refs/` sang `assets/` (test liệt kê file).
- Preset cache: `ONE_STUDIO_CACHE` trỏ thư mục tạm → `--as-preset` rồi `loadPresets()` thấy preset mới; trùng tên plugin thì báo lỗi.
- `story` đã có `tone` → apply không ghi đè.
- Merge 2 style tổng hợp → trung vị đúng; màu chỉ có ở một nguồn bị loại.

## Risk
Merge brand mở rộng đổi hành vi `applyPreset` → giữ nguyên hành vi cũ cho các key cũ; các key mới chỉ merge khi style có, và được test riêng.
