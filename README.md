# drdiff

deltarune's decompiled game code, diffed patch-to-patch, with each update's
official changelog pinned next to the code that actually changed.

## view it

it's a static site that loads json, so it needs to be served (not opened as file://):

```
cd drdiff
python -m http.server 8777
```

then open http://127.0.0.1:8777 . pick a version step on the left.

- green `ADD` / red `DEL` / blue `MOD` tag every changed code entry; click a modified one to expand its line diff.
- the official changelog (image + OCR text) sits at the top of each step.
- era boundaries (chapter 5 landing on the release era) are marked in red and collapse the brand-new chapter to a count instead of exploding thousands of new entries.

## what's covered

14 pc builds across two eras:

- release: `1.00 1.01A 1.01B 1.01C 1.02 1.03 1.04`
- chapter 5: `0.0.240 0.0.241 0.0.242 0.0.243 0.0.244 0.0.247 0.0.250`

(`1.05` was a steam beta-branch build; `download_depot` can't fetch beta-branch
manifests, so it's absent. grab it via the steam client console and re-run to slot it in.)

## how it's made

everything is in `.claude/` (tools, findings) and `H:/drdiff_work` (builds, dumps).

1. `H:/drdiff_work/run_all.sh` - pulls each depot manifest with steamcmd, copies
   `data.win` out, decompiles to gml with `drdump` (a net10 fork of undertalemodtool),
   identifies the build by its in-game `global.versionno`.
2. `.claude/tools/identify.py` - orders builds by their real per-chapter versions.
3. `.claude/tools/build_site.py` - hash-indexes each build, diffs consecutive ones,
   writes `data/manifest.json` + `data/diffs/*.json`.
4. `.claude/tools/fetch_ocr.py` - pulls the @UNDERTALE changelog images and OCRs them.

regenerate the whole site after adding builds:

```
python .claude/tools/identify.py && python .claude/tools/build_site.py
```

## layout

- `index.html` `style.css` `app.js` - the viewer
- `data/manifest.json` - versions + per-transition summaries
- `data/diffs/<from>__<to>.json` - full line diffs (lazy-loaded)
- `data/notes.json` + `data/media/` - changelogs and their images
- `.claude/FINDINGS.md` - the full build log / gotchas

not affiliated with toby fox. code shown for study and archival.
