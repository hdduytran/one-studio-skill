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
| Node.js ≥ 20 | ✓ | chạy mọi script (≥ 22 cho `capture-screen.mjs`) |
| FFmpeg + FFprobe | ✓ | ghép, trộn âm, phụ đề, loudnorm. Thiếu libass (FFmpeg 8 của Homebrew) → phụ đề "in cứng" tự chuyển sang phụ đề mềm; thiếu drawtext → contact sheet không có nhãn |
| Chrome Headless Shell | ✓ | `npx hyperframes@0.8.181 browser ensure`, hoặc đặt `HYPERFRAMES_BROWSER_PATH` |
| yt-dlp | chỉ khi lấy style từ link | `brew install yt-dlp` hoặc `pipx install yt-dlp`; skill không tự cài. File video có sẵn thì không cần |
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
| `ONE_STUDIO_CACHE` | cache npm của GSAP/howler/three/lottie/font và preset lưu từ video (`presets/`); mặc định `~/.cache/one-studio` |
| `ONE_STUDIO_YTDLP` | đường dẫn tới `yt-dlp` nếu không nằm trong PATH |

## Dùng

Gõ `/one-studio` kèm yêu cầu, ví dụ `/one-studio làm video 40 giây giải thích GPS, 2D, 16:9, tiếng Việt`. Skill dẫn qua 11 gate và dừng chờ bạn duyệt ở kịch bản, storyboard, ước tính credit, keyframe từng scene và bản preview.

| Gate | Script chính |
|---|---|
| 0 Setup | `init-project.mjs <dir> [--series <tên>] [--lang vi] [--aspect 16:9] [--exports 16:9,9:16] [--platform shorts,tiktok,reels,youtube] [--dimension 2d] [--preset apple-light] [--captions none\|sidecar\|mux\|burn] [--tts-url …] [--probe-tts]` |
| 1 Brief | điền `brief.md` kèm Story core (skill `writers-room`), `status.mjs <dir> --approve brief` |
| 2 Kịch bản | `script-lint.mjs <dir>` (luật cấm, câu > 20 từ, số chưa viết cho tai, thiếu cột hình, fact thiếu nguồn) + đọc to, rồi `status.mjs --approve script` |
| 3–4 Storyboard, ước tính | chọn mode/world/camera, `status.mjs <dir> [--estimate] [--approve <gate>]` |
| 5 Keyframe | `prepare-project.mjs`, `new-scene.mjs`, `capture-screen.mjs` (scene `screen`), `keyframe-stills.mjs` (cả các tỉ lệ xuất, kèm `review/seams.jpg`), `seam-check.mjs`, `compare-presets.mjs`, `status.mjs --approve-scenes` |
| 6 Build | `render-changed-scenes.mjs --preview` |
| 7 Audio | `make-music.mjs --samples`, `audio-picker.mjs`, `make-music.mjs --use <nhạc\|none>`, `status.mjs --captions <mode>`, `build-audio.mjs [--allow-tts]`, `build-audio.mjs --tighten [--apply]` (rút ngắn scene theo giọng đọc thật, phải duyệt lại storyboard) |
| 8 Preview | `concat-and-mix.mjs --preview`, `concat-and-mix.mjs --preview --ratio 9:16` (bản xem thử dọc cho Shorts/TikTok) |
| 9 Render | `render-changed-scenes.mjs`, `concat-and-mix.mjs` |
| 10 Publish | `publish.mjs [--ratios 9:16,1:1] [--thumb-frame s02@3.5]` |

Công cụ khác: `script-lint.mjs`, `seam-check.mjs`, `capture-screen.mjs`, `validate.mjs`, `brand-to-css.mjs`, `optimize-assets.mjs`, `anatomy-to-svg.mjs`, `new-remotion.mjs`, `series-bumper.mjs`, `make-sfx.mjs`, `sync-lines.mjs`, `tts-openai-compatible.mjs --probe | --voices | --samples all | --use-voice <id>`, `check-external.mjs`.

## Lấy style từ video

