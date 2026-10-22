# Báo cáo kiểm thử: writers-room + thế giới liên tục + quay màn hình (tích hợp, video mẫu GPS)

Ngày 2026-10-22. Nhánh `feat/writers-room-continuous-world`, không commit.

## 1. Tích hợp (Part A)

- `compare-presets.mjs`: dùng chung helper mới `linkSharedDirs` / `SHARED_DIRS` trong `scripts/lib/project.mjs` (link `worlds/`, `capture/`, `flows/`). `engines.mjs` (stage scene) và `variants.mjs` (variant tỉ lệ) cũng chuyển sang helper này, bỏ đoạn lặp. Test: `tests/units.test.mjs` (link khi có thư mục, bỏ qua khi không có) + chạy thật `compare-presets.mjs examples/gps-world --presets apple-keynote,synthwave --scenes s03,s06 --offline` ra `review/presets.jpg`.
- `SKILL.md` (86 dòng): hàng gate 5 nhắc `seam-check.mjs` + `review/seams.jpg`; ghi chú `scene.mode` → `writers-room/visual-modes/<mode>.md` và `S.camera/S.state/S.lines`; Credit discipline thêm dòng consent cho capture (`services.capture`, không gõ mật khẩu, chỉ storage state do user đưa) và web research (`services.web`). `screen` đã có sẵn trong router.
- `workflow-gates.md`: gate 1 (Story core), 2 (lint + đọc to), 3 (mode/world/camera), 5 (seams sheet) đã đúng; chỉ bù khoảng trống: loại scene thiếu `screen` ở gate 3.
- `credit-estimation.md`: thêm scene world (dài hơn, world file tính một lần, seam ~5 s/cặp) và capture (~30 s/flow, real-time, local).
- `README.md` (tiếng Việt): mục writers-room, thế giới liên tục, quay màn hình (Node ≥ 22, consent), tin tức; sửa bảng gate (1, 2, 3–4, 5) và danh sách công cụ; thêm `validate:gps`.
- `plugin.json` 0.3.0 → 0.4.0 (+ mô tả). `marketplace.json` không có trường version.
- `.gitignore`: thêm `examples/*/assets/camera.js` và `screen.js` (do `prepare-project` sinh, như `os.js`).
- `package.json`: thêm `validate:gps`.

## 2. Kết quả test (Part C)

| Lệnh | Kết quả |
|---|---|
| `node --test tests/*.test.mjs` | 118/119 pass. 1 fail đã biết: `caption choice … burn falls back to mux without libass` (máy này không có libass) |
| `npm run validate:demo` | valid |
| `npm run validate:gps` | valid |
| `claude plugin validate .` và `claude plugin validate plugins/one-studio` | cả hai pass |
| `npm run test:e2e` (đủ 4 file) | 3/4 pass: gate 0-9 + thêm scene, explainer/character/3D, world seam. `screen.test.mjs` fail MỘT lần khi chạy cả bộ ("two renders of the same scene differ": hai lần render lệch 2 khung ở cuối clip). Chạy riêng 2 lần liên tiếp đều pass (~31 s). Nghi ngờ do tải CPU khi node:test chạy song song nhiều file e2e. Nằm ngoài phần tôi sửa (capture/screen), cần theo dõi |

## 3. Seam (video mẫu)

`seam-check.mjs` toàn bộ cặp cùng world, ngưỡng 2%:

| Cặp | diff |
|---|---|
| s01 → s02 | 0.00% |
| s02 → s03 | 0.00% |
| s03 → s04 | 0.01% |
| s04 → s05 | 0.00% |
| s05 → s06 | 0.01% |

Lần chạy đầu có s03 → s04 = 0.49%: nguyên nhân là thẻ "≈ 67 ms" chưa tắt cuối scene và `trail` không nằm trong `exit_state`. Đã sửa: overlay tắt trước cuối scene, `exit_state` liệt kê đủ trạng thái cộng dồn (mỗi scene chỉ kế thừa exit_state của scene liền trước).

## 4. Ngân sách context (dòng nạp mỗi gate theo router writers-room)

