# Content guide — adding and updating books

The app has no book-specific code. A book appears as soon as its data is in `content/` and
the site is rebuilt. There are two routes:

| Route | Who sees the result | Use it to |
|---|---|---|
| **Repository** (`content/` → push) | everyone, on the published site | publish a new or corrected book |
| **In-app Import** (Library → *Import data*) | only the browser that imported it | check files and preview them before publishing |

Both run the same pipeline (`src/lib/pipeline/`), so a book that passes the importer will pass
CI and vice versa.

---

## 1. What a book needs

For each book (USFM code from `\id`, e.g. `MAT`, `ROM`, `RUT`):

| File | Required | Where it goes | Notes |
|---|---|---|---|
| Aligned USFM | **yes** | `content/translations/<translation>/` | translation text with `\zaln-s … \zaln-e\*` word alignment (unfoldingWord / translationCore / Scribe format) |
| Source tokens | **yes** | `content/sources/<source>/<BOOK>.json` | Greek or Hebrew words with Strong's, morphology, gloss, transliteration (STEPBible TAGNT/TAHOT shape) — generated with `npm run sources -- <BOOK>` |
| Token maps | generated | `content/maps/<from>__<to>/<BOOK>.json` | word-to-word maps between the source texts — `npm run maps` (run by `npm run sources`) |
| Semantic USFM | no | `content/translations/<translation>/` | the same text with `\zsem` semantic units; adds study marks, passages, unit details |
| Metadata | no | `content/translations/<translation>/<BOOK>.meta.json` | passage labels (English/Tamil) for the semantic passage scopes |

* **File names are free.** The build reads the book code from `\id` and tells aligned from
  semantic files by their markers, so Paratext-style names (`40MATIRVTam.aligned.usfm`) work.
  `<BOOK>.aligned.usfm` / `<BOOK>.semantic.usfm` is the recommended convention.
* **Every book is published once per source text** ("edition") listed for its testament in
  `content/catalog.json` → `translations[].sources` (default first):
  NT `["grc-tr", "grc-ugnt"]` (Textus Receptus 1894 · unfoldingWord UGNT),
  OT `["hbo-wlc", "hbo-uhb"]` (Leningrad Codex · unfoldingWord UHB).
  Readers switch between them in the Reader (and choose a default in Settings).
* **The edition the file was aligned against is detected automatically**: unfoldingWord-format
  milestones (`x-strong="G05750"`, `x-morph="Gr,…"`, `x-strong="b:H7225"`) mean UGNT/UHB;
  anything else means the default (TR/WLC). Override with `"alignedTo": "<source id>"` in
  `<BOOK>.meta.json`. That edition shows the alignment exactly as made (with its semantic
  layer, if any); every other edition is **remapped automatically** through the token map.
  Source words with no counterpart in the other text (e.g. NA-only words in the TR edition)
  lose their link, and their translation words show as unaligned there.
* Formats: [DATA_FORMAT.md](DATA_FORMAT.md) and [USFM_SCHEMA.md](USFM_SCHEMA.md).

### Books from Bridge / translationCore (UGNT- or UHB-aligned)

Copy the aligned USFM as it is; no conversion is needed:

```bash
cp 1jn-aligned.usfm content/translations/ta-irv/1JN.aligned.usfm
npm run sources -- 1JN --stepbible <STEPBible-Data dir> --tc <translationCore resources dir>
npm run content:check                       # must report 0 errors
```