Đưa một file video hoặc link, one-studio đo nhịp cắt, màu, chuyển động, âm thanh, rồi Claude xem 2 contact sheet để đọc phông, bố cục, giọng điệu. Kết quả là một style card (`style-refs/<slug>/style.json` + `STYLE.md`), cùng bảng so sánh: khung gốc ở hàng trên, 3 scene mẫu (tiêu đề, biểu đồ, phụ đề) dựng theo style ở hàng giữa, bảng màu ở hàng dưới. Bạn xem, nhờ chỉnh nhiều vòng, đồng ý rồi mới áp vào `brand.json`. Gọi bằng `/one-studio lấy style từ <link hoặc file>` (gate 0).

| Lệnh | Việc |
|---|---|
| `style-fetch.mjs <dir> <url\|file> [--from 0:00] [--to 1:30] [--max 90] [--keep]` | lấy video (mặc định 90 giây đầu) |
| `style-analyze.mjs <dir> <slug>` | đo bằng FFmpeg, ra `metrics.json` + 2 contact sheet |
| `style-draft.mjs <dir> <slug>` | ghép số đo và phần Claude đọc thành `style.json` |
| `style-compare.mjs <dir> <slug> [--variant v] [--ratio 9:16]` | sheet so sánh, không render video |
| `style-enhance.mjs <dir> <slug> [--accept 1,3] [--reject 2]` | đề xuất cải tiến kèm lý do và ảnh trước/sau; chỉ áp khi bạn nhận |
| `style-set.mjs <dir> <slug> key=value … [--lock key]`, `style-diff.mjs`, `style-editor.mjs` | chỉnh qua chat hoặc trang `review/style-editor.html` (offline) |
| `style-merge.mjs <dir> <a> <b> … --as <slug>` | gộp nhiều video thành một style |
| `style-apply.mjs <dir> <slug> [--variant v] [--as-preset tên] [--keep] [--dry-run] [--allow-low-contrast]` | ghi vào `brand.json` (tăng `version`), `studio.json → story.style`, gợi ý storyboard/audio |

- **Đồng ý của bạn:** link chỉ được tải khi `studio.json → services.download: true` (Claude hỏi một lần). Không tự cài yt-dlp, không dùng cookies trình duyệt. File có sẵn thì không cần gì.
- **Nền tảng:** YouTube, TikTok, Facebook, Instagram qua yt-dlp. Video riêng tư, cần đăng nhập hoặc giới hạn tuổi (hay gặp ở Facebook và Instagram) thì dừng lại, bạn tự tải rồi đưa file. TikTok và Instagram đôi khi chặn tải; đưa file là cách chắc nhất. Phụ đề chỉ là phần thêm: tải phụ đề lỗi (hay gặp HTTP 429) thì video vẫn được tải, không kèm phụ đề.
- **Không bao giờ lấy:** khung hình, logo, linh vật, nhân vật, slogan và chữ trên hình, nhạc, giọng, tên tác giả. Chỉ lấy cách trình bày (màu, phông gần nhất, nhịp, chuyển cảnh, kiểu phụ đề, loudness). Nhạc chỉ gợi ý bản nền gần nhất có sẵn. Video gốc nằm trong `style-refs/` (git bỏ qua) và bị xoá sau khi áp, trừ khi dùng `--keep`.
- **Enhance và customize:** style gồm các lớp, lớp sau thắng: số đo < đề xuất đã nhận < chỉnh của bạn (có thể khoá) < biến thể sáng/tối. Trích lại hay gộp không ghi đè phần bạn đã chỉnh hoặc khoá. Style luôn đạt WCAG AA cho chữ chính; nếu không, `style-apply` từ chối (đổi màu hoặc nhận đề xuất `contrast`, hoặc `--allow-low-contrast` nếu bạn chắc).
- **Preset:** `--as-preset tên` lưu look vào `$ONE_STUDIO_CACHE/presets/<tên>.json` (mặc định `~/.cache/one-studio/presets/`). Preset đó hiện trong `compare-presets.mjs` và `init-project.mjs --preset`; preset có sẵn của plugin không bao giờ bị ghi đè.
- `status.mjs` hiện style đang dùng và đánh dấu `!` khi style card đổi sau lần áp; `validate.mjs` kiểm `story.style` trỏ tới style có thật.