| Gate | Nạp | Đo (mẫu GPS) | Trần | Ghi chú |
|---|---|---|---|---|
| 1 Brief | writers-room SKILL (60) + `playbooks/index.md` (28) + `mechanism-system` (79) + `craft/story-core` (35) + `templates/brief-story-core` (14) | 216 | ~300 | cộng one-studio `SKILL.md` (86) luôn nạp → 302 |
| 2 Script | `mechanism-system` + `tones` (58) + `write-for-the-ear` (44) + `beat-outline` (41) + `research-and-info-doc` (47) + `templates/script-av` (27) | 296 | ~300 | sát trần. Trường hợp xấu nhất (news-recap 86 + long-form 32 + cùng các file trên): 335, vượt trần ~12%. Chỉ phần lõi (playbook + 1 format + tones + write-for-the-ear): 213 |
| 3 Storyboard | `visual-modes/index` (13) + `world-camera` (24) + `exploded-cutaway` (19) + `match-cut-motif` (20) | 76 | ~200 | còn dư nhiều (mode lớn nhất 24 dòng) |
| 5 Keyframe | một mode file | 24 | không đổi | + `_common.md` + `diagram.md` = 55 như trước |

`workflow-gates.md` (117 dòng) đọc một lần mỗi phiên, không tính vào ngân sách trên. Luật cấm nằm trong `script-lint.mjs`/`data/slop-*.json`, không nạp.

## 5. Video mẫu `examples/gps-world/` ("GPS hoạt động thế nào")

Vi, 16:9, 60 s, preset `apple-keynote`, playbook `mechanism-system`, giọng `knowing-friend`, mode `world-camera` + `exploded-cutaway` + `match-cut-motif`; 6 scene cùng world `gps` (4266×2400), camera chuỗi street → whole → sat2 → street → circles → whole → whole'; motif `tick` (vòng sáng tích tắc) chuyền s02 → s03 → … → s06; `exit_state` đủ cộng dồn; `say` cho các câu có số (`text` giữ chữ số cho phụ đề).

- `research.md`: 8 dòng, truy cập 2026-10-22. Nguồn: GPS.gov Space Segment (20.200 km, hai vòng/ngày, ≥ 4 vệ tinh, 31 vệ tinh), NASA GPS (đồng hồ nguyên tử, tính thời gian tín hiệu tới, 10 ns), Ohio State Astronomy 162 (38 µs/ngày = 45 − 7, ~10 km/ngày), GPS.gov poster và ESA Galileo infographic (tốc độ ánh sáng, vệ tinh thứ tư sửa đồng hồ máy thu, 1 ns = 30 cm), phép tính 67 ms ghi rõ (20.200 / 299.792). Lưu ý nguồn r4 (poster, tải trực tiếp 404) và r5 (ESA, site tạm offline) lấy nội dung qua tóm tắt tìm kiếm; ghi rõ trong bảng.
- `script-lint.mjs`: 0 lỗi, 0 cảnh báo (đã cắt từ 155 xuống còn vừa trần 90% của 60 s). Có khoảng lặng (s03 1.5 s, s06 2 s), câu có người (người đứng ngã tư; "Ý kiến của mình: …" gắn `kind: opinion` để hiện nhãn "Ý KIẾN").
- World `worlds/gps.html`: trái đất vòng cung có khí quyển, lưới kinh/vĩ, đèn thành phố, ngã tư (nhà, đèn giao thông, người cầm điện thoại, khung bản đồ phóng to với chấm xanh), 4 vệ tinh có đồng hồ (cụm vỏ tách theo `--ex` cho cảnh cutaway, đồng hồ nguyên tử có biểu tượng nguyên tử), tick và vệt tín hiệu, cung khoảng cách (ba cung gặp nhau, bộ lệch hình tam giác, cung thứ tư), tia từ 4 vệ tinh. Chỉ biến brand, không CSS transition; mọi chuyển động nằm trong timeline scene (`S.drive` theo thời gian tuyệt đối nên seek thứ tự nào cũng xác định). Nhãn "Minh hoạ, không theo tỉ lệ" nằm trong world.
- Đã dừng ở sau gate 6 (build preview). Không gọi TTS, không gọi mạng ngoài WebSearch/WebFetch cho research. `make-music --use none` (cục bộ).

Đường dẫn (thư mục `review/` và `out/` đã nằm trong `.gitignore`, không commit):
- Contact sheet: `/Users/hdduytran/Developer/one-studio-skill/examples/gps-world/review/sheet.jpg`
- Seams: `/Users/hdduytran/Developer/one-studio-skill/examples/gps-world/review/seams.jpg`
- Preview câm 60 s, 960×540: `/Users/hdduytran/Developer/one-studio-skill/examples/gps-world/review/preview-silent.mp4` (lấy từ `concat-and-mix.mjs --preview` sau `make-music --use none`, rồi `ffmpeg -c:v copy -an` bỏ track âm, vì bản trộn còn một tiếng pop SFX; file gốc ở `out/gps-world-preview.mp4`)
- So sánh preset: `/Users/hdduytran/Developer/one-studio-skill/examples/gps-world/review/presets.jpg`

