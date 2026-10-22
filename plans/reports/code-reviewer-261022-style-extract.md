# Code review: feat/style-extract vs main (61e617a..1e0c8aa)

Base: `npm test` = 226 pass / 1 fail (known libass caption test). Paths below are relative to `plugins/one-studio/skills/one-studio/scripts/`.
No Critical or High found. No shell injection, no consent bypass, no cookies path, no editor network access, no out-of-folder deletion reachable from the documented CLI usage.

## Medium

1. **style-merge fails on integer-typed fields** (`style-merge.mjs:40-52`, `median()` at :32). CONFIRMED (reproduced).
   Sources with `brand.captions.max_chars` 20 and 25 give median 22.5, and `writeMerged` dies with `$.brand.captions.max_chars: expected integer, got number`. No merge is written. The existing "median of an even count is the mean" test uses a float field, so it hides this.
   Fix: in `mergeValues`, if every input is an integer, `Math.round` the median (or consult the schema type for the path).

2. **style-apply is not idempotent: every run bumps brand.version** (`style-apply.mjs:70-71`). CONFIRMED (two applies: version 1 -> 3).
   Re-running after a partial failure, an agent retry, or a second `--as-preset` re-opens every approved scene for no change.
   Fix: if `mergeBrandPatch(project.brand, style.brand)` deep-equals the current brand (minus version/preset), keep the version. Or skip when `hints.applied_hash` matches and the brand is unchanged. Add a test.

3. **Letterbox / pillarbox bars pollute the palette and the bg role** (`lib/style-palette.mjs:23-35`, `style-analyze.mjs:61-65`). CONFIRMED (640x200 red clip padded to 640x360: palette = red 69%, black 28%).
   `letterbox()` is computed but never used to crop before sampling, so a 16:9 reference inside a 9:16 frame (common for reposts) gets near-black as the biggest border cluster, so bg=black and the fg/accent roles come out wrong. Provenance still says "measured".
   Fix: pass the cropdetect rectangle to `framePixels` and skip pixels outside it, or drop rows/cols whose luma is under about 16 at the edges. Add a test.

4. **Cached preset name clash makes `loadPresets()` throw, which breaks init-project and compare-presets** (`lib/presets.mjs:25`). PLAUSIBLE.
   If a later plugin release adds a preset whose name already exists in `${cache}/presets/`, `PRESET_NAMES()`, `applyPreset` and `init-project --preset` all throw until the user hand-deletes a cache file.
   Fix: skip the cached entry with a warning (the plugin preset wins). Keep the hard error only in `assertCachePresetName` on save.

5. **Unbounded wall-clock on the new heavy calls; one FFmpeg call without `-nostdin`**. PLAUSIBLE (hang class) / CONFIRMED (grep).
   - `style-fetch.mjs:44` `spawnSync(yt-dlp)` has no `timeout`. A stalled download hangs the agent forever.
   - `style-fetch.mjs:26` `run("ffmpeg" …)` has `-nostdin` but no `timeout` (`lib/ffmpeg.mjs run`). With `--max 0` a whole file is re-encoded.
   - `lib/contact-sheet.mjs:42` has no `-nostdin` and no timeout. It is called from style-analyze, style-compare and style-enhance. `spawnSync` gives an EOF stdin, so it is safe today, but it breaks the stated rule.
   - Everything in `lib/style-measure.mjs` is correctly bounded (`-nostdin`, `-t`, timeout), as are tokenStrips (`d=1`, `-frames:v 1`) and the build-audio fix.
   Fix: add `timeout` (for example 10 min for yt-dlp, `60s + 4*duration` for the cut) and `-nostdin` in contact-sheet.

## Low

6. **yt-dlp invocation edge cases** (`lib/ytdlp.mjs:50-61`). PLAUSIBLE.
   - `-o ${dir}/source.%(ext)s`: a `%` in the project path (for example `/Users/x/100%/proj`) is read as an output-template field, so the download fails or lands in a wrong name. Escape it (`dir.replace(/%/g, "%%")`) or run with `cwd: dir` and a relative `-o`.
   - `--no-cookies-from-browser` does not stop a user `yt-dlp.conf` or `~/.config/yt-dlp/config` from adding `--cookies FILE`, `--cookies-from-browser` or `--exec`. Add `--ignore-config` to back up "no cookies".
   - Generic extractor will fetch any http(s) host, including localhost and LAN. Only the consent gate protects it. Acceptable if documented.

7. **Reserved layer names usable as variant names** (`lib/style-layers.mjs:19,100-101`). CONFIRMED (`style-set --variant custom` writes `style.custom.json`).
   `VARIANT_RE` allows `custom` and `enhance`, which `layerFile` maps to the base layers. `story.style.variant: "custom"` would double-apply, and `--variant enhance` overwrites accepted proposals.
   Fix: reject `custom`/`enhance` in `loadLayers` and `studio.schema`.

8. **Slug and variant arguments are not validated on every entry point**. PLAUSIBLE.
   `style-analyze.mjs:27-30`, `style-draft`, `style-set` and others pass `slug` straight to `join()`. `style-analyze ../../x` runs `rmSync(<that>/frames)` and writes `metrics.json` in any directory containing a `source.*` file. apply/compare are safe because `styleErrors` requires `style.slug === slug`, and a kebab-case slug cannot contain `/`.
   Fix: one `assertSlug(slug)` (the `^[a-z0-9][a-z0-9-]*$` rule) inside `styleDir()`.

