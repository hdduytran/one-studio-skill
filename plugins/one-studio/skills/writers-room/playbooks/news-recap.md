# Playbook: news-recap

## Use when

A recent event or a week of events, reported with sources and a clearly labelled view: tech news, market move, policy change, product recall. The viewer wants what happened and what it means for them in a couple of minutes.

## Viewer's question

"What happened, does it affect me, and what do I still not know?"

## Story core questions

- What is the single story, and what is its date and place?
- Who said what, and where is the primary source (filing, statement, post)?
- What does it change for this viewer, concretely (a price, a deadline, a setting)?
- Where do the sources disagree or go silent?
- What is our opinion, if any? It must be labelled as opinion.

## Beat skeleton

Per story: what happened, why it matters to you, what is unknown or next. The "to you" beat is the part most recaps skip and the only reason to press play. Show multiple sides, then the labelled opinion.

| Beat | % of runtime | Job | but / therefore link |
|---|---|---|---|
| Headline fact | 12 | The event in one sentence with date and source | opens |
| What happened | 22 | Sequence, who, numbers, each fact sourced | THEREFORE people reacted |
| The other sides | 16 | Quote each party; mark which are claims | BUT they disagree on... |
| Why it matters to you | 22 | Concrete effect on the viewer | THEREFORE you may need to... |
| Our view (labelled) | 10 | "Ý KIẾN" tag on screen and in the voice | BUT this is a view |
| Unknown and next | 12 | What is unconfirmed, the date to watch | closes |
| Silence | 6 | Headline held on screen | n/a |

Research runs only on the user's request. Web search needs services.web consent, runs in a subagent, and returns research.md only. Every fact line carries `> source: <id>`; quotes are copied, never reconstructed.

Gate 1 question: "Có muốn mình research thêm không? (cần tìm kiếm web)" / "Want me to research this further? (needs web search)". Set `services.web: true` only after yes.

Research brief (send as is, fill the blanks): "Topic: <topic>. Window: <from>-<to>. At least 2 independent sources per fact; record published and access date; split fact, quote (verbatim, with speaker) and opinion. Return only research.md in templates/research.md format."

On screen: storyboard lines with `kind: opinion` show an "Ý KIẾN"/"OPINION" chip while spoken; `kind: quote` (with `speaker`, `source`) show speaker and outlet. `publish` writes the cited sources to out/manifest.json and out/sources.txt (paste into the description).

Headline screenshot (own capture, no downloaded press images): with `services.capture` consent, add `flows/headline.json` with the article URL and steps `[{"wait": 1500}, {"mark": "shot"}]`, run `capture-screen.mjs`, then grab the frame at the mark time from `capture/headline/events.json` with `ffmpeg -ss <t> -i capture/headline/video.mp4 -frames:v 1 assets/headline.png`. Show the outlet and date next to it.

Example outline (Vietnamese, ngân hàng đổi quy định chuyển khoản):
1. Từ ngày 1 tháng 7, chuyển khoản trên hai mươi triệu phải xác thực sinh trắc.
2. Nhưng ngân hàng nói đây là quy định, còn khách hàng nói app lỗi liên tục.
3. Vì vậy nếu bạn hay trả tiền thuê nhà bằng app, hãy đăng ký trước ngày đó.
4. Ý kiến của tôi: thời hạn quá gấp, và đó là ý kiến.
5. Chưa rõ: người lớn tuổi không có điện thoại hợp lệ sẽ làm sao.

## Hook types

- Date and effect: "Từ mùng một tháng Bảy, chuyển khoản trên hai mươi triệu sẽ hỏi bạn một thứ mới."
- Conflict: "Ngân hàng nói không có lỗi. Hàng nghìn người dùng nói ngược lại."
- Unknown: "Có một câu hỏi mà thông báo chính thức không trả lời."

## Visual modes

- desk-collage: real headline screenshots and tweets with the source and date, highlighted line; paper map and marker.
- archive-documents: filings, statements, press releases with the cited lines.
- data-story-motion: a number or timeline when the story is about change.
- kinetic-type: the "Ý KIẾN" label and the date.

## Research needed

- Primary source first (statement, filing, regulator page), then two independent reports.
- Date, author or speaker, and link for every fact; check timestamps for updates.
- Counterparty reply or the reason it is not available.
- Effect on viewers: eligibility, deadline, cost.

## Traps

- Fabricated or paraphrased "quote"; copy the sentence and its source.
- Mixing fact and opinion in one sentence ("the reckless decision"); split them and label.
- Treating a single anonymous source as confirmed; say "một nguồn tin chưa được xác nhận".
- Skipping the "to you" beat and ending on the facts.
- Using a screenshot with no date, so a corrected story is shown as current.
- Running web research without consent or pasting raw search results into the main thread.

## Review checklist

- [ ] Each factual line has a `> source:` that exists in research.md.
- [ ] Opinions carry the "Ý KIẾN" label in voice and on screen.
- [ ] The viewer's effect is concrete.
- [ ] Unknowns are named and dated.
- [ ] Two sides are quoted accurately.
- [ ] Event date and video date are both clear.
