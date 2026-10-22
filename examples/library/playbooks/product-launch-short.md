# Playbook: product-launch-short

## Use when

A new product or feature is announced and the video is a vertical short (YouTube Shorts, TikTok, Reels) of about 60–70 s that ends on a waitlist or sign-up. Not for a full product tour (saas-product) or a step-by-step how-to (tutorial-walkthrough).
Signals: ra mắt sản phẩm, video ngắn giới thiệu tính năng mới, danh sách chờ / product launch short, feature announcement, waitlist

## Viewer's question

"What does this actually do on a normal morning, and is it for me?" They scroll on in two seconds unless they recognise a moment from their own day.

## Story core questions

- Which concrete moment opens it (an hour, a phone screen, a message) that the viewer has lived?
- What do people wrongly expect from this kind of product (it waits to be asked, it needs setup)?
- What is the turn: the one thing this product does differently?
- Which 2 or 3 product moments prove it, each one visible action?
- Which real customer, named and sourced, used it? If there is none, drop the beat.
- What is the honest limitation, said as our opinion?

## Beat skeleton

Built from the Claude Duet launch (vi, 9:16, 67 s): a moment, a misconception, a turn, product moments, a sourced customer, an honest limit, one call to action.

| Beat | % of runtime | Job | but / therefore link |
|---|---|---|---|
| Moment | 10 | A phone at 7:00 with one notification; no product name yet | opens |
| Misconception | 8 | "Most assistants just sit and wait" | BUT this one does not |
| Turn | 10 | Product name and the single idea, kinetic headline | THEREFORE the day changes |
| Product moment 1 | 15 | Summary, then silence: it knows when nothing is urgent | THEREFORE you put the phone away |
| Product moment 2 | 15 | It fixes a real mistake (a wrong date) before you notice | BUT can it act alone? |
| Product moment 3 | 12 | Approval card: you approve, money moves are always blocked | THEREFORE you stay in charge |
| Real customer | 10 | One named company, sourced in research.md | THEREFORE it holds up |
| Honest limit | 10 | "It still misjudges what is urgent", labelled as opinion | BUT you decide |
| Call to action | 10 | Waitlist, who can join, one URL | closes |

## Hook types

- Moment: "Bảy giờ sáng. Điện thoại sáng lên với ba việc cần bạn."
- Misconception: "Phần lớn trợ lý chỉ ngồi chờ bạn hỏi."
- Number with a source: "Hơn sáu nghìn ứng dụng, và nó tự biết lúc nào nên im."

## Visual modes

- screen-cinema: phone and chat mockups from a kit (`new-scene --kit`), one action per scene.
- kinetic-type: the turn and the product name, with an accent underline.
- split-compare: the wrong calendar date struck through, the fixed one beside it.

## Research needed

- The announcement and product page (what it does, who can join, platforms); every fact gets a research row.
- One real customer story with a source; never invent one.
- The limitation the maker admits, or the one you can show; say it as an opinion.
- Waitlist conditions (plans, countries) exactly as published.

## Traps

- Opening on the logo: the first 3 s belong to the moment.
- More than three product moments: a short has room for three.
- Fake app logos on connector chips: use names only.
- Planning durations at 2.8 words/s with a fast voice: check `status.mjs --estimate` and tighten after the first build.
- 16:9-only layouts: check the 9:16 preview at gate 8 (`concat-and-mix --preview --ratio 9:16`).

## Review checklist

- [ ] A concrete moment in the first 3 s, product name only at the turn.
- [ ] Two or three product moments, each one visible action.
- [ ] The customer is real and has a `> source:` row.
- [ ] The limitation is on screen with the opinion label.
- [ ] One call to action: the waitlist.
- [ ] 60–70 s, 9:16 checked, captions clear of the platform UI.