## Viết kịch bản: writers-room

Skill `writers-room` (gọi từ gate 1–3) viết kịch bản như người đã nghiên cứu chủ đề, không như khuôn mẫu:

- **14 playbook** theo thể loại (`mechanism-system`, `concept-explainer`, `news-recap`, `saas-product`, `customer-story`…), mỗi cái một khung xương có tỉ lệ thời lượng; chỉ nạp một playbook, chọn bằng `playbooks/index.md`.
- **4 định dạng** chồng lên playbook (chọn tối đa một): `short-vertical`, `long-form`, `series-episode`, `no-voice`. **5 giọng** (`tones.md`): `knowing-friend`, `dry-expert`, `playful`, `neutral-newsroom`, `cinematic-minimal`.
- **Story core** trong `brief.md`: angle một câu, con người thật, xung đột, hiểu lầm phổ biến, chi tiết chỉ chủ đề này có, góc nhìn/giọng, lời hứa và chỗ trả lời hứa, nguồn. Lựa chọn ghi ở `studio.json → story`.
- **Kịch bản hai cột**: lời đọc (mỗi gạch đầu dòng một câu ≤ 20 từ) và hình (`> visual:`, `> camera:`, `> sfx:`, `> silence:`, `> source:`).
- **`script-lint.mjs`** bắt cụm sáo rỗng vi/en, câu quá dài, số chưa viết cho tai, chuỗi "và rồi", thiếu cột hình, fact thiếu nguồn; sau đó đọc to và cắt khoảng 20%.
- **Mode hình ảnh** (`visual-modes/`): `world-camera`, `match-cut-motif`, `exploded-cutaway`, `screen-cinema`, `kinetic-type`… mỗi scene khai `mode` trong storyboard.

## Thế giới liên tục

Nhiều scene dùng chung một "thế giới" (`worlds/<id>.html`, khai ở `storyboard.json → worlds`). Mỗi scene chỉ là một đoạn đường của camera:

- `S.camera(...)` bay giữa các `data-place` của thế giới (`camera.from` → `camera.to`, scene sau bắt đầu đúng chỗ scene trước kết thúc); `S.state(id, tên, { at })` đổi trạng thái đối tượng; `exit_state` / `enter_state` giữ trạng thái qua mối nối.
- Validator kiểm camera nối liền; `new-scene.mjs` đặt chuyển cảnh `cut` giữa các scene cùng world.
- **Seam check** (`seam-check.mjs`, tự chạy trong `keyframe-stills.mjs`): khung cuối scene A cạnh khung đầu scene B kèm độ lệch điểm ảnh (`review/seams.jpg`); cùng world mà lệch > 2% thì báo lỗi. Cặp `handoff` (match cut theo motif) chỉ để mắt người xem xét.
- Sửa một scene chỉ render lại scene đó.

## Quay màn hình

Scene `screen` dùng video thật quay từ một trang web theo kịch bản trong `flows/<id>.json` (schema `flow.schema.json`):

- `capture-screen.mjs <dir> <flow-id>` mở Chrome, đi theo flow (click, gõ, cuộn, đánh dấu), ghi video cố định fps cùng `events.json` (đường đi con trỏ, vùng click). Scene zoom theo vùng click như Screen Studio. Con trỏ sinh từ seed nên log lặp lại được; chỉ quay lại khi flow đổi hoặc `--recapture`.
- **Cần đồng ý của bạn**: `studio.json → services.capture: true` và chỉ URL bạn đưa. Chỉ điều hướng trong origin của flow, từ chối gõ vào ô mật khẩu; đăng nhập chỉ bằng storage state bạn cung cấp.
- Yêu cầu: Node ≥ 22 (chạy `capture-screen.mjs`), Chrome, FFmpeg. Thời gian quay thật ~30 giây mỗi flow.

