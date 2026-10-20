# Brief & Script

## Brief template (`brief.md`)

```markdown
# Brief — <project name>
- Goal: what should the viewer think/feel/do after watching? (one sentence)
- Audience: who, what they already know, where they watch (sound on/off?)
- Platform & format: YouTube 16:9 | Reels/TikTok/Shorts 9:16 | feed 1:1 or 4:5 — fps 30 (60 for UI demos with fast scrolling)
- Length: 6s bumper | 15s | 30s | 60s | 90–120s explainer
- Key message (≤ 12 words):
- CTA: (url, handle, "download", "book a demo"…)
- Tone: playful / premium / technical / energetic / calm
- Brand: colors (hex), font, logo file, do/don't
- Language: VO + on-screen text language(s); subtitles needed?
- Voice-over: none | user file | TTS (provider, voice)
- Music: mood/BPM, or file; licence status
- References: links or "like X but Y"
- Assumptions made: (list anything you inferred)
```

When the user gives a one-liner ("làm video giới thiệu app X 30s"), infer sensible defaults (30fps, 9:16 if they mention TikTok/Reels, 16:9 otherwise, dark modern style, Inter, VO in the user's language) and **list them under Assumptions** so they can correct you.

## Length math

| Language | Comfortable VO pace | 15s | 30s | 60s |
|---|---|---|---|---|
| English | ~2.5 words/s (150 wpm) | ~35 words | ~75 | ~150 |
| Vietnamese | ~3 syllables/s (each space-separated "từ" is one syllable) | ~45 | ~90 | ~180 |

Leave ~10% air: transitions, the logo sting and the CTA hold need silence. On-screen text should be **much shorter** than the VO — 3–7 words per card. Reading time: ~0.3s per word + 1s.

## Structure

Default beat sheet (scale to length):

| Beat | Share | Purpose |
|---|---|---|
| Hook | 0–3s | stop the scroll: bold claim, question, surprising number, visual pattern break |
| Problem | ~20% | name the pain the audience recognizes |
| Solution | ~35% | the product/idea, shown not told — 1 idea per scene |
| Proof | ~25% | numbers, testimonial, demo, before/after |
| CTA | last 3–5s | one action, on screen long enough to read, logo |

Short clips (≤15s): Hook → Solution → CTA. Logo intros (≤6s): build-up → reveal → hold.

### Hook formulas
- **Number shock**: "87% of videos are watched without sound."
- **Question**: "Why does your app demo feel boring?"
- **Contrarian**: "Stop making explainer videos." (then explain what instead)
- **Visual pattern break**: a fast kinetic-type slam or a 3D object crashing in during the first 10 frames.
- **Outcome first**: show the end result, then "here's how".

For social (sound-off viewing) the hook must work **without audio** — big on-screen text from frame 0, captions on.

## Script format (`script.md`)

```markdown
| # | Beat | VO | On-screen | Visual idea | Sec |
|---|------|----|-----------|-------------|-----|
| 1 | Hook | Bạn mất bao nhiêu tiền mỗi tháng mà không biết? | "Tiền đi đâu?" | coins drain into a hole, kinetic type slam | 3 |
| 2 | Problem | … | … | … | 5 |
```

Then sum seconds, compare with the target, and say so explicitly ("tổng 29s / mục tiêu 30s").

## Writing tips
- One idea per scene; one sentence per idea.
- Write for the ear: short words, active voice, numbers spoken naturally ("hai mươi nghìn" not "20.000").
- Every VO line should have a visual — if you can't picture it, rewrite it.
- End on the CTA, not on a thank-you.
