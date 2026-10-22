# Research and info doc

Use at gate 2, step 1. Output: `research.md` (`templates/research.md`). The info doc is where the video gets its facts and its "only this topic has" details. Raw pages never go in it.

## What to collect

- Facts and numbers, each with a source and a date (required for news and any real-world claim).
- Quotes, word for word, with who said it, where and when. Never reconstruct a quote from memory.
- The common misconception and the evidence against it.
- People: who was affected, who decided, what they actually did.
- "Interesting but not used": keep it. The best detail often fits a different beat after the outline is cut.

Aim for about three times more material than the script will use.

## The table

One row per source: `id | type | content | source | url | published | accessed | speaker`. Type is `fact`, `quote`, `opinion` or `context`; speaker is for quotes. Scenes cite rows with `> source: r1,r2`; the lint checks that the ids exist.

| id | type | content | source | url | published | accessed | speaker |
|---|---|---|---|---|---|---|---|
| r1 | fact | Orbit 20,200 km up, 4 satellites needed for a fix | Agency page | https://example.org/gps | 2026-03-02 | 2026-10-20 | |
| r2 | quote | "...position is a by-product of time" | Interview, Example Weekly | https://example.org/iv | 2025-11-10 | 2026-10-20 | Dr. An Example |

## Source quality

- Prefer the origin (filing, paper, official statement) over an article about it. Two independent sources for any number that carries the video.
- Vendor blogs and benchmarks are claims, not facts: state who measured, with what.
- If a source is secondary or old, say so in the row. A number you cannot trace does not go in the script.

## Facts, quotes, opinions

- Fact: could be checked by someone else. State it flat and cite.
- Quote: someone's words; the script says who ("Theo bà Lan,..."), never presents it as fact.
- Opinion: ours or theirs; in the script it is said as an opinion and shown with a label on screen ("Ý KIẾN").
- News recap: every sentence stating a fact has its scene sourced. No source, no sentence.

## Run research in a subagent

Web pages stay in the subagent's context; the main agent receives only `research.md`. Ask at gate 1: "Có muốn mình research thêm không? (cần tìm kiếm web)" / "Want me to research this further? (needs web search)". Set `services.web: true` only after a yes; otherwise use what the user provided.

Fixed brief for the researcher subagent:

> Topic: <topic>. Time window: <from> to <to>. Find at least 2 independent sources for every fact (not two outlets quoting the same release). Record published date and access date (today) for each. Split fact, quote (word for word, with speaker) and opinion. Return only `research.md` in `templates/research.md` format: no raw pages, no summaries outside the table.

## Done when

Three details only this topic has are written under "Details only this topic has", each traceable to a row. Open questions are listed; none of them are silently guessed.
