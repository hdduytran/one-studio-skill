# Phase 6 — enhance & customize

## Design

### Layer
- `lib/style-layers.mjs`:
  - `effectiveStyle(dir, slug, variant?)` = `style.json` ← `style.enhance.json` ← `style.custom.json` ← `variants/<v>.json` (lớp sau thắng, merge sâu theo đường dẫn trường).
  - `locked: string[]` nằm trong `style.custom.json`.
  - `style-analyze` / `style-draft` / `style-merge` chỉ ghi `style.json`. Trường bị khoá hoặc đã có trong `custom` được in ra là "giữ theo lựa chọn của bạn", và không được merge vào hiệu lực từ lớp dưới.
- `style-diff.mjs <dir> <slug> [--variant v]` → bảng `trường | gốc | hiện tại | lớp | 🔒` (≤ 40 dòng, chỉ các trường khác gốc).

### Enhance
- `lib/style-enhance.mjs` chạy các luật xác định, mỗi luật trả về `{ id, title, why, patch }`:

  | Luật | Khi nào | Patch |
  |---|---|---|
  | `contrast` | chữ chính trên nền < WCAG AA 4.5 (chữ lớn 3.0) | chỉnh L trong OKLCH, giữ H/C |
  | `diacritics` | font không có subset `vietnamese` và ngôn ngữ là vi | font cùng họ trong `font-map.md` |
  | `token-gaps` | thiếu `secondary`/`accent`/`muted` hoặc màu chuỗi biểu đồ | suy từ màu gốc: xoay hue, đổi L |
  | `pace-vs-voice` | có lời đọc và `target_shot_seconds` < thời gian đọc một câu (từ `words_per_minute`, ~12 từ) | tăng độ dài shot |
  | `caption-safe-zone` | xuất 9:16 và phụ đề nằm trong vùng UI TikTok/Reels (dưới 20%, phải 12%) | dời vị trí/lề |
  | `missing-parts` | thiếu `lower_third`, intro/outro, thumbnail | sinh theo token + font của style |
  | `series-lock` | project thuộc series | khoá logo, voice, intro/outro của series |

- `style-enhance.mjs <dir> <slug>` in danh sách đánh số và chụp ảnh trước/sau cho mỗi mục (`review/style-<slug>-enhance.jpg`, một hàng mỗi mục, dùng lại phần dàn dựng của phase 5). `references/enhance-rules.md` hướng dẫn Claude giải thích từng mục bằng lời thường, và thêm tối đa 3 đề xuất "nhìn" (không có luật) với `source: seen`.
- `style-enhance --accept 1,3` ghi patch của các mục đã nhận vào `style.enhance.json`; `--reject` ghi lại để không đề xuất lại.

### Customize
- `style-set.mjs <dir> <slug> [--variant v] key=value … [--lock key] [--unlock key] [--unset key]`:
  - key là đường dẫn có dấu chấm (`colors.accent`, `motion.duration.base`, `captions.highlight`…);
  - value được ép kiểu theo schema;
  - validate trước khi ghi `style.custom.json` (hoặc `variants/<v>.json`);
  - in `style-diff` ngắn.
- Chat: `SKILL.md` có bảng cụm từ thường gặp → key (ví dụ "chậm hơn X%" → nhân `motion.duration.*`, "đậm hơn" → `typography.heading.weight`, "nền sáng" → biến thể `light` do `style-enhance` sinh ra).
- `style-editor.mjs <dir> <slug> [--variant v]` → `review/style-editor.html` (một file, chạy offline qua file://, giống `audio-picker.mjs`):
  - **Bên trái:** khung gốc từ sheet `frames`.
  - **Bên phải:** 3 scene mẫu trong iframe đọc `brand.css` đã dàn dựng; trang ghi đè biến CSS (`--os-*`) để preview ngay, không cần render.
  - **Điều khiển:**
    - ô chọn màu cho từng token, có badge tỉ lệ tương phản;
    - chọn font, chỉ font trong `font-map.md`, font đã nhúng sẵn qua `@font-face` khi dàn dựng;
    - thanh trượt `motion.duration.base`, `stagger`, `target_shot_seconds`;
    - kiểu phụ đề;
    - flat/glass, transition mặc định;
    - nút "Phát lại" chạy lại timeline GSAP của scene mẫu.
  - **"Độ giống gốc" 0–100%:** nội suy giữa style hiệu lực và brand/preset hiện tại (màu trong OKLCH, số tuyến tính, enum lấy theo phía > 50%).
  - **🔒** cạnh mỗi trường.
  - **"Sao chép thay đổi":** ra một dòng `node "$S/scripts/style-set.mjs" <dir> <slug> k=v … --lock …`, chỉ gồm các trường đã đổi.
  - Logic nội suy và tạo lệnh nằm trong `lib/style-blend.mjs`, được nhúng vào trang khi build. Node test và trang dùng cùng một code.
- **Biến thể:** `--variant <tên>` cho `style-set`, `style-compare`, `style-editor`, `style-apply`. `style-enhance` có luật sinh sẵn biến thể `light`/`dark` (đảo L của `bg`/`fg`, giữ màu nhấn qua kiểm tra tương phản).
- **Vòng lặp trong `SKILL.md`:** sau mỗi lần đổi, chạy `style-compare`, hiện sheet + `style-diff`, hỏi lại. Gate đóng khi người dùng OK thì mới được chạy `style-apply`.

## Files
Tạo: `scripts/lib/style-layers.mjs`, `scripts/lib/style-enhance.mjs`, `scripts/lib/style-blend.mjs`, `scripts/style-enhance.mjs`, `scripts/style-set.mjs`, `scripts/style-diff.mjs`, `scripts/style-editor.mjs`, `skills/style-extract/references/enhance-rules.md`.
Sửa: `style-compare.mjs`, `style-apply.mjs`, `style-merge.mjs` (đọc qua `effectiveStyle`, tôn trọng `locked`), `skills/style-extract/SKILL.md`, `tests/style.test.mjs`.

## Validation
- Layer: custom thắng enhance thắng gốc; chạy lại `style-draft` sau `style-set` không làm mất giá trị custom/locked; `--unset` trả về giá trị lớp dưới.
- Mỗi luật enhance có test bật/không bật; sau khi áp `contrast` mọi cặp chữ/nền ≥ 4.5.
- `style-set` ép kiểu sai (chữ vào trường số, hex không hợp lệ) bị từ chối, file không đổi.
- Round-trip: `style-blend` sinh lệnh từ một bộ thay đổi → chạy `style-set` → `effectiveStyle` bằng đúng giá trị trang hiển thị.
- `style-editor.html` mở bằng Chrome headless qua file://: không có request mạng nào (kiểm qua CDP), đổi biến CSS thì computed style của scene mẫu đổi.

## Risk
Preview CSS trên trang khác với bản render thật (font chưa nạp, glass) → trang dùng đúng `brand.css` và font đã dàn dựng như `style-compare`; sheet compare vẫn là nguồn duyệt chính, còn trang chỉ là công cụ chỉnh.
