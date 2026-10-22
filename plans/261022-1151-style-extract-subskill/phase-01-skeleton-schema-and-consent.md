# Phase 1 — skeleton, schema, consent, router

## Design
- Skill mới `plugins/one-studio/skills/style-extract/`:
  - `SKILL.md` (≤ 120 dòng): bảng 6 bước (fetch → analyze → read & map → compare → enhance & customize → apply), lệnh từng bước, luật consent, những gì không lấy (footage, logo, nhạc, giọng, slogan), luật context budget.
  - `description`: lấy style (màu, font, nhịp, chuyển cảnh, phụ đề, tone) từ video/link; từ khoá vi/en: "clone style", "bắt chước style", "làm giống video này", "lấy style từ link", "extract style".
  - `references/` (điền ở phase 4 và 6), `templates/` (STYLE.md, scene mẫu ở phase 5).
- Bố cục trong project: `style-refs/<slug>/` gồm `source.<ext>`, `info.json`, `subs.vtt?`, `metrics.json`, `frames/`, `style.json`, `style.enhance.json`, `style.custom.json`, `STYLE.md`. Sheet nằm ở `review/style-<slug>-*.jpg`. `style-refs/.gitignore` (tạo khi cần) chứa `*/source.*` và `*/frames/`.
- `slug`: kebab-case từ tiêu đề video hoặc tên file, thêm hậu tố `-2`, `-3` nếu trùng.
- Schema `schemas/style.schema.json` (đúng subset mà `lib/schema.mjs` hỗ trợ):
  - `version`, `slug`, `reference` (`url?`, `file`, `title?`, `channel?`, `accessed`, `range`).
  - `brand`: bản patch một phần của `brand.json` (dùng `$ref` tới các `$defs` dùng chung với `brand.schema.json` khi có thể).
  - `storyboard`: `target_shot_seconds`, `visual_modes[]`, `camera`, `sfx_density` (`none|low|medium|high`), `intro`, `outro`.
  - `writing`: `format`, `tone`, `hook`, `words_per_minute`.
  - `audio`: `lufs`, `silence_ratio`, `has_voice`, `music` (`preset`, `mood`, `bpm`).
  - `do_not_copy[]`: logo, mascot, nhân vật, slogan… thấy trong video.
  - `provenance`: map đường dẫn trường → `measured | seen | guessed` (+ `note?`). Tách riêng cho patch brand luôn sạch.
- `studio.schema.json`:
  - `services.download` (boolean, mô tả: cho phép tải video tham khảo từ link người dùng đưa).
  - `story.style` (`{ slug, variant? }`), vì `story` đang `additionalProperties: false`.
- Router của one-studio:
  - `SKILL.md` gate 0: thêm lựa chọn "lấy style từ video/link" cạnh danh sách preset, trỏ sang `../style-extract/SKILL.md`.
  - `references/workflow-gates.md`: câu hỏi gate 0 có lựa chọn đó + dòng mới trong bảng edit-after-approval ("đổi sang style lấy từ video").
- `lib/style-refs.mjs`: `styleDir(project, slug)`, `newSlug(project, hint)`, `ensureGitignore(project)`, `loadStyle(project, slug)` (đọc + validate).

## Files
Tạo: `skills/style-extract/SKILL.md`, `skills/one-studio/schemas/style.schema.json`, `skills/one-studio/scripts/lib/style-refs.mjs`, `tests/style.test.mjs`.
Sửa: `schemas/studio.schema.json`, `lib/schema.mjs` (chỉ khi cần thêm từ khoá schema), one-studio `SKILL.md`, `references/workflow-gates.md`, `validate.mjs` (validate `style-refs/*/style.json` nếu có), `.claude-plugin/plugin.json` (nếu skill phải khai báo).

## Validation
- `npm run validate:plugin` nhận skill mới.
- Test schema: một `style.json` mẫu hợp lệ; thiếu `provenance` hoặc `source` sai giá trị thì bị từ chối.
- `validate.mjs` trên `examples/demo` và `examples/gps-world` vẫn sạch (chưa có `style-refs/`).
- Test `newSlug` khi trùng tên; `ensureGitignore` ghi được file và chạy lại không đổi gì.

## Risk
Patch brand trong `style.json` lệch khỏi `brand.schema.json` khi brand thay đổi → dùng `$defs` dùng chung, và test validate patch đã merge với template `brand.json`.
