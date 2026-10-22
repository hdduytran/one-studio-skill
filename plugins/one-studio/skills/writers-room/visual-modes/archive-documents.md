# archive-documents

## Use when
History, documentary, investigation: maps, photographs, letters, records, with a slow archival feel.

## Technique
Documents are the subject. Slow pan and push (Ken Burns) over a still; highlight the exact line being discussed; a map or timeline as the spine, with the date visible. A date and a source on every item. Use sparse, quiet sound.

## Storyboard fields
Scene: `mode: "archive-documents"`, `assets: ["assets/letter-1912.png"]`, lines of kind `fact` or `quote` with `source` and, for quotes, `speaker`. A timeline can be a world (`mode: "world-camera"` takes precedence if both fit).

## Build notes
`S.tl` with a long ease for pan/push on the image container; `S.draw` for a highlight box or map route; `S.enter` with `kind: "fade"` for captions of date and source. Use images the user supplies or public-domain items with the source recorded in `research.md`. Brand variables only; deterministic.

## Traps
- Downloading copyrighted images: use supplied or public-domain material only.
- Pan so fast the text cannot be read.
- Highlight on a wrong line: check the still before showing the user.
- No date or source on screen for a claim about the past.