9. **Third-party material outside the ignore list; URL stored verbatim**. PLAUSIBLE.
   - `style-refs/.gitignore` hides only `*/source.*` and `*/frames/` (`lib/style-refs.mjs:14`). `subs.vtt` (third-party transcript), `metrics.json` (`speech.hook_text`), and `review/style-<slug>-frames.jpg|-cuts.jpg|-compare.jpg` (reference stills) can be committed. Add `*/subs.vtt` and consider `review/style-*`.
   - `style-fetch.mjs:77` stores the user's URL as typed, including `user:pass@` and signed query tokens. It then flows into `style.reference.url`, `STYLE.md`, and the shared per-user preset cache (`presetEntry` source.url). Strip userinfo and query before storing.

10. **Motion measured as "static" when `scdet` is missing** (`lib/style-metrics.mjs:13,76-87`). PLAUSIBLE.
    `mafd` defaults to 0 per frame, so a build without `scdet` yields `motion.class: static`, `mean: 0` and one shot. The draft labels motion ease/stagger "measured". The `unavailable_filters` list is printed but never lowers provenance.
    Fix: when `scdet` is in `unavailable_filters`, emit `mafd: NaN`/class null and mark the motion/stagger/ease fields `guessed`.

11. **style-enhance numbering and caption rule** (`style-enhance.mjs:20-26`, `lib/style-enhance.mjs:~150`). PLAUSIBLE.
    - `--accept 1` then `--accept 2` in a row: the list shrinks after the first accept, so "2" picks a different rule or errors. Print the rule ids and accept by id as well.
    - `captionSafeZone` can propose `max_chars` below the schema minimum of 10 when `size` is above about 150. `acceptProposals` then refuses the whole batch ("Refused, nothing written"). Clamp to >= 10.

12. **`__proto__` keys in layer JSON** (`lib/style-layers.mjs:78-84` `mergeInto`). PLAUSIBLE, theoretical.
    A hand-edited or imported `style.custom.json` with `"__proto__": {...}` under a section is merged into `Object.prototype`, because `isObj(target["__proto__"])` is true. Skip `__proto__`, `constructor` and `prototype` keys in `mergeInto` and `setPath`.

13. **Fetch staging dir** (`style-fetch.mjs:63`). PLAUSIBLE.
    `.fetch-<pid>` is under `style-refs/` and counted by `listStyleSlugs` (dot-dirs are not skipped). A killed run leaves footage there. It is gitignored but never cleaned. Skip dot-dirs in `listStyleSlugs` and clean stale `.fetch-*` at the start of `fetchStyleSource`.

14. **stageBrand behaviour change** (`lib/stage-brand.mjs:15-23`). PLAUSIBLE.
    `ensureRuntime` can now call `vendorGsap/vendorHowler` (network) for a not-yet-prepared project. compare-presets used to just fail the snapshot. Harmless, but note that `--offline` only controls fonts there.

## Checked, no defect found
- Consent gate: `services.download !== true` stops before the yt-dlp lookup (`style-fetch.mjs:57`). Args are an array with `--` before the URL; only http(s) is accepted.
- Cleanup: `style-fetch` only removes inside its own `.fetch-<pid>` dir. `style-apply` removes only `source.*` and `frames` in the validated `style-refs/<slug>`. `style-compare` and `style-enhance` remove only their `.one-studio/*` staging dirs.
- Editor: no `innerHTML`, `fetch` or `http` in the templates. The data blob is `<`-escaped, the title is HTML-escaped, and `shellWord` quotes the generated command correctly.
- Changed shared code: the build-audio `apad=whole_dur` + `-t` fix and the studio.schema, status, validate and check-external changes behave. compare-presets keeps the same staging semantics. No regression found.
- Missing audio, zero cuts, empty palette, missing subs and missing info.json were run through fetch, analyze and draft on synthetic clips (black, one-shot, letterboxed). All produced valid cards with `guessed` flags. `extractPalette([])` and `assignColorRoles([])` degrade cleanly.

## Test gaps
- merge with integer fields (finding 1; the current even-count test uses a float).
- double apply / version stability (2); letterboxed palette (3).
- `loadPresets` with a cache file that clashes with a plugin name (4).
- yt-dlp/ffmpeg timeout; `%` in the project path; user-config isolation (5, 6).
- reserved variant names; slug traversal on analyze/draft/set (7, 8).
- `.gitignore` coverage of `subs.vtt`; URL with userinfo (9).
- analyze with `scdet` absent (10).
- `--accept` twice in a row; large caption size (11).
- stub-yt-dlp failure mid-run leaves no `.fetch-*` dir.

## Unresolved questions
- Should `review/style-*.jpg` (reference stills) be treated as shareable? SKILL.md says they stay in `review/`, but nothing ignores them.
- Should apply with an unchanged brand still bump the version when only `hints.json` changes? Currently it always does.

Status: DONE
Summary: no blocking defects; three Medium behaviours confirmed by reproduction (merge integer fields, non-idempotent apply version bump, letterbox palette pollution), plus unbounded external-process time, a preset-cache clash failure mode and several hardening items.
Findings: Critical 0, High 0, Medium 5, Low 9 (14 total)
