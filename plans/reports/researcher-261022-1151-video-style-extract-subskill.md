# Đề xuất subskill `style-extract`: lấy phong cách từ video có sẵn

Ngày: 2026-10-22 · Trạng thái: đã lập plan → [261022-1151-style-extract-subskill](../261022-1151-style-extract-subskill/plan.md)

## Tóm tắt

Thêm skill thứ ba `plugins/one-studio/skills/style-extract/` (cạnh `one-studio` và `writers-room`). Đầu vào là một file video hoặc link YouTube/TikTok/Facebook/Instagram. Đầu ra là một **style card** (`style.json` + `STYLE.md`) mà pipeline hiện tại dùng được ngay: `brand.json` (màu, font, motion, transition, phụ đề), gợi ý storyboard (nhịp cắt, visual mode, camera), gợi ý writers-room (format, tone, kiểu hook, tốc độ đọc) và gợi ý audio (độ to, năng lượng nhạc, mật độ SFX).

Phương án khuyến nghị: **đo bằng script + đọc bằng mắt**. Mọi thứ đo được (nhịp cắt, màu, độ sáng, chuyển động, âm lượng, tốc độ nói) do một script Node + FFmpeg tính, không tốn token. Claude chỉ nhìn 2 contact sheet (~12 keyframe + các cặp khung quanh điểm cắt) để đọc những thứ không đo được: kiểu chữ, bố cục, kiểu phụ đề, kiểu chuyển cảnh, visual mode. Kết quả được duyệt bằng một sheet đặt khung gốc cạnh scene mẫu one-studio dựng lại theo style vừa trích xuất. Sau đó người dùng enhance (nhận các cải tiến Claude đề xuất) và customize (tự chỉnh qua chat hoặc trang chỉnh có preview trực tiếp) cho tới khi hài lòng rồi mới áp dụng.

Lấy **phong cách**, không chép **nội dung**: không dùng lại footage, logo, nhạc, giọng người thật, font thương mại.

## Đặt tên: "extract", không phải "clone"

Khuyến nghị: skill tên **`style-extract`**, script là `style-extract-*` / `style-*`. Trong `description` vẫn ghi các từ người dùng hay gõ ("clone style", "bắt chước style", "làm giống video này", "lấy style từ link") để skill vẫn được gọi đúng.

Lý do:
- **Đúng với việc skill làm.** Đầu ra là một bộ thông số (màu, nhịp, font gần nhất), không phải bản sao. Sau đó còn có bước enhance & customize, nên kết quả cuối thường đã khác bản gốc. "Clone" hứa một bản y hệt mà skill không làm, và không nên làm.
- **Đúng về pháp lý.** "Clone" gợi ý chép nội dung và bộ nhận diện của người khác. "Extract" nói rõ là lấy cảm hứng và tham số.
- **Không nhầm với "voice clone".** Repo đã có TTS; chữ "clone" dễ bị hiểu là clone giọng, mà việc đó skill cố ý không làm.
- **Hợp với chuỗi động từ của pipeline:** extract → enhance → customize → apply.

Với người dùng tiếng Việt, câu trên giao diện nên là "lấy style từ video", tránh cả hai từ tiếng Anh.

Trong phần còn lại của báo cáo, tên skill là `style-extract`.

## Hiện trạng repo liên quan

- `brand.json` đã có đủ chỗ chứa style: `colors`, `surface`, `typography`, `grid`, `motion` (ease/duration/stagger), `transitions`, `captions`, `lower_third`, `intro/outro`, `voice`.
- `brand-presets.json` có 9 preset viết tay. Preset `infinity-board` (commit `1d1561f`) được làm thủ công cho project `videos/vpbank-infinity-board`, đúng loại việc subskill này tự động hoá.
- Có sẵn để tái dùng: `lib/contact-sheet.mjs`, `compare-presets.mjs` (so preset trên cùng scene), `lib/ffmpeg.mjs`, `keyframe-stills.mjs`, `writers-room/visual-modes/*`, `tones.md`, `formats/*`.
- FFmpeg trên máy có `scdet`, `palettegen`, `signalstats`, `ebur128`, `silencedetect`, `tile`. **Không có `drawtext`/libass** (đã có fallback trong repo), nên contact sheet ghi nhãn bằng HTML/Chrome như các sheet hiện tại.
- Chưa có `yt-dlp`, `scenedetect`, `whisper` trên máy.

