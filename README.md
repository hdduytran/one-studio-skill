# one-studio

Claude Code plugin làm video motion trọn gói: brief → kịch bản → storyboard → ước tính credit → duyệt keyframe → dựng từng scene → TTS + phụ đề → render → xuất bản. Sửa/thêm scene chỉ render lại scene đó; series dùng chung brand kit.

## Cài đặt

```
/plugin marketplace add hdduytran/one-studio-skill
/plugin install one-studio@one-studio
```

Hoặc từ bản clone: `claude plugin marketplace add ./` rồi `claude plugin install one-studio@one-studio`.

Cần: Node 20+, FFmpeg, Chrome headless (`npx hyperframes@0.8.181 browser ensure`).

## Dùng

Gõ `/one-studio` kèm yêu cầu, ví dụ: `/one-studio làm video 40 giây giải thích GPS, 2D, 16:9, tiếng Việt`. Skill dẫn qua từng gate và dừng chờ bạn duyệt ở kịch bản, storyboard, ước tính credit, keyframe và bản preview.

Script dùng trực tiếp (`S=plugins/one-studio/skills/one-studio`):

| Lệnh | Việc |
|---|---|
| `node $S/scripts/init-project.mjs <dir> [--series <tên>] [--lang vi] [--dimension 2d\|3d\|mixed] [--aspect 16:9]` | tạo project (series có sẵn → dùng lại brand) |
| `node $S/scripts/status.mjs <dir>` | gate hiện tại, bước tiếp theo |
| `node $S/scripts/status.mjs <dir> --estimate` | bảng ước tính token Claude + thời gian render |
| `node $S/scripts/status.mjs <dir> --approve <gate>` | ghi nhận duyệt (lưu hash; sửa file sau đó sẽ mở lại gate) |
| `node $S/scripts/validate.mjs <dir \| file.json>` | kiểm tra schema + tham chiếu chéo |

TTS: API OpenAI-compatible `/v1/audio/speech`; tiếng Việt → ZeroTTS, ngôn ngữ khác → OmniVoice. Key lấy từ env `ONE_STUDIO_TTS_KEY_VI` / `ONE_STUDIO_TTS_KEY`.

## Phát triển

```
npm test                 # node:test, không cần cài gì
npm run validate:demo    # examples/demo
npm run validate:plugin  # claude plugin validate
```

Kế hoạch: `plans/261021-1135-one-studio-skill/`. Báo cáo nghiên cứu phụ thuộc: `plans/reports/researcher-261021-dependencies.md`.

## Giấy phép

MIT. Công cụ ngoài giữ giấy phép riêng: HyperFrames, Remotion (miễn phí cho cá nhân/công ty nhỏ), anatomy (MIT), lemo-opuscar (MIT, phim CC BY 4.0).
