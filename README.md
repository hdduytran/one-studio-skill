# one-studio

Claude Code plugin làm video motion trọn gói: brief → kịch bản → storyboard → ước tính credit → duyệt keyframe → dựng từng scene → giọng đọc, nhạc nền, hiệu ứng âm thanh + phụ đề → render → xuất bản nhiều tỉ lệ. Mọi thứ chạy offline (TTS trên server của bạn, nhạc và SFX tổng hợp ngay trên máy). Sửa hoặc thêm scene thì chỉ render lại scene đó. Series dùng chung brand kit, giọng đọc và intro/outro.

## Cài đặt

```
/plugin install one-studio --marketplace hdduytran/one-studio-skill
```

Hoặc từ bản clone: `claude plugin marketplace add ./` rồi `claude plugin install one-studio@one-studio`.

### Yêu cầu

| Thành phần | Bắt buộc | Ghi chú |
|---|---|---|
| Node.js ≥ 20 | ✓ | chạy mọi script |
| FFmpeg + FFprobe | ✓ | ghép, trộn âm, phụ đề, loudnorm. Thiếu libass (FFmpeg 8 của Homebrew) → phụ đề "in cứng" tự chuyển sang phụ đề mềm; thiếu drawtext → contact sheet không có nhãn |
| Chrome Headless Shell | ✓ | `npx hyperframes@0.8.181 browser ensure`, hoặc đặt `HYPERFRAMES_BROWSER_PATH` |
| Python 3 | khi dùng file `.lottie` | đọc zip |
| Server TTS OpenAI-compatible | khi có giọng đọc | ZeroTTS (tiếng Việt, danh sách giọng ở `/v1/audio/voices`), OmniVoice (ngôn ngữ khác) |
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
| `ONE_STUDIO_CACHE` | cache npm của GSAP/howler/three/lottie/font (mặc định `~/.cache/one-studio`) |

## Dùng

Gõ `/one-studio` kèm yêu cầu, ví dụ `/one-studio làm video 40 giây giải thích GPS, 2D, 16:9, tiếng Việt`. Skill dẫn qua 11 gate và dừng chờ bạn duyệt ở kịch bản, storyboard, ước tính credit, keyframe từng scene và bản preview.

| Gate | Script chính |
|---|---|
| 0 Setup | `init-project.mjs <dir> [--series <tên>] [--lang vi] [--aspect 16:9] [--exports 16:9,9:16] [--dimension 2d] [--preset apple-light] [--captions none\|sidecar\|mux\|burn] [--tts-url …] [--probe-tts]` |
| 1–4 Brief, kịch bản, storyboard, ước tính | `status.mjs <dir> [--estimate] [--approve <gate>]` |
| 5 Keyframe | `prepare-project.mjs`, `new-scene.mjs`, `keyframe-stills.mjs` (cả các tỉ lệ xuất), `compare-presets.mjs`, `status.mjs --approve-scenes` |
| 6 Build | `render-changed-scenes.mjs --preview` |
| 7 Audio | `make-music.mjs --samples`, `audio-picker.mjs`, `make-music.mjs --use <nhạc\|none>`, `status.mjs --captions <mode>`, `build-audio.mjs [--allow-tts]` |
| 8 Preview | `concat-and-mix.mjs --preview` |
| 9 Render | `render-changed-scenes.mjs`, `concat-and-mix.mjs` |
| 10 Publish | `publish.mjs [--ratios 9:16,1:1] [--thumb-frame s02@3.5]` |

Công cụ khác: `validate.mjs`, `brand-to-css.mjs`, `optimize-assets.mjs`, `anatomy-to-svg.mjs`, `new-remotion.mjs`, `series-bumper.mjs`, `make-sfx.mjs`, `sync-lines.mjs`, `tts-openai-compatible.mjs --probe | --voices | --samples all | --use-voice <id>`, `check-external.mjs`.

## Cách hoạt động

- **Render tăng dần:** hash mỗi scene gồm file nguồn, mọi file nó tham chiếu, phiên bản brand, engine và định dạng. Clip `out/scenes/<id>-<hash>.mp4` đã có thì không render lại. Mọi clip được chuẩn hoá về một kiểu encode nên bước ghép chỉ copy stream.
- **Duyệt trước khi render:** scene chỉ được render khi keyframe của đúng phiên bản đó đã được duyệt. Sửa scene thì chỉ scene đó phải duyệt lại.
- **Audio:** mỗi câu là một lần gọi TTS và được cache. Giọng đọc chọn bằng tai: nghe mẫu từng giọng của server rồi chọn. Scene tự kéo dài cho khớp giọng đọc, và chữ gắn `data-line` hiện đúng lúc câu đó được đọc, mà vẫn giữ trạng thái đã duyệt. Phụ đề tính từ thời lượng audio thật, không cần Whisper; bạn chọn không phụ đề, chỉ `.srt`, phụ đề mềm hoặc in cứng.
- **Nhạc & SFX:** nhạc nền tổng hợp offline (`ambient`, `lofi`… loop liền mạch, chỉnh BPM/giọng/độ dài) hoặc file của bạn; bộ SFX (whoosh, pop, ding, riser, impact…) đặt theo từng scene trong storyboard. Trang `review/audio-picker.html` (howler.js, chạy local) để nghe thử giọng, nhạc, SFX cạnh nhau. Bản trộn cuối luôn do FFmpeg làm: −14 LUFS, nhạc tự giảm khi có giọng đọc.
- **Giao diện:** 8 preset (`apple-light`, `apple-keynote`, `neon-terminal`, `synthwave`, `ocean-calm`, `warm-editorial`, `swiss-mono`, `default`), so sánh trên cùng các scene bằng một contact sheet; bề mặt kính mờ kiểu macOS (`brand.json → surface: "glass"`).
- **Nhiều tỉ lệ:** keyframe 9:16 / 1:1 được chụp ngay ở gate 5. CSS riêng cho một tỉ lệ (`<style data-ratio="9:16">`) chỉ làm render lại tỉ lệ đó.
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