## Kết quả research công cụ

| Việc | Công cụ | Ghi chú |
|---|---|---|
| Tải video | `yt-dlp` | YouTube đang dần bắt buộc PO Token; client mặc định vẫn chạy nhưng có thể thiếu format; OAuth không còn dùng được, chỉ còn cookies và dùng cookies có rủi ro bị khoá tài khoản. TikTok extractor bị vỡ và được sửa liên tục trong 2026 (challenge solving, share URL). Facebook/Instagram reel thường cần đăng nhập. → Luôn có đường dự phòng: người dùng tự đưa file. |
| Phát hiện điểm cắt | FFmpeg `scdet` | Ghi `lavfi.scd.score`, `lavfi.scd.mafd` mỗi khung và `lavfi.scd.time` ở khung cắt; ngưỡng tốt 8–14. Đủ cho video motion/social (cắt gắt). Fade khó với mọi công cụ; bù bằng `blackdetect` + nhìn cặp khung. PySceneDetect 0.7 (5/2026) tốt hơn chút nhưng cần Python, để làm tuỳ chọn. |
| Màu | `palettegen` / tự k-means trên khung đã thu nhỏ | Bỏ vùng watermark (TikTok) và vùng phụ đề trước khi gom màu. |
| Độ sáng, bão hoà | `signalstats` (YAVG, SATAVG) | Phân loại nền tối/sáng, rực/dịu. |
| Năng lượng chuyển động | `mafd` từ `scdet` | Đường cong mafd trong một shot cho biết tĩnh hay liên tục chuyển động, và gợi ý ease (bùng đầu rồi dịu = `power3.out`). Chỉ là ước lượng. |
| Âm thanh | `ebur128`, `silencedetect` | LUFS, dải động, tỉ lệ im lặng, độ dài khoảng nghỉ. |
| Lời nói | phụ đề tự động của YouTube (`--write-auto-subs`) → không cần ASR; còn lại whisper.cpp (`large-v3-turbo`, có `--dtw` cho timestamp từ) tuỳ chọn | Ra số từ/phút, cấu trúc hook 3 giây đầu, độ dài câu. |
| Đọc kiểu chữ, bố cục, chuyển cảnh | Vision của Claude trên contact sheet | Font chỉ đoán được **họ** (geometric sans, grotesk, serif, mono, viết tay) và độ đậm; map sang font miễn phí gần nhất trên Fontsource, có hỗ trợ tiếng Việt. |
| Hiểu cả video (tuỳ chọn) | Gemini qua `ak:ai-multimodal` | Trả phí, gửi video ra ngoài → chỉ khi `services` cho phép. Hữu ích cho sắc thái motion. |

Sản phẩm tham khảo: OpenMontage `visual-style` (Extract mode ra `visual-style.md`: màu, chữ, layout, motion, mood), Mosaic (style từ link YouTube, hay timeout với video > 1–2 phút). Không công cụ nào đo nhịp cắt hay xuất token màu chính xác, đây là điểm one-studio làm tốt hơn được vì đã có FFmpeg và hệ brand token.

## So sánh phương án

| | A. Chỉ nhìn ảnh chụp | **B. Đo bằng script + nhìn (khuyến nghị)** | C. Gửi cả video cho Gemini |
|---|---|---|---|
| Nhịp cắt, độ dài shot | đoán | đo chính xác | đoán khá |
| Màu | đoán từ vài ảnh | đo trên mọi shot | đoán |
| Chữ, bố cục, chuyển cảnh | tốt | tốt | tốt |
| Motion / easing | kém | ước lượng | khá |
| Chi phí token | thấp | thấp (2 sheet) | trả phí ngoài |
| Chạy offline | có | có | không |
| Lặp lại được | không | có (`metrics.json`) | không |