## Tin tức

- Video tin tức/sự thật: research **chỉ khi bạn yêu cầu** và `services.web: true`; chạy trong subagent, agent chính chỉ đọc `research.md`.
- Mỗi dòng `research.md` có loại `fact | quote | opinion | context`, nguồn, URL, ngày đăng, ngày truy cập, người nói. Fact tin tức cần ≥ 2 nguồn độc lập; trích dẫn nguyên văn.
- Câu có nguồn ghi `> source: r1,r2`; lint kiểm id tồn tại. Ý kiến được nói là ý kiến và hiện nhãn **Ý KIẾN** trên hình. `publish.mjs` đưa danh sách nguồn vào `out/manifest.json` và `out/sources.txt`.

## Cách hoạt động

- **Render tăng dần:** hash mỗi scene gồm file nguồn, mọi file nó tham chiếu, phiên bản brand, engine và định dạng. Clip `out/scenes/<id>-<hash>.mp4` đã có thì không render lại. Mọi clip được chuẩn hoá về một kiểu encode nên bước ghép chỉ copy stream.
- **Duyệt trước khi render:** scene chỉ được render khi keyframe của đúng phiên bản đó đã được duyệt. Sửa scene thì chỉ scene đó phải duyệt lại.
- **Audio:** mỗi câu là một lần gọi TTS và được cache. Giọng đọc chọn bằng tai: nghe mẫu từng giọng của server rồi chọn. Scene tự kéo dài cho khớp giọng đọc, và chữ gắn `data-line` hiện đúng lúc câu đó được đọc, mà vẫn giữ trạng thái đã duyệt. Phụ đề tính từ thời lượng audio thật, không cần Whisper; bạn chọn không phụ đề, chỉ `.srt`, phụ đề mềm hoặc in cứng.
- **Nhạc & SFX:** nhạc nền tổng hợp offline (`ambient`, `lofi`… loop liền mạch, chỉnh BPM/giọng/độ dài) hoặc file của bạn; bộ SFX (whoosh, pop, ding, riser, impact…) đặt theo từng scene trong storyboard. Trang `review/audio-picker.html` (howler.js, chạy local) để nghe thử giọng, nhạc, SFX cạnh nhau. Bản trộn cuối luôn do FFmpeg làm: −14 LUFS, nhạc tự giảm khi có giọng đọc.
- **Giao diện:** 9 preset (`apple-light`, `apple-keynote`, `neon-terminal`, `synthwave`, `ocean-calm`, `warm-editorial`, `swiss-mono`, `infinity-board`, `default`) cộng preset bạn lưu từ video, so sánh trên cùng các scene bằng một contact sheet; bề mặt kính mờ kiểu macOS (`brand.json → surface: "glass"`).
- **Nhiều tỉ lệ:** keyframe 9:16 / 1:1 được chụp ngay ở gate 5. CSS riêng cho một tỉ lệ (`<style data-ratio="9:16">`) chỉ làm render lại tỉ lệ đó.
- **Engine:** HyperFrames (HTML/GSAP) là mặc định, kể cả canvas, Lottie và three.js. Remotion chỉ dùng cho 3D có physics hoặc post-processing. anatomy được xuất SVG tĩnh rồi animate bằng GSAP. lemo-opuscar render ra clip riêng.

## Phát triển

```
npm test                 # node:test, không cần mạng
npm run test:e2e         # render thật (cần Chrome + FFmpeg)
npm run validate:demo    # examples/demo
npm run validate:gps     # examples/gps-world (mẫu: thế giới liên tục)
npm run validate:plugin  # claude plugin validate
```

Kế hoạch: `plans/261021-1135-one-studio-skill/`. Báo cáo: `plans/reports/`.

## Giấy phép

MIT. Công cụ ngoài giữ giấy phép riêng: HyperFrames, GSAP (miễn phí), Remotion (miễn phí cho cá nhân và công ty ≤ 3 người), anatomy (MIT), lemo-opuscar (MIT, phim CC BY 4.0), Inter (OFL).
