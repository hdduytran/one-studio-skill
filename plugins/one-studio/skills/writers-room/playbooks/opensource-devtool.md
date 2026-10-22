# Playbook: opensource-devtool

## Use when

A library, CLI, framework or developer tool aimed at developers: a repo launch, a release, a "why I built this" video. The viewer reads code for a living and distrusts hype.

## Viewer's question

"Does it solve a problem I actually have, what does it cost me to adopt, and what is wrong with it?"

## Story core questions

- What annoyed the maker enough to build it? One real incident, not "we saw a gap in the market".
- What does one line of command or ten lines of code now do?
- What is the old way, stated fairly, with its real cost?
- What are the honest limits (unsupported cases, maturity, performance conditions)?
- Which real numbers exist, and under what measuring conditions?

## Beat skeleton

Maker's frustration, the one-liner, compared with the old way, an honest limit, then try it. Admitting limits is the strongest "human" signal for developers.

| Beat | % of runtime | Job | but / therefore link |
|---|---|---|---|
| Frustration | 15 | The maker's concrete bug or wasted afternoon | opens |
| What it does | 15 | One command, real output, no slide | THEREFORE the afternoon shrinks |
| How (one diagram) | 15 | The one architectural idea, one picture | BUT how can it be fast |
| Versus the old way | 18 | Same task, fair treatment, measured | THEREFORE the numbers |
| Honest limits | 14 | What it does not do, who should not use it | BUT it is not for everything |
| Contributors or community | 8 | Real avatars, PR counts, the issue that shaped it | THEREFORE it is not one person |
| Try it | 10 | Install line on screen, repo, star | closes |
| Silence | 5 | Let the final command finish running | n/a |

Example outline (Vietnamese, công cụ nén ảnh dòng lệnh):
1. Mình mất cả chiều thứ Ba chỉ để đoán vì sao build chậm ba phút.
2. Nhưng thủ phạm là 400 ảnh PNG chưa nén.
3. Vì vậy mình viết một lệnh: chạy một dòng, build về còn 40 giây.
4. Mình đo trên máy này, 8 nhân; máy yếu hơn sẽ khác.
5. Nó chưa hỗ trợ AVIF. Nếu bạn cần AVIF, đừng dùng.

## Hook types

- Maker's pain: "Mình mất một buổi chiều để tìm ra 400 file PNG làm build chậm."
- Code-first: "Một dòng lệnh. Build từ ba phút còn bốn mươi giây."
- Confession: "Công cụ này chưa làm được AVIF, và mình sẽ nói rõ ở phút thứ ba."

## Visual modes

- screen-cinema: terminal typed for real via the capture flow, diffs and logs; never type secrets.
- desk-collage: one architecture sketch with marker highlight.
- split-compare: old command and new command, same timer.
- kinetic-type: the install line and the key number.

## Research needed

- The repo itself: README, issues, release notes, real contributor list.
- Benchmark method, hardware, version, date; rerun if possible instead of quoting the README.
- Two or three real alternatives and what they do better.
- Licence and maintenance status (last release, open issues).

## Traps

- Words like "blazing fast" or "supercharge" with no number beside them; developers scroll away.
- A benchmark with no hardware, version or command shown.
- Straw-man comparison against the worst possible setup of the old tool.
- Mocked terminal output that cannot be reproduced; show the real run, trimmed for time.
- Hiding the limits; the comment section will list them for you.
- Showing a token or env value on screen during capture.

## Review checklist

- [ ] The maker's frustration is a specific incident.
- [ ] Every benchmark states hardware, version and what was measured.
- [ ] At least one limit is stated in the maker's own voice.
- [ ] The install or try line is readable for 3 seconds.
- [ ] Competitors are described as their authors would accept.
- [ ] No secret visible in any frame.
