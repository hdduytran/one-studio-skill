# Plan: writers-room, thế giới liên tục, tự quay màn hình

Status: draft · Created: 2026-10-21 · Research: [researcher-261021-2314-human-scriptwriting-and-video-styles.md](../reports/researcher-261021-2314-human-scriptwriting-and-video-styles.md)

## Outcome

one-studio viết được kịch bản "có người" theo thể loại (14 playbook + 4 lớp định dạng + 5 giọng), và dựng được video liền mạch: camera bay trong một thế giới chung, chuyển cảnh có neo, quay màn hình tự động kiểu Screen Studio, tin tức có nguồn. Context mỗi gate có trần cố định.

## Constraints

- Tương thích ngược: project cũ (không có `story`, `world`, `camera`) vẫn chạy, mọi test hiện tại xanh.
- Giữ render tăng dần theo scene và concat copy stream.
- Không tự nhập mật khẩu khi quay màn hình; chỉ dùng storage state user cung cấp, chỉ URL user đưa.
- Web search cho tin tức chỉ khi user yêu cầu và `services.web: true`.
- Ngân sách context (mục "Context budget").

## Non-goals

- Không viết lại engine HyperFrames/Remotion; thế giới 3D (three.js) chỉ làm sau khi bản 2D ổn.
- Không tích hợp dịch vụ trả phí; không tải ảnh tin tức có bản quyền về dùng mà không ghi nguồn.

## Context budget (mỗi gate)

| Gate | Được nạp | Trần |
|---|---|---|
| 1 Brief | writers-room `SKILL.md` + `playbooks/index.md` + 1 playbook + `craft/story-core.md` | ~300 dòng |
| 2 Script | playbook đã chọn + ≤1 format + `tones.md` + `craft/write-for-the-ear.md`; luật cấm nằm trong `script-lint.mjs` | ~300 dòng |
| 3 Storyboard | `visual-modes/index.md` + các mode được chọn (≤3) | ~200 dòng |
| 5 Keyframe | như hiện tại + mode file của scene đang viết | không đổi |

Research tin tức chạy trong subagent; agent chính chỉ đọc `research.md`.

## Phases

| # | Phase | Phụ thuộc | File |
|---|---|---|---|
| 1 | writers-room skeleton, router, template, `studio.json → story` | – | [phase-01](phase-01-writers-room-skeleton.md) |
| 2 | Craft + `script-lint.mjs` | 1 | [phase-02](phase-02-craft-and-script-lint.md) |
| 3 | 14 playbook + 4 format + tones | 1 | [phase-03](phase-03-playbooks.md) |
| 4 | Visual modes + mở rộng storyboard schema | 1 | [phase-04](phase-04-visual-modes-and-schema.md) |
| 5 | Thế giới liên tục + camera + seam check | 4 | [phase-05](phase-05-continuous-world.md) |
| 6 | Tự quay màn hình + scene `screen` | 4 | [phase-06](phase-06-screen-capture.md) |
| 7 | Tin tức: research theo yêu cầu, nhãn fact/quote/opinion | 2, 4 | [phase-07](phase-07-news-research.md) |
| 8 | Tích hợp gate, docs, video mẫu kiểm chứng | 1–7 | [phase-08](phase-08-integration-and-sample.md) |

Phase 2, 3, 4 độc lập sau phase 1 (file riêng). Phase 5 và 6 độc lập với nhau sau phase 4.

## Acceptance criteria

1. `npm test` xanh; thêm test cho lint, schema mới, camera continuity, seam check, capture flow, nhãn tin tức.
2. Project cũ `examples/demo` validate và render như trước.
3. Mỗi playbook theo đúng mẫu 9 mục, ≤ 90 dòng; `index.md` ≤ 40 dòng; tổng nạp mỗi gate dưới trần.
4. `script-lint.mjs` bắt được cụm sáo rỗng vi/en, câu > 20 từ, số chưa viết cho tai, chuỗi "và rồi", thiếu cột hình, fact thiếu nguồn (tin tức).
5. Hai scene liền kề cùng `world` ghép lại không thấy mối nối (seam diff dưới ngưỡng), render lại chỉ scene bị sửa.
6. `capture-screen.mjs` quay được một flow trên trang local, scene `screen` zoom đúng vào vùng click, render xác định (2 lần render giống hệt).
7. Video mẫu "GPS hoạt động thế nào" đi qua đủ gate, đạt 8 tiêu chí "video con người" (report mục 8), user duyệt.

## Unresolved

- Một sub-skill `writers-room` (đề xuất) hay mỗi thể loại một skill.
- Chủ đề video mẫu.
