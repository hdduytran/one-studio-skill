# Scene type: data (charts, stats, comparisons)

Read `_common.md` first. Template: `templates/scenes/data.html` (bar chart from `storyboard.json → scenes[].data`).

- Rows come from the storyboard `data` array; `OS.barChart(".os-chart", rows, { label, value, highlight: "last"|"max"|"min"|index, scale: "linear"|"log", format, labelFormat })`.
- Use `scale: "log"` when values span more than ~50× (the scaffold picks it automatically).
- Count values up with `S.count(".os-bar-value", { at, suffix })`, grow bars with `S.bars(bars, { at })`.
- Vietnamese number format: `v.toLocaleString("vi-VN")` (1.000), units after a space.
- Always state the source in `.os-small os-muted` at the bottom when the data is real.
- Other chart forms (line, donut): draw as SVG paths and reveal with `S.draw`; keep the brand classes.