### Chấm theo 8 tiêu chí (report mục 8), tự đánh giá

| # | Tiêu chí | Điểm | Căn cứ |
|---|---|---|---|
| 1 | Angle một câu | Đạt | "Điện thoại không gửi gì lên vệ tinh, nó chỉ nghe giờ" (brief) và s01 |
| 2 | Người/tình huống hoặc hiểu lầm cụ thể | Đạt | Người đứng ngã tư; hiểu lầm "nó hỏi vệ tinh" bị phá ngay s01 |
| 3 | Chuyển beat nhưng / vì vậy | Một phần | s01 (nhưng), s04 (càng… nên), s05 (nên) rõ; s02 → s03 và s05 → s06 chuyển bằng hình/chuyển động hơn là chữ nối |
| 4 | Hình chủ đạo cụ thể, truy được nguồn | Đạt | mỗi scene một hình (vệ tinh tách vỏ, tick lao xuống, ba cung, cung thứ tư, cả hệ chạy), `> source:` khớp r1-r7 |
| 5 | Câu có quan điểm thật | Đạt, cần chủ video xác nhận | "Ý kiến của mình: …" có nhãn. Đây là giọng tác giả viết thay, chưa phải ý kiến user |
| 6 | Không cụm sáo rỗng; số viết cho tai | Đạt | lint 0/0; chữ số chỉ ở caption `text`, `say` đã đánh vần |
| 7 | Chuyển cảnh có neo | Đạt | motif tick chuyền s02 → s03, camera chuỗi, mọi cặp ≤ 0.01% |
| 8 | Script ngắn hơn video, có khoảng lặng | Đạt (ước lượng) | ~150 từ ≈ 53 s đọc trong 60 s; hai khoảng lặng. Cần kiểm lại sau khi có VO thật |

Sơ bộ so với `examples/demo` (đọc brief/storyboard, không chấm lại bằng render): demo không có Story core, không có khoảng lặng, chuyển cảnh fade/slide, scene tách rời, nên đạt khoảng 3/8 (1, 4, 6 một phần). Kết luận này chưa qua user.

## 6. Phê duyệt do build agent thực hiện (chỉ cho video mẫu; user CHƯA duyệt)

Schema `studio.json` không có chỗ ghi chú, nên ghi ở đây. Agent tự chạy: `--approve brief` (không cần OK người dùng), `--approve script`, `--approve storyboard`, `--approve estimate`, `--approve-scenes all`, `--approve keyframes`, `--approve build`; ngoài ra `make-music --use none`. Chưa chạy gate 7-10. Mọi gate cần user (2, 3, 4, 5) phải được user xem lại và duyệt thật.

## 7. Vấn đề còn mở

- Chưa có VO/phụ đề: thời điểm bám câu (`S.line(id, fallback)` trong scene) mới chạy bằng fallback; `build-audio` sẽ kéo dài scene theo giọng đọc, cần xem lại hình sau khi có audio. Cần user chọn giọng và cho phép TTS.
- Gate 2 chạm trần ngữ cảnh (296/300 ở mẫu, 335 ở trường hợp xấu nhất).
- `status.mjs --estimate` coi scene world là `diagram` (5k-9k token), chưa tính world file viết một lần; `credit-estimation.md` đã mô tả nhưng chưa có trong mô hình tính.
- `screen.test.mjs` flaky khi chạy cả bộ e2e (xem mục 2).
- Test caption đã biết (libass) vẫn fail.
- r4/r5 trong `research.md` nên kiểm lại nguyên văn khi trang GPS.gov poster và ESA hoạt động.
- Chưa làm: bản 9:16 cho video mẫu (chỉ xuất 16:9).

## Câu hỏi chưa giải quyết

- Ý kiến cuối video ("đẹp nhất là hệ thống im lặng…") có phải quan điểm thật của chủ video không, hay cần câu khác?
- Cần giữ `review/preview-silent.mp4` ngoài git (đang ignore) hay muốn đưa một bản nhẹ vào repo làm mẫu?
