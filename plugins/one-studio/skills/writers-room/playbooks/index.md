# Playbook index

One playbook per video. Match the user's request to the signals, load only that `playbooks/<id>.md`.

| id | Use when | Signals (vi / en) |
|---|---|---|
| saas-product | selling or introducing a software product | giới thiệu phần mềm, sản phẩm SaaS, app / product demo, SaaS promo |
| opensource-devtool | a library, CLI or dev tool for developers | mã nguồn mở, thư viện, công cụ dev, repo / open source, library, CLI, GitHub |
| comparison | A vs B, choosing between options | so sánh, nên chọn cái nào, A hay B / versus, vs, which one |
| customer-story | one customer's before and after | câu chuyện khách hàng, case study, khách của chúng tôi / customer story, testimonial |
| tutorial-walkthrough | step-by-step how to use something | hướng dẫn, các bước, cách dùng / tutorial, walkthrough, how to use |
| brand-story | who we are, why we exist | câu chuyện thương hiệu, về chúng tôi, sứ mệnh / brand story, about us, mission |
| news-recap | a recent event, with sources | tin tức, điểm tin, vừa xảy ra, tuần qua / news, recap, what happened |
| mechanism-system | how a thing or system works inside | hoạt động thế nào, bên trong, cơ chế / how it works, under the hood, mechanism |
| concept-explainer | an idea or term for beginners | giải thích, là gì, ELI5, khái niệm / explain, what is, concept |
| data-story | a finding in numbers | số liệu, biểu đồ, báo cáo, xu hướng / data, statistics, trend, report |
| history-timeline | how something came to be over time | lịch sử, dòng thời gian, nguồn gốc, tiến hoá / history, timeline, origin |
| review-teardown | judge or dissect a product | đánh giá, review, mổ xẻ, có đáng mua / review, teardown, worth it |
| video-essay | an argued opinion with a thesis | góc nhìn, bài luận, tại sao mọi người sai / essay, opinion, why we are wrong |
| list-countdown | ranked or numbered list | top 5, danh sách, xếp hạng, mẹo / top N, countdown, ranking, tips |

## Formats (optional layer, max one)

`short-vertical` (9:16, under 60 s, hook at 0 s) · `long-form` (over 3 min, chapters, re-hooks) · `series-episode` (recap, cliffhanger, shared intro) · `no-voice` (music and captions only). Files: `formats/<id>.md`.

## Tone

Five voices with sample lines and bans in `tones.md`: `knowing-friend`, `dry-expert`, `playful`, `neutral-newsroom`, `cinematic-minimal`. Pick one; record it in `studio.json → story.tone`.
