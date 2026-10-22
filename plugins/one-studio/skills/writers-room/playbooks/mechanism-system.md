# Playbook: mechanism-system

## Use when

The video shows how a machine, product or system works on the inside: GPS, a heat pump, a payment network, a CDN, a coffee machine. The viewer ends able to trace the thing from input to output. Not for a definition of a term (concept-explainer) or a verdict on a product (review-teardown).

## Viewer's question

"I use this every day. What is actually happening in there?" The viewer wants one picture of the whole path, not a parts list.

## Story core questions

- What is the one thing that flows (energy, data, fuel, a packet, money) from input to output? Name it in a single noun.
- What common belief about it is wrong or incomplete? ("GPS phones do not send anything up to satellites.")
- Which single part is the surprise: the part that looks trivial but carries the trick?
- What is the human-scale anchor for size, speed or count?
- Which stage fails most often, and what does the failure look like from outside?

## Beat skeleton

Follow the flowing thing. One part and one label per beat, in the order the thing meets them (the Branch Education method: model from technical data, camera and electron path move together). Order of teaching: concrete example, then the rule, then the technical name (3Blue1Brown).

| Beat | % of runtime | Job | but / therefore link |
|---|---|---|---|
| Familiar moment + misconception | 8 | Show the everyday act, state what people assume | opens |
| Stakes of not knowing | 7 | Why the assumption breaks (a number, a failure) | BUT the real path is different |
| Input enters | 12 | Follow the flowing thing past the first part, label it | THEREFORE it must go through... |
| Core part 1 to 3 (one beat each) | 45 | Cutaway the part, show what it does to the flow, slow-mo the key instant | BUT one step looks wasteful, THEREFORE... |
| The trick | 12 | The surprising part, shown with a human-scale number | THEREFORE the output is... |
| Output + full loop | 10 | Whole machine runs once at real speed, flow colour consistent | closes |
| Limit or open question | 6 | What breaks, what nobody has solved | optional re-hook |

Example outline (Vietnamese, "GPS hoạt động thế nào"):
1. Bạn mở bản đồ và chấm xanh hiện ra trong hai giây. Nhiều người tin điện thoại gửi vị trí lên vệ tinh.
2. Nhưng vệ tinh không biết bạn tồn tại, nó chỉ đọc giờ của chính nó to lên.
3. Vì vậy điện thoại đo xem mỗi tiếng "tích tắc" đến trễ bao lâu, khoảng bảy mươi phần nghìn giây.
4. Nhưng đo sai một phần tỷ giây đã lệch ba mươi phân, nên đồng hồ nguyên tử trên vệ tinh là chi tiết sống còn.
5. Vì vậy ba khoảng cách cắt nhau thành một điểm; khoảng cách thứ tư sửa đồng hồ rẻ của điện thoại.
6. Cả hệ chạy lại một lần ở tốc độ thật, chấm xanh nhích đúng ngã tư bạn đứng.

## Hook types

- Misconception: "Bạn nghĩ điện thoại gửi tín hiệu lên vệ tinh? Không. Nó chỉ nghe."
- Scale shock: "Một tín hiệu mất bảy mươi mili giây để xuống tay bạn, đủ để bạn chớp mắt một phần ba."
- Failure first: "Vào hầm gửi xe, chấm xanh trôi đi hai trăm mét. Đây là lý do."

## Visual modes

- exploded-cutaway: the core parts, one step per axis, a cutaway that reveals the flow path; consistent flow colour.
- world-camera: the whole system as one world; camera follows the flowing thing between parts; scale planned in the storyboard.
- match-cut-motif: the flowing thing as the motif, handed from part to part.
- kinetic-type: only for the one-word label of each part, never full sentences.

## Research needed

- A primary technical source (spec, datasheet, standard, manufacturer teardown) for every stage; a second source for any number.
- Real figures with units and conditions: speed, size, tolerances, failure rate.
- The common misconception, found in the wild (a forum question, a survey), not invented.
- An expert review or at least a cross-check by a second explainer; note disagreements.

## Traps

- Opening with the definition ("GPS là hệ thống định vị toàn cầu...") instead of the familiar moment and the wrong belief.
- Parts parade: five components in five beats with no flowing thing connecting them, so the viewer remembers names but not the path.
- Changing the flow colour or direction between scenes; the eye loses the thread and the video becomes five unrelated animations.
- Labels appearing before the part is explained; the label should arrive with the voice naming the part.
- Skipping the full real-speed replay at the end, so the viewer never gets the payoff of seeing it work as one.
- Giving a precise number without a human anchor ("20.200 km" with nothing to compare to).
- Explaining the textbook version while the real device uses a shortcut; check the real model.

## Review checklist

- [ ] One sentence names the flowing thing and the misconception.
- [ ] Every beat adds exactly one part; transitions read "but" or "therefore".
- [ ] Concrete example comes before the rule, rule before the technical name.
- [ ] The trick has a human-scale number with a source.
- [ ] The last scene replays the whole path at real speed.
- [ ] Remove the labels: the picture still shows where the flow goes.
- [ ] At least one honest limit or unsolved case is stated.
