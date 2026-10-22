# Playbook: tutorial-walkthrough

## Use when

Teaching a viewer to do one task in a tool: set up, configure, publish, fix. The viewer has the app open next to the video or will follow along later.

## Viewer's question

"What will I have at the end, what do I need first, and what if it breaks?"

## Story core questions

- What is the single outcome, stated as a thing the viewer can see?
- What must they already have (account, version, file, permission)?
- Which step do most people get wrong, and what does the error look like?
- Which values must be exact (zoom 125%, port 8080, region)?
- What is the next task, to hang the ending on?

## Beat skeleton

Show the finished result first. Put the warning where the error happens, not in a preface. Theory goes after the steps. One video, one task.

| Beat | % of runtime | Job | but / therefore link |
|---|---|---|---|
| Result first | 8 | Show the finished thing working | opens |
| Requirements | 7 | Version, account, file, in one line each | THEREFORE start here |
| Steps 1 to 3 | 30 | Verb-first commands, exact values, cursor zoom on the click | THEREFORE the next screen appears |
| The tricky step | 15 | Slow down, show the usual error before it happens | BUT here it often fails |
| Remaining steps | 15 | Same rhythm, no re-explaining | THEREFORE it works |
| Troubleshooting | 10 | The two most common failures and their fix | BUT if you see X |
| Why it works | 8 | The short theory, now that they have seen it | THEREFORE you can adapt it |
| Next task | 7 | Pointer to the next video, one sentence | closes |

Example outline (Vietnamese, đặt lịch đăng bài tự động):
1. Đây là bài đăng lúc bảy giờ sáng mà bạn không cần thức dậy để bấm.
2. Bạn cần tài khoản gói Pro và một bài đã soạn xong.
3. Bấm Lên lịch, chọn ngày, đặt múi giờ GMT cộng bảy.
4. Nhưng nhiều người quên múi giờ, và bài đi lúc nửa đêm.
5. Nếu thấy chữ "Chưa kết nối", quay lại bước hai.

## Hook types

- Result: "Cuối video này bài của bạn tự đăng lúc bảy giờ sáng."
- Common error: "Chín trên mười người đặt lịch sai múi giờ ở bước này."
- Time promise: "Bốn bước, ba phút, và bạn không phải làm lại mỗi tuần."

## Visual modes

- screen-cinema: recorded run of the real task by script, zoom on each click, keyboard shortcut labels; saved login state only, never type a password.
- kinetic-type: exact values (125%, port 8080) as short on-screen text.
- split-compare: wrong setting against right setting at the tricky step.

## Research needed

- Run the whole task yourself on the current version; note screen names and version number.
- The official docs page and its date, to catch renamed buttons.
- Real error messages, copied exactly, from forums or your own failed runs.
- Plan limits or permissions that block the task.

## Traps

- Starting with history or theory; the viewer wanted the result.
- "Click the button" when there are three; name it exactly as the screen shows it.
- Rushing the tricky step at the same speed as the easy ones.
- Narrating what the viewer can already see ("now we can see the page").
- Recording on a version that has since moved a menu; state the version on screen.
- Troubleshooting for errors you never reproduced.

## Review checklist

- [ ] The result is visible in the first 15 seconds.
- [ ] Each step starts with a verb and an exact value.
- [ ] The warning sits just before the step that fails.
- [ ] Version and date are stated.
- [ ] You have done the task end to end on this version.
- [ ] No password or token appears in any frame.