`npm run sources` writes the token files of both source texts (TR/WLC from STEPBible
TAGNT/TAHOT; UGNT/UHB from the newest version folder in translationCore's `resources`, with
English glosses and transliteration matched from STEPBible) and then the token maps. Set
`STEPBIBLE_DIR` / `TC_RESOURCES` instead of passing the folders each time. Existing token files
are kept unless you pass `--force` (Philemon's pilot tokens are curated).

translationCore lets a translator align one Greek/Hebrew word in several places (when the
translation repeats it); the app keeps every link (the source word lists all its translation
words).

### Token maps — the remap database

`content/maps/<from>__<to>/<BOOK>.json` holds, for every word of the edition the book was
aligned against, the word it corresponds to in the other edition (`exact`, `spelling`,
`lexical`, or `none`). `npm run maps` rewrites a map only when one of the two token files has
changed. To correct a link by hand, add it to `overrides` — it wins over `auto` and is never
touched by the tools:

```json
"overrides": { "5:10#12": "5:10#12", "2:7#4": null }
```

(`"c:v#i"` keys are a verse and the source word's position number; `null` unlinks a word.)
The build uses the stored map when it is current; otherwise it computes one and warns
`map.stale` / `map.missing` (CI runs `content:check --strict`, which makes these errors).

**Do not include ESV text or `x-esv` attributes.** The ESV is © Crossway; the site shows it only
through each reader's own ESV API key. Strip them first:

```bash
sed -i 's/ x-esv="[^"]*"//g' *.usfm
```

## 2. Publish a book through the repository

```bash
git pull
# 1. copy the files
cp 45ROMIRVTam.aligned.usfm   content/translations/ta-irv/ROM.aligned.usfm
cp 45ROMIRVTam.semantic.usfm  content/translations/ta-irv/ROM.semantic.usfm   # optional
cp src_rom_tr.json            content/sources/grc-tr/ROM.json
# 2. validate — must end with "0 error(s)"
npm run content:check
# 3. look at it locally (optional)
npm run dev
# 4. publish
git checkout -b content/rom
git add content/
git commit -m "content(ROM): add IRV Tamil Romans with word alignment"
git push -u origin content/rom     # open a pull request; CI validates and runs the browser tests
```

When the pull request is merged into `main`, the **Deploy to GitHub Pages** workflow rebuilds
the data and the app and publishes them. Readers get the new book the next time they open the
library; the app itself does not need a new release, because Bible data is fetched and cached
separately from the app shell.

### Updating a book

Replace its files in `content/` and push the same way. Readers who saved the book for offline
use get the new version in the background (stale-while-revalidate) on their next visit.

### Adding another translation

Add an entry to `content/catalog.json` → `translations` (id, names, language code, licence,
attribution, which source text it is aligned to) and create
`content/translations/<id>/`. A second translation shows a translation selector in the library.

### Adding another source text

Add an entry to `catalog.json` → `sources` (`dir: "rtl"` for Hebrew/Aramaic) and put the token
files under `content/sources/<id>/`.

## 3. Check and preview with the in-app importer

1. Open the app → **Import data**.
2. Choose the translation, then pick the files (or one `.zip` with all of them). For a book that
   is already published you can pick **only the USFM**: the importer rebuilds the source tokens
   from the published data.
3. **Check files**. Each book gets one report per source text — *as aligned*, and *remapped
   from …* for the others (with how many links carried over). A Bridge/translationCore file
   aligned to UGNT/UHB needs only the USFM when that book is published already; otherwise add
   the token files from `npm run sources`. Each report shows:
   * **errors** — the book cannot be built (unknown source word, a source word aligned twice,
     aligned and semantic files disagree, unbalanced milestones …);
   * **warnings** — built, but look at it (word matched by Strong's instead of its surface form,
     verse without source words …);
   * **info** — counts of unaligned words.
4. **Save on this device** to read it in the app. It is marked *Local preview* and overrides the
   published copy in this browser only. *Remove local copy* goes back to the published version.
5. **Download content bundle (.zip)** (on the *as aligned* report) gives the files laid out as
   `content/…` — including the token maps — ready to commit (step 2 above).

## 4. What the validation checks

| Code | Level | Meaning |
|---|---|---|
| `zaln.source-not-found` | error | a `\zaln-s` names a source word (`x-content` + `x-occurrence`, or `x-strong`) that is not in the source verse |
| `zaln.source-in-two-groups` | error | one source word is aligned in two groups (allowed, and reported as info `zaln.shared-source`, for translationCore-format files) |
| `source.missing` | error | the source text the file is aligned against has no token file for the book (`npm run sources`) |
| `map.stale` / `map.missing` | warning (error with `--strict`, in CI) | the stored token map is out of date or missing (`npm run maps`) |
| `remap.dropped` | info | per verse: source words with no counterpart in a remapped edition |
| `zaln.empty-group`, `zaln.unbalanced`, `zaln.unclosed` | error | milestone structure is broken |
| `semantic.word-count`, `semantic.word-differs`, `semantic.verse-missing` | error | aligned and semantic files do not carry the same words |
| `zsem.source-not-found`, `zsem.bad-src`, `zsem.carrier-unknown` | error | a semantic unit points to a source word or unit that does not exist |
| `zaln.matched-by-strong` | warning | the surface form did not match; the source word was found by Strong's number |
| `zaln.word-without-strong` | warning | a word inside a contiguous group has no `strong=` in the semantic file |
| `verse.missing-target` / `verse.missing-source` | warning | verse present on one side only |
| `usfm.*` | error/warning | text that cannot be read |

## 5. Quick reference

```bash
npm run content         # validate content/ and write public/data/ (also runs before dev/build)
npm run content:check   # validate only; exit code 1 on errors (CI adds --strict: stale maps fail too)
npm run sources -- ROM  # source tokens for every source text of ROM, then npm run maps
npm run maps            # refresh token maps whose token files changed (--force: all)
npm test                # pipeline unit tests, incl. parity with the pilot's build.py
                        # (on Windows run from a path with an upper-case drive letter, D:\…, or vitest finds no tests)
npm run dev             # local app at http://localhost:5173
```
