# Write for the ear

Read at gate 2. The viewer hears each sentence once, at the speed the voice chooses. Read every bullet aloud before approval.

## Say it like a person

- One bullet = one spoken sentence, 20 words at most; fewer when it carries a number. Subject first, active verb, no stack of subclauses.
- Say "you" to one person. "Your phone never talks to the satellites." Not "users interact with the constellation".
- Contractions and plain words: "isn't", "about", "so", not "furthermore" or "approximately".
- Cut the lead-in. "In this video we will explore how..." and "Bạn có bao giờ tự hỏi..." are skipped by the ear; start with the thing.

## Numbers for TTS

A TTS engine reads what it sees. Write what the mouth says, or set `say` on the storyboard line so captions can keep the digits.

| On the page | Vietnamese: write | English: write |
|---|---|---|
| 2026 | hai nghìn không trăm hai mươi sáu | twenty twenty-six |
| 3,5 triệu / 3.5M | ba phẩy năm triệu | three and a half million |
| 40% | bốn mươi phần trăm | forty percent |
| 12 km/h | mười hai ki-lô-mét một giờ | twelve kilometers an hour |
| 9:41 | chín giờ bốn mươi mốt | nine forty-one |
| API, GPS | "ây-pi-ai", "gi-pi-ét": spell the sounds or keep the Latin letters and check the voice | A-P-I, G-P-S |

Round: "gần bốn mươi phần trăm", "about forty percent". Keep one precise figure per sentence; put the rest on screen. Symbols (%, $, +, /) and digits trigger the lint warning.

## Rhythm

- Alternate: one short sentence (3-6 words) after every long one. "Nó không nói chuyện. Nó chỉ nghe." lands harder than one balanced sentence.
- Put the new word last. "...and the delay is the whole trick." beats "The whole trick is the delay, which..."
- Repeat a word on purpose instead of a synonym; the ear tracks sound, not variety.
- Avoid homophones and tone-clash strings in Vietnamese (long runs of similar tones); read it aloud to hear them.

## Silence

Not every beat needs a voice. After a reveal, hold the picture 1-2 s with `> silence: 1.5s`, or let `> sfx:` carry it. Put at least one silence in the video (the lint warns when there is none); never over a sentence that needs the picture explained.

## A sentence with a person in it

At least one sentence per video must sound like a human decided something: an opinion, a joke, an admitted limit, a reaction.
- "Mình thử ba lần mới tin con số này."
- "Honestly, I didn't expect the boring option to win."
- "Chúng tôi chưa đo được trường hợp mạng yếu."
Label opinions as opinions ("Ý kiến của mình:"). Never invent a quote, a name or an experience for the user.
