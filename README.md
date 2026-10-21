# one-studio

Claude Code plugin làm video motion trọn gói: brief → kịch bản → storyboard → ước tính credit → duyệt keyframe → dựng từng scene → giọng đọc + phụ đề → render → xuất bản nhiều tỉ lệ. Sửa hoặc thêm scene thì chỉ render lại scene đó. Series dùng chung brand kit, giọng đọc và intro/outro.

## Cài đặt

```
/plugin install one-studio --marketplace hdduytran/one-studio-skill
```

Hoặc từ bản clone: `claude plugin marketplace add ./` rồi `claude plugin install one-studio@one-studio`.

### Yêu cầu

| Thành phần | Bắt buộc | Ghi chú |
|---|---|---|
| Node.js ≥ 20 | ✓ | chạy mọi script |
| FFmpeg + FFprobe (có libass) | ✓ | ghép, trộn âm, phụ đề, loudnorm |
| Chrome Headless Shell | ✓ | `npx hyperframes@0.8.181 browser ensure`, hoặc đặt `HYPERFRAMES_BROWSER_PATH` |
| Python 3 | khi dùng file `.lottie` | đọc zip |
| Server TTS OpenAI-compatible | khi có giọng đọc | ZeroTTS (tiếng Việt), OmniVoice (ngôn ngữ khác) |
| anatomy skill | scene `explainer` | `npx skills add wheresryan22/anatomy -g -a claude-code` |
| lemo-opuscar | scene `character` | clone + `npm install`, đặt `ONE_STUDIO_LEMO_LIB` |
| Remotion | scene 3D có physics/post-fx | `new-remotion.mjs` rồi `npm install` trong `<project>/remotion` |

`node plugins/one-studio/skills/one-studio/scripts/check-external.mjs <project>` cho biết project cần gì và lệnh cài.

### Biến môi trường

| Biến | Dùng cho |
|---|---|
| `ONE_STUDIO_TTS_KEY_VI`, `ONE_STUDIO_TTS_KEY` | API key của ZeroTTS / OmniVoice (không bao giờ ghi vào file) |
| `HYPERFRAMES_BROWSER_PATH` | Chrome cho HyperFrames |
| `ONE_STUDIO_LEMO_LIB`, `PLAYWRIGHT_CHROME` | thư viện lemo-opuscar và Chrome của nó |
| `ONE_STUDIO_ANATOMY` | thư mục anatomy nếu không cài dạng skill |
| `ONE_STUDIO_CHROME`, `ONE_STUDIO_REMOTION_GL` | Chrome và WebGL backend cho Remotion |
| `ONE_STUDIO_CACHE` | cache npm của GSAP/three/lottie/font (mặc định `~/.cache/one-studio`) |

## Dùng

Gõ `/one-studio` kèm yêu cầu, ví dụ `/one-studio làm video 40 giây giải thích GPS, 2D, 16:9, tiếng Việt`. Skill dẫn qua 11 gate và dừng chờ bạn duyệt ở kịch bản, storyboard, ước tính credit, keyframe từng scene và bản preview.

| Gate | Script chính |
|---|---|
| 0 Setup | `init-project.mjs <dir> [--series <tên>] [--lang vi] [--aspect 16:9] [--dimension 2d]` |
| 1–4 Brief, kịch bản, storyboard, ước tính | `status.mjs <dir> [--estimate] [--approve <gate>]` |
| 5 Keyframe | `prepare-project.mjs`, `new-scene.mjs`, `keyframe-stills.mjs`, `status.mjs --approve-scenes` |
| 6 Build | `render-changed-scenes.mjs --preview` |
| 7 Audio | `build-audio.mjs [--allow-tts]` |
| 8 Preview | `concat-and-mix.mjs --preview` |
| 9 Render | `render-changed-scenes.mjs`, `concat-and-mix.mjs` |
| 10 Publish | `publish.mjs [--ratios 9:16,1:1]` |

Công cụ khác: `validate.mjs`, `brand-to-css.mjs`, `optimize-assets.mjs`, `anatomy-to-svg.mjs`, `new-remotion.mjs`, `series-bumper.mjs`, `tts-openai-compatible.mjs --probe`, `check-external.mjs`.

## Cách hoạt động

- **Render tăng dần:** hash mỗi scene gồm file nguồn, mọi file nó tham chiếu, phiên bản brand, engine và định dạng. Clip `out/scenes/<id>-<hash>.mp4` đã có thì không render lại. Mọi clip được chuẩn hoá về một kiểu encode nên bước ghép chỉ copy stream.
- **Duyệt trước khi render:** scene chỉ được render khi keyframe của đúng phiên bản đó đã được duyệt. Sửa scene thì chỉ scene đó phải duyệt lại.
- **Audio:** mỗi câu là một lần gọi TTS và được cache. Scene tự kéo dài cho khớp giọng đọc mà vẫn giữ trạng thái đã duyệt. Phụ đề tính từ thời lượng audio thật, không cần Whisper. Âm lượng chuẩn hoá về −14 LUFS, nhạc nền tự giảm khi có giọng đọc.
- **Engine:** HyperFrames (HTML/GSAP) là mặc định, kể cả canvas, Lottie và three.js. Remotion chỉ dùng cho 3D có physics hoặc post-processing. anatomy được xuất SVG tĩnh rồi animate bằng GSAP. lemo-opuscar render ra clip riêng.

## Phát triển

```
npm test                 # node:test, không cần mạng
npm run test:e2e         # render thật (cần Chrome + FFmpeg)
npm run validate:demo    # examples/demo
npm run validate:plugin  # claude plugin validate
```

Kế hoạch: `plans/261021-1135-one-studio-skill/`. Báo cáo: `plans/reports/`.

## Giấy phép

MIT. Công cụ ngoài giữ giấy phép riêng: HyperFrames, GSAP (miễn phí), Remotion (miễn phí cho cá nhân và công ty ≤ 3 người), anatomy (MIT), lemo-opuscar (MIT, phim CC BY 4.0), Inter (OFL).
