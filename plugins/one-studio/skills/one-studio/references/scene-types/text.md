# Scene type: text (kinetic typography, titles, quotes, CTAs)

Read `_common.md` first. Template: `templates/scenes/text.html`.

- One `.os-display` or `.os-h1` headline (≤ 8 words) + optional `.os-h2 os-muted` subline. Highlight one key word with `<span class="os-accent">`.
- Animate the headline with `S.words` (stagger 0.06–0.1), the subline with `S.enter(…, { kind: "up" })` 0.6–1 s later.
- Big numbers: `<span class="os-display os-accent" data-value="38">0</span>` + `S.count(…)`.
- Lists: one `.os-body` per item, `S.enter(".item", { stagger: 0.4 })`, synced to VO lines.
- Logo: `<img class="os-logo" src="../assets/brand/logo.svg">` (only if the brand has one).
- Lower third: `<div class="os-lower-third">Name · Role</div>` entering with `kind: "left"`.
