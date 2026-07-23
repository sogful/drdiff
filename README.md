# drdiff

deltarune's decompiled game code, diffed patch-to-patch, with each update's
official changelog re-typeset beside the code that changed.

## view it

static site that loads json, so serve it (don't open as file://):

```
cd drdiff
python -m http.server 8791
```

open http://127.0.0.1:8791 .

- **top bar**: pick a version. two markers show where chapters 3 & 4 released and where chapter 5 released.
- **chapter bar**: the chapters touched by that version, with change counts. a brand-new chapter shows `+N new`.
- **left sidebar**: dense list of every changed code entry (`ADD`/`DEL`/`MOD` + line counts). click one to see it.
- **main**: the gml diff, syntax-highlighted (custom tokenizer, vs code dark+ theme, jetbrains mono).
- **changelog** (bottom-left): swaps the diff for that version's official patch notes, recreated in verdana.

## coverage

14 pc builds, 13 steps, two eras:

- release: `1.00 1.01A 1.01B 1.01C 1.02 1.03 1.04`
- chapter 5: `0.0.240 0.0.241 0.0.242 0.0.243 0.0.244 0.0.247 0.0.250`

(`1.05` is a steam beta-branch build; `download_depot` can't fetch beta-branch manifests. grab it
via the steam client console and re-run to slot it in.)

when chapter 5 debuts (`1.04 -> 0.0.240`) its ~11.8k new entries are collapsed to a count rather
than exploded, so the boundary step shows the real changes to the existing chapters + launcher.

## layout

```
index.html
favicon.png
assets/
  fonts/    deltarune (8-bit operator) + jetbrains mono
  images/   changelogs/ (source patch-note images), doodles/ (trimmed toby art), chapters/
  static/   manifest.json, doodles.json, diffs/*.diff, changelogs/*.md, steamchangelogs/*.md
  svgs/
src/
  css/style.css
  js/app.js      viewer
  js/gml.js      gml syntax highlighter (prism has no gml grammar)
.claude/
  tools/    the whole pipeline (see below)
  builds_identified.json, notes.json, changelogs.json   tool data, not served
  FINDINGS.md
```

## pipeline (.claude/tools)

- `run_all.sh` (in `H:/drdiff_work`) - steamcmd pulls each manifest, decompiles data.win -> gml with `drdump`, ids each build by `global.versionno`.
- `identify.py` - orders builds by real per-chapter versions -> `.claude/builds_identified.json`.
- `buildsite.py` - hash-indexes builds, diffs consecutive ones -> `manifest.json` + `diffs/`.
- `fetchocr.py` - pulls the @UNDERTALE changelog images.
- `reocr.py` - upscales + thresholds each image and re-OCRs (much cleaner than the raw pass).
- `changelogparse.py` - structures the OCR into `.claude/changelogs.json` (title, version table, per-chapter items, platform tags).

regenerate the diffs: `python .claude/tools/identify.py && python .claude/tools/buildsite.py`
regenerate the changelogs: `python .claude/tools/reocr.py && python .claude/tools/changelogparse.py`

## notes

the changelogs are per-version markdown in `assets/static/changelogs/`, hand-editable to fix ocr.
the six ch1&2 posts are hand-drawn posters rather than patch-note lists, so those files start with
`::raw` and lay themselves out in html using the `.clraw` helpers in `style.css`.

not affiliated with toby fox. code shown for study and archival.