B là mặc định; C là bước bổ sung tuỳ chọn khi người dùng cho phép.

## Thiết kế subskill

### Vị trí và cách gọi

- `plugins/one-studio/skills/style-extract/SKILL.md` + `references/` + `templates/`; script đặt trong `one-studio/scripts/` như các script khác (dùng chung `lib/`).
- Gọi từ gate 0 của one-studio (thêm lựa chọn "lấy style từ video/link" cạnh danh sách preset) hoặc độc lập: `/one-studio lấy style từ <link>`.
- Một project có thể có nhiều style card trong `style-refs/<slug>/`; series lưu ở `series/<name>/brand/` như hiện tại.

### Quy trình (6 bước, 1 gate duyệt có vòng tinh chỉnh)

```
lấy video → đo → đọc & map → so sánh → enhance & customize (lặp) → áp dụng
```

1. **Lấy video** — `style-fetch.mjs <dir> <url|file> [--max 90s]`
   - File local: copy vào `style-refs/<slug>/source.<ext>`.
   - Link: cần `studio.json → services.download: true` và người dùng xác nhận có quyền xem/dùng video làm tham khảo. Hỏi trước khi cài `yt-dlp`. Tải ≤ 720p, cắt tối đa 90 giây đầu (đủ để đọc style, tiết kiệm), không dùng cookies mặc định; nếu link đòi đăng nhập thì dừng và đề nghị người dùng tự tải file.
   - Lưu `info.json` (tiêu đề, kênh, URL, thời lượng, ngày truy cập) để ghi nguồn tham khảo; lấy kèm phụ đề tự động nếu có.
   - `style-refs/*/source.*` vào `.gitignore`; mặc định xoá file nguồn sau khi duyệt style (`--keep` để giữ).

2. **Đo** — `style-analyze.mjs <dir> <slug>` → `metrics.json` (thuần FFmpeg, không token)
   - Định dạng: tỉ lệ khung, fps, thời lượng, có thanh đen/letterbox không.
   - Nhịp: danh sách điểm cắt, ASL (độ dài shot trung bình), trung vị, số cắt/phút, phân bố; fade/đen (`blackdetect`).
   - Màu: 6–8 màu chủ đạo có trọng số, gán vai trò `bg/fg/primary/secondary/accent/muted` theo độ sáng, diện tích, độ bão hoà; độ sáng nền, bão hoà, độ tương phản chữ/nền.
   - Chuyển động: mafd trung bình mỗi shot, phân loại `static | drift | kinetic`, hình dạng đường cong → gợi ý ease và `motion.duration`.
   - Âm thanh: LUFS, tỉ lệ im lặng, khoảng nghỉ trung bình; có lời hay không.
   - Lời: số từ/phút, độ dài câu, nội dung 3 giây đầu (nếu có transcript).
   - Ảnh: 1 khung giữa mỗi shot (tối đa 12, chọn đều) → `review/style-<slug>-frames.jpg`; cặp khung (cuối shot A, đầu shot B) quanh 6 điểm cắt → `review/style-<slug>-cuts.jpg`.

3. **Đọc và map** — Claude xem 2 sheet + `metrics.json` + transcript, viết `style.json` theo `schemas/style.schema.json` và `STYLE.md` (đọc được cho người):
   - `brand` → patch cho `brand.json`: `colors` (đã snap về token, kiểm tra tương phản WCAG cho chữ), `surface` (flat/glass), `typography` (font miễn phí gần nhất + lý do), `motion`, `transitions.default`, `captions` (vị trí, cỡ, nền, kiểu highlight từng từ kiểu TikTok), `grid`, `lower_third`.
   - `storyboard` → `target_shot_seconds`, visual mode gần nhất trong `writers-room/visual-modes/` (ví dụ `kinetic-type`, `desk-collage`), camera, mật độ SFX, intro/outro.
   - `writing` → `format` (`short-vertical`…), `tone` trong `tones.md`, kiểu hook, số từ/phút → tốc độ TTS.
   - `audio` → độ to mục tiêu, năng lượng/BPM nhạc gợi ý cho `make-music`.
   - Mỗi giá trị ghi `source: measured | seen | guessed` để người dùng biết cái nào chắc, cái nào đoán.
   - Đánh dấu yếu tố **không được lấy**: logo, mascot, nhân vật, nhạc, giọng, slogan, footage.

