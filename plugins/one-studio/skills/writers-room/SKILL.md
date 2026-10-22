---
name: writers-room
description: Writes the brief's Story core and a human-sounding, two-column (voice + picture) video script for one-studio. Used by one-studio at gates 1-3 (brief, script, storyboard visual modes); also use when the user asks to write a video brief, a video script, or "viết kịch bản video", "viết script video", "kịch bản tin tức/giới thiệu sản phẩm/giải thích". Not for starting or rendering a video: that is one-studio.
---

# Writers' room

You write like a person who researched the topic, not like a template. Output lands in the project files; later gates read those files, not this skill.

`$W` = this skill's base directory. `$S` = the one-studio skill directory. Talk to the user in their language.

## Process (gate 2 follows it in order)

1. **Research** into `research.md` (`templates/research.md`): fact · quote · source · date · "interesting but unused". News or claims about the real world: required, every fact sourced.
2. **Info doc** = that file. Re-read it; pick 3 details only this topic has.
3. **Angle + one surprising thing**: one sentence saying what this video says that others do not. Write it into the brief's Story core.
4. **Beat outline**: 5-9 beats, one sentence each, joined by "but / therefore", never "and then". Percent of runtime per beat comes from the playbook.
5. **Visual abstract**: one concrete dominant image per beat (not "gear icon"). Picture decides the words.
6. **Two-column AV script** into `script.md` (`templates/script-av.md`): bullets are the voice, `> ` lines are picture, camera, sound, silence, source.
7. **Lint**: `node "$S/scripts/script-lint.mjs" <project>`; fix every violation it prints. The banned-phrase list lives in the script, not in context.
8. **Read-aloud pass**: sentence ≤ 20 words, numbers spelled for the ear, at least one sentence with a person in it (opinion, joke, admitted limit).
9. **Cut 20%**: the script must be shorter than the video; delete the weakest beat, not every beat's last word.

## Router: what to load at which gate

Load only the row for the current gate; never read other playbooks.

| Gate | Load | Budget |
|---|---|---|
| 1 Brief | this file, `playbooks/index.md`, ONE `playbooks/<id>.md`, `craft/story-core.md`, `templates/brief-story-core.md` | ~300 lines |
| 2 Script | the chosen playbook, at most one `formats/<id>.md`, `tones.md`, `craft/write-for-the-ear.md`, plus `craft/beat-outline.md` and `craft/research-and-info-doc.md` when those steps run | ~300 lines |
| 3 Storyboard | `visual-modes/index.md` + the chosen modes (max 3) | ~200 lines |
| 5 Keyframes | the mode file of the scene being written | one file |

Playbook ids: `saas-product`, `opensource-devtool`, `comparison`, `customer-story`, `tutorial-walkthrough`, `brand-story`, `news-recap`, `mechanism-system`, `concept-explainer`, `data-story`, `history-timeline`, `review-teardown`, `video-essay`, `list-countdown`.
Format ids (a layer on top, pick at most one): `short-vertical`, `long-form`, `series-episode`, `no-voice`.
Mode ids: `world-camera`, `match-cut-motif`, `screen-cinema`, `desk-collage`, `exploded-cutaway`, `kinetic-type`, `split-compare`, `archive-documents`, `data-story-motion`.

The user's own playbooks live in their library (`<library>/playbooks/<id>.md`, same nine sections). `node "$S/scripts/library.mjs" <project> --playbooks` lists built-in and library ones together with their signals; a library playbook is loaded from the path it prints, and only when its id is not built in (built-in ids always win).

Choosing: match the user's request against `playbooks/index.md` and the library list; if two fit, ask one question. Tone: pick from `tones.md` by the brief's point of view, do not mix.

## Gate 1 (brief)

Fill the Story core table (`templates/brief-story-core.md`) in `brief.md`. Ask the user at most 3 questions, only for what they have not said and you cannot invent: the angle, the real person or common misconception, the point of view. Never fabricate a person, quote or number.

## Record the choices

Write them once, in `studio.json`:

```json
"story": { "playbook": "concept-explainer", "format": "short-vertical", "tone": "knowing-friend", "modes": ["world-camera"] }
```

`format`, `tone`, `modes` are optional. Later gates and sessions read `story`; do not re-decide or reload playbooks to remember it.

## Rules

- Hook in the first 3 s: a question, a stake or a surprising fact, never "In this video".
- Silence is allowed: `> silence: 1.5s` or a beat with only `> sfx:`.
- Facts about the real world carry `> source: <id>` matching a row in `research.md`; opinions are written as opinions.
- Keep the one-sentence-per-bullet convention: the bullets are what TTS reads.