4. **So sánh** — `style-compare.mjs <dir> <slug>` (mở rộng `compare-presets.mjs`)
   - Dựng 3 scene mẫu (title, data, caption) bằng brand vừa trích xuất, đặt cạnh khung gốc trong một sheet `review/style-<slug>-compare.jpg`. Chỉ chụp ảnh tĩnh, không render video, nên mỗi vòng sửa rất rẻ.

5. **Enhance & customize** — vòng lặp cho tới khi người dùng hài lòng
   - **Lưu thành nhiều lớp** để tinh chỉnh không làm mất bản gốc:
     - `style.json`: bản trích xuất, không sửa tay; trích xuất lại thì chỉ ghi đè file này.
     - `style.enhance.json`: các đề xuất cải tiến người dùng đã nhận.
     - `style.custom.json`: chỉnh sửa của người dùng, kèm `locked: [...]` cho các trường không được ghi đè khi trích xuất lại hoặc merge.
     - Style dùng thật = `style` ← `enhance` ← `custom` (lớp sau thắng). `style-diff.mjs` in bảng "gốc → hiện tại" cho từng trường.
   - **Enhance (Claude đề xuất, người dùng chọn):** style gốc thường có chỗ không hợp với video của mình. Claude đưa ra danh sách đánh số, mỗi mục có lý do và ảnh trước/sau. Người dùng trả lời kiểu "nhận 1, 3, bỏ 2". Các loại đề xuất:
     - Tương phản chữ/nền dưới chuẩn WCAG AA → chỉnh độ sáng nhưng giữ sắc độ.
     - Font gần nhất thiếu dấu tiếng Việt → đổi sang font cùng họ có đủ dấu (ví dụ Be Vietnam Pro, Inter).
     - Bảng màu gốc chỉ có 2–3 màu → bổ sung đủ token (`muted`, màu chuỗi cho biểu đồ, màu trạng thái) suy ra từ màu gốc.
     - Nhịp cắt kiểu TikTok quá nhanh cho explainer có lời đọc → đề xuất độ dài shot theo số từ/phút.
     - Phụ đề 9:16 nằm dưới nút và chữ của giao diện TikTok/Reels → đưa vào vùng an toàn.
     - Thiếu `lower_third`, intro/outro, kiểu thumbnail → sinh theo cùng ngôn ngữ hình ảnh.
     - Project thuộc series → giữ logo, giọng đọc và intro/outro của series, chỉ lấy phần còn lại từ style.
   - **Customize (người dùng tự chỉnh), 2 cách:**
     - *Nói trong chat:* "màu nhấn cam hơn", "chậm hơn 20%", "phụ đề kiểu karaoke", "nền sáng". Claude map sang trường cụ thể và ghi bằng `style-set.mjs <dir> <slug> motion.duration.base=0.72 captions.highlight=word …`.
     - *Trang chỉnh trên máy:* `style-editor.mjs <dir> <slug>` → `review/style-editor.html` (mở bằng file://, offline, giống `audio-picker.html`):
       - Bên trái là khung gốc; bên phải là 3 scene mẫu trong iframe, đọc biến CSS của brand nên đổi gì cũng thấy ngay, không cần render.
       - Có: ô chọn màu cho từng token, chọn font (chỉ font Fontsource có tiếng Việt), thanh trượt tốc độ motion, stagger, độ dài shot, chọn kiểu phụ đề (vị trí, cỡ, nền, highlight theo từ), flat/glass, transition mặc định.
       - Thanh trượt **"độ giống gốc" 0–100%**: trộn style trích xuất với brand/preset hiện tại (màu nội suy trong không gian OKLCH, số thì nội suy tuyến tính).
       - Nút khoá 🔒 từng trường.
       - Nút **"Sao chép thay đổi"** cho ra một dòng `style-set …`. Người dùng dán vào chat, Claude chạy lệnh đó. Trang không tự ghi file, nên mọi thay đổi vẫn đi qua Claude và được kiểm tra theo schema.
   - **Biến thể:** `style-set --variant dark|light|<tên>` lưu nhiều phiên bản từ cùng một style (ví dụ bản sáng cho YouTube, bản tối cho TikTok).
   - Sau mỗi vòng: chạy lại `style-compare.mjs` và hỏi lại. Gate chỉ đóng khi người dùng nói OK.

6. **Áp dụng** — `style-apply.mjs <dir> <slug> [--variant <tên>] [--as-preset <tên>]`
   - Ghi style đã gộp các lớp vào `brand.json` (bump `version`, theo quy tắc đổi brand hiện có: báo trước bao nhiêu scene phải duyệt lại).
   - Ghi gợi ý vào `studio.json → story` và storyboard.
   - Tuỳ chọn lưu thành preset để dùng cho project khác.
   - Cho project đang làm dở: sau khi áp dụng, `compare-presets.mjs` dùng được để so preset cũ với style mới trên chính các scene thật.

### Nhiều video tham khảo

`style-analyze` chạy cho từng video; `style-merge.mjs` lấy trung vị của metrics và màu xuất hiện ở ≥ 2 video → style của "một kênh" thay vì một clip lẻ. Dùng cho series.

### Ghi chú theo nền tảng

| Nguồn | Lưu ý |
|---|---|
| File local / screen record | Đường chắc nhất, luôn hỗ trợ. |
| YouTube / Shorts | Thường tải được không cần đăng nhập; có phụ đề tự động. Video giới hạn tuổi/thành viên → đề nghị tự tải. |
| TikTok | Extractor hay vỡ; video tải về có watermark động → che vùng watermark khi tính màu; phụ đề thường in cứng nên đọc kiểu chữ từ đó. |
| Facebook / Instagram Reels | Hay đòi đăng nhập → không dùng cookies tự động; đề nghị người dùng tự tải. |

### Ràng buộc an toàn và pháp lý

- Phong cách (nhịp, bảng màu, kiểu bố cục) không phải là thứ được bảo hộ, nhưng footage, nhạc, logo, nhân vật, giọng nói thì có. Skill chỉ xuất tham số style, không bao giờ chép asset sang project.
- Điều khoản của YouTube/TikTok/Facebook thường cấm tải xuống ngoài tính năng chính thức. Việc tải là lựa chọn và trách nhiệm của người dùng; skill hỏi xác nhận, ưu tiên file người dùng tự đưa.
- Không clone giọng của người trong video, chỉ lấy tốc độ đọc và tone.
- Cảnh báo khi style là bộ nhận diện riêng của một thương hiệu (màu + font + layout đặc trưng): dùng để làm video cho chính thương hiệu đó thì được, mạo danh thì không.

## Kế hoạch triển khai (gợi ý)

| Phase | Nội dung | File chính |
|---|---|---|
| 1 | `style.schema.json`, SKILL.md, router trong gate 0, `.gitignore`, consent `services.download` | `skills/style-extract/SKILL.md`, `schemas/style.schema.json`, `workflow-gates.md` |
| 2 | `style-fetch.mjs` (file + yt-dlp, giới hạn thời lượng, info.json, phụ đề) | `scripts/style-fetch.mjs`, `check-external.mjs` |
| 3 | `style-analyze.mjs` + `lib/style-metrics.mjs` (scdet, palette, signalstats, ebur128, sheet) | `scripts/`, `lib/` |
| 4 | Hướng dẫn đọc/map: bảng tra font, map visual mode/tone, quy tắc snap màu | `style-extract/references/*.md` |
| 5 | `style-compare.mjs`, `style-apply.mjs`, `--as-preset`, `style-merge.mjs` | `scripts/` |
| 6 | Enhance & customize: lớp `style.enhance.json` / `style.custom.json` + `locked`, quy tắc đề xuất enhance, `style-set.mjs`, `style-diff.mjs`, `style-editor.mjs` (trang chỉnh với preview CSS trực tiếp, thanh "độ giống gốc"), biến thể | `scripts/`, `lib/style-layers.mjs`, `style-extract/references/enhance-rules.md` |
| 7 | Test: video fixture tự sinh bằng FFmpeg (màu và điểm cắt biết trước) để kiểm metrics; e2e từ file local đến brand đã áp dụng | `tests/style.test.mjs`, `tests/e2e/` |

Test không cần mạng: fixture sinh bằng `ffmpeg -f lavfi color=...` nối các đoạn màu với độ dài biết trước, assert điểm cắt ±1 khung và màu chủ đạo ±ΔE nhỏ.

## Tiêu chí chấp nhận

- Từ một file local, ra `metrics.json` + 2 sheet trong < 30 giây với clip 60 giây, không gọi mạng.
- Điểm cắt đúng ±1 khung và màu đúng trên fixture tổng hợp.
- `style.json` hợp lệ theo schema; mỗi trường có `source`.
- Áp dụng style chỉ đổi `brand.json` (+ gợi ý storyboard/writers-room) và đi qua quy tắc bump version hiện có; không có file asset nào từ video gốc lọt vào `assets/`.
- Trích xuất lại hoặc merge không ghi đè trường đã nằm trong `style.custom.json` hay bị khoá; `style-diff` hiện đúng từng thay đổi so với gốc.
- Đề xuất enhance luôn có lý do và ảnh trước/sau, và chỉ được áp khi người dùng nhận. Tương phản chữ/nền sau khi áp dụng luôn đạt WCAG AA.
- `style-editor.html` chạy được qua file:// không cần mạng. Dòng "Sao chép thay đổi" khi chạy bằng `style-set` cho ra đúng style đang thấy trên trang.
- Link chỉ được tải khi `services.download: true`; link cần đăng nhập dừng lại với hướng dẫn tự tải.
- Thử trên `videos/vpbank-infinity-board`: style trích xuất từ video tham khảo cho ra brand gần với preset `infinity-board` viết tay.

## Câu hỏi còn mở

1. Gọi qua `/one-studio` hay có lệnh riêng (`/style-extract`)?
2. Có muốn hỗ trợ Gemini (`ak:ai-multimodal`) làm bước đọc motion tuỳ chọn, hay giữ 100% offline?
3. Mức lấy audio: chỉ thông số (LUFS, năng lượng) hay cả gợi ý thể loại nhạc để `make-music` tổng hợp gần giống?
4. Giới hạn 90 giây đầu có đủ không, hay cần chọn đoạn (ví dụ `--from 1:20 --to 2:10`)?
5. Style lưu thành preset ở đâu: `brand-presets.json` trong plugin (dùng chung) hay cache của người dùng (`~/.cache/one-studio/presets`)?
6. Trang `style-editor` chỉ cần "Sao chép thay đổi" rồi dán vào chat, hay muốn một server local nhỏ để trang ghi thẳng vào project (tiện hơn, nhưng là một tiến trình chạy nền phải quản lý)?

## Nguồn

- [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases), [yt-dlp version history](https://www.videohelp.com/software/yt-dlp/version-history), [yt-dlp PO Token provider framework](https://git.myzel394.app/Myzel394/yt-dlp/src/commit/ba090caeaaaedfca4a2984f5cce104431759b163/yt_dlp/extractor/youtube/pot)
- [FFmpeg scdet source](https://ffmpeg.org/doxygen/7.0/vf__scdet_8c_source.html), [scdet patch](https://ffmpeg.org/pipermail/ffmpeg-devel/2020-May/262633.html)
- [PySceneDetect](https://www.scenedetect.com), [shot detection benchmarks](https://github.com/albanie/shot-detection-benchmarks)
- [Remotion whisper.cpp transcribe](https://www.remotion.dev/docs/install-whisper-cpp/transcribe), [whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo)
- [OpenMontage visual-style](https://skills.sh/calesthio/openmontage/visual-style), [Mosaic motion graphics](https://docs.mosaic.so/tiles/motion-graphics.md), [Motion: YouTube style reference](https://motion.so/learn/youtube-style-reference-ai-video)
