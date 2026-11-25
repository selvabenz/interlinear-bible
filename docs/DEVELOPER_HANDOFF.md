# Developer hand-off — Interlinear Bible PWA

**Repository:** https://github.com/selvabenz/interlinear-bible
**Live site:** https://selvabenz.github.io/interlinear-bible/
**Project board:** https://github.com/users/selvabenz/projects/5
**Status (2026-11-25):** app, content pipeline, importer, PWA and CI/CD complete. Two books
published (Philemon, 1 John), each in two source texts. Word lists for all 66 books are bundled,
so any book can be imported from its aligned USFM alone and published from the browser as a pull
request. Remaining books wait for alignment data from Bridge.

---

## 1. What this is

A static, offline-capable web app for studying the Bible word by word:

* **Reverse interlinear** — the IRV Tamil text in its own order, each word stacked over the
  Greek (or Hebrew) it renders, with transliteration, English gloss, Strong's and morphology.
* **Interlinear** — the same alignment in the original's word order, Tamil beneath.
* **Two source texts per book** — Textus Receptus 1894 / Leningrad Codex (STEPBible) and
  unfoldingWord UGNT / UHB. The reader switches between them. The text a book was aligned
  against shows the alignment as made; the other is remapped automatically, word by word.
* **Study layer** — where a semantic alignment exists (`\zsem`), study marks for meaning
  shifts, possibly missing content, cross-verse renderings and text-critical differences.

It started from a hand-over of: two design pages (reading, study) built for Philemon, the
alignment pilot's Philemon USFM (word + semantic + ESV), STEPBible Greek tokens, and the
pilot's `build.py`. The brief was to build the whole app **for any book**, deploy it, and make
it possible to add or update Bible and alignment data whenever it becomes available. Alignment
data now comes from **Bridge** (https://github.com/Bridgeconn/bridge): books aligned in
translationCore against UGNT (NT) / UHB (OT), delivered as `<book>-aligned.usfm`.

## 2. Architecture

```
STEPBible TAGNT/TAHOT ─┐
translationCore UGNT/UHB┴─(npm run sources)─▶ content/library/  (word lists, all 66 books × 2 texts)
                                               content/sources/  (curated overrides: Philemon TR)
content/translations/<tr>/*.usfm ──┐                       │
content/maps/  ◀─(npm run maps)────┴─ src/lib/pipeline/ ◀──┘
        │                                │ same code in Node and in a Web Worker
        ▼                                ▼
scripts/build-content.ts ──▶ public/data/<tr>/<BOOK>/<source>/…, data/library/… ──▶ app (SW-cached)

Import screen ─▶ import.worker.ts (pipeline) ─▶ local preview (IndexedDB)
                                            └─▶ Publish: GitHub pull request ─▶ merge ─▶ deploy
```

| Layer | Files | Notes |
|---|---|---|
| Pipeline | `src/lib/pipeline/{usfm,reader,build,classify,books,types}.ts` | TypeScript port of `build.py` (tokenizer, `read_zaln`, `read_zsem`, join, findings), generalised to whole books. Runs in Node (content build) and in a Web Worker (importer). Returns an issue list instead of asserting. |
| Source texts | `src/lib/pipeline/{strong,match,remap,editions,sources,tokens}.ts` | `strong` normalises every Strong's spelling (`G05750`, `G3972G`, `b:H7225`, `H9001/{H1961}` → `G0575`/`H7225`…). `match` finds a token for a `\zaln-s`. `remap` aligns two editions' token streams for a whole book (patience anchors + weighted LCS) and rewrites `\zaln` milestones (with `x-ref` across verses). `editions` builds the primary edition (as aligned) and the derived ones. `tokens` is the compact `ib-tokens-1` word-list format. |
| Word-list generation | `scripts/sources/{generate,stepbible,uw,survey}.ts` | `npm run sources -- --all`: TR/WLC from STEPBible, UGNT/UHB from translationCore's resource folder (newest version), glosses/transliteration/morphology matched from STEPBible. `survey` is a dry run over the whole Bible. |
| Content build | `scripts/build-content.ts`, `build-maps.ts`, `content-index.ts` | Classifies files by content (book from `\id`), detects the alignment's source, builds every edition, writes `public/data/catalog.json` + `<tr>/<BOOK>/<source>/{book,<c>}.json`, copies the library to `data/library/`. `--check` validates; `--strict` (CI) also fails on stale/missing maps. |
| Data access | `src/lib/data/{loader,local}.ts` | `LoadedBook` caches chapters per edition; `editionsOf`/`pickEdition` choose the edition (route `?src=`, reader preference, default). Local (IndexedDB) books override published ones in that browser. |
| Import / publish | `src/lib/data/{importer,github}.ts`, `src/lib/import.worker.ts`, `src/routes/Import.svelte` | Missing word lists come from the published edition, else the bundled library. Publish = Git data API (blobs → tree → commit → branch → pull request), keeping hand `overrides` of the repository's maps. |
| View model | `src/lib/data/model.ts` | Pure functions: stacks for either order, study-mark lines, word detail, occurrences, passage map, search. |
| Morphology | `src/lib/morph.ts` | Robinson (Greek) and OSHB (Hebrew) decoders; uW codes converted (`uwGreekToRobinson`, `uwHebrewToOshb`). |
| UI | `src/routes/*.svelte`, `src/lib/components/*.svelte` | Svelte 5 (runes). Every page: `AppBar` (menu + title + search, slides away on scroll down below 900 px and sets `--bar-offset` for sticky headings) and `AppMenu`. All overlays use `Sheet` (modal `<dialog>` in the top layer: drawer, bottom sheet on phones; closes on its button, Escape, backdrop, route change). Preferences: `SettingsPanel` (App / Reading / Study; in the menu and on `#/settings`). `SearchBox` + `data/find.ts`: words, book names and references. `Reader.svelte` renders Reading and Study views; sections with sticky headings; study tools beside the text ≥ 1200 px, else in a sheet. Theme tokens in `app.css` (`data-theme` light/dark/sepia, set before first paint in `index.html`). |
| State | `src/lib/stores/*.svelte.ts` | Preferences (incl. preferred source per testament, GitHub repo/token) and flags in localStorage; router on `location.hash`. |
| PWA | `vite.config.ts` (vite-plugin-pwa), `UpdatePrompt.svelte` | Shell precached (~68 KB gzip JS + 13 KB import worker); `data/` runtime-cached (catalog network-first, books and library stale-while-revalidate, fetched on demand). |
| CI/CD | `.github/workflows/ci.yml`, `deploy.yml` | PR: strict content check, unit, type check, build, Playwright. `main`: strict content check, unit, build with `BASE_PATH=/interlinear-bible/`, deploy to Pages. |

Data shapes: [DATA_FORMAT.md](DATA_FORMAT.md). Content workflow: [CONTENT_GUIDE.md](CONTENT_GUIDE.md).
Alignment format: [USFM_SCHEMA.md](USFM_SCHEMA.md).

## 3. Decisions and why

| Decision | Why |
|---|---|
| **Nothing book-specific in code or names.** Book, chapters, passages, languages, direction come from data. | The owner asked for a system for the whole Bible, with Philemon as only the first book. |
| **Svelte 5 + Vite + TypeScript**, no backend | Owner's choice; static hosting on GitHub Pages; small bundles. |
| **Pipeline in TypeScript, shared by build and importer** | One parser: a book that passes the importer passes CI. Parity tests pin it to `build.py`'s output. |
| **Chapter-sized JSON per edition** (`data/<tr>/<BOOK>/<source>/`) | Large books stay cheap to open and cache; passages load only the chapters they need. |
| **Both source texts published; the reader chooses** (Reader switch, Settings default, `?src=`). Catalog order sets the default: NT `grc-tr` then `grc-ugnt`, OT `hbo-wlc` then `hbo-uhb`. | Owner's choice: Bridge aligns to UGNT/UHB, the existing pilot (and IRV's base text) follows the TR. |
| **Bridge/translationCore files used as they are**; their source (UGNT/UHB) is detected from uW markers (`G05750`, `Gr,…` morph), overridable with `alignedTo` in `<BOOK>.meta.json` | No conversion step for maintainers; the "as aligned" edition is exactly what the translator made. |
| **Automatic remap through stored token maps** (`content/maps/<from>__<to>/<BOOK>.json`, `auto` + hand `overrides`) | Owner asked for automatic remapping "stored in a database"; on a static site that is versioned files: reviewable in PRs, regenerated only when a word list changes, hand corrections never overwritten. |
| **Book-wide token alignment**, not verse by verse | Handles text variants (TR-only 1 Jn 5:7) and versification differences (2 Cor 13:12–13, Rev 12:18/13:1, Hebrew chapter boundaries) the same way; cross-verse links become `x-ref`. |
| **A source word may be in several groups** for translationCore files (`sharedSources`) | translationCore allows aligning one Greek word in several places; dropping repeats would lose ~150 links in 1 John. For other files it stays an error. |
| **Derived editions omit the semantic layer** (study marks) and keep the primary's passages | The semantic judgements were made against the primary text. |
| **Word lists for all 66 books bundled** (`content/library/`, compact format, ~65 MB / 16 MB compressed; fetched one book at a time) | Owner: readers import only the aligned USFM. CI has no access to STEPBible/translationCore folders, so the lists are committed. |
| **Philemon's TR list stays curated** (`content/sources/grc-tr/PHM.json`, the pilot's); generator never overwrites existing files without `--force` | Parity tests are built on it; the regenerated list differs in 22 small (better) fields. |
| **Publishing from the browser = a GitHub pull request**, by maintainers with a fine-grained token (this repository only; Contents + Pull requests read/write), stored only in that browser | Owner's choice: imported books must reach every device, with a review step; no server to run. CI validates the PR, merging deploys. |
| **ESV not published.** `x-esv` stripped from `content/`; English verse via api.esv.org with a reader-supplied key. English word row uses STEPBible glosses (CC BY). | ESV text © Crossway. |
| **Hash routing** | Deep links work on GitHub Pages without 404 rewrites. |
| **Flags stay on the device** (export/import JSON), per Tamil verse, shared by both editions | No backend; flags are about the translation. Sync is backlog #25. |
| **Passages:** semantic `x-scope` ranges made contiguous; labels from `<BOOK>.meta.json`; otherwise one passage per chapter | Matches the design's passage tabs where data exists. |
| **TypeScript pinned to 6.x** | `svelte-check` 4.7 does not accept TypeScript 7 yet. |
| **robots.txt disallows indexing** | Semantic data is AI-proposed and unreviewed. Remove when the owner wants the site indexed. |

## 4. How to work on it

```bash
npm ci
npm run dev              # content build + dev server (http://localhost:5173)
npm test                 # 62 unit tests (on Windows start from D:\…, not d:\… — see §6)
npm run check            # svelte-check, 0 errors / 0 warnings expected
npm run content:check -- --strict   # what CI runs
npm run build            # dist/
npx playwright install chromium && npm run test:e2e   # browser tests, desktop + phone

# content
npm run maps             # token maps for books in content/translations (after adding a USFM)
npm run sources -- --all --force --stepbible <STEPBible-Data> --tc <translationCore/resources>
                         # regenerate the bundled word lists (only when a source text changes)
npm run sources:survey -- --stepbible <dir> --tc <dir>   # dry run: match rates per book
npm run icons            # re-render PNG icons after changing public/favicon.svg
```

Base path: local builds use `/`; Pages builds set `BASE_PATH=/interlinear-bible/`.
Data folders used so far (owner's machine): STEPBible at `D:\Claude Lab\STEPBible-Data-master`,
translationCore resources at `D:\Claude Lab\translationCore\resources` (or set `STEPBIBLE_DIR` /
`TC_RESOURCES`).

**Adding a Bridge book:** in the app (Import data → USFM only → Publish (pull request) → merge),
or in the repository (copy the USFM to `content/translations/ta-irv/`, `npm run maps`, PR).

## 5. Verification done

| Check | Result |
|---|---|
| Content build (strict) | 4 editions, 0 errors / 0 warnings. Philemon TR (primary): 25 verses · 348 Greek / 316 Tamil words · 222 groups · 168 units · 14 findings — identical to `build.py`. Philemon UGNT: 322 of 324 links kept. 1 John UGNT (primary, Bridge): 105 verses, 1,805 links. 1 John TR: 1,776 kept, 29 without a counterpart. |
| Unit tests (Vitest) | 62 passed: build.py and design-data parity, validation, tokenizer, classification, Strong's normalisation, uW → Robinson/OSHB, OSHB decoder, 1 John and Philemon editions, stored/stale maps and overrides, Hebrew UHB→WLC (real Ruth tokens, synthetic alignment, ≥99 % kept), every bundled word list readable, compact format round-trip |
| Whole-Bible survey | All 66 books generate both word lists and a map: OT 99.3–100 % of words matched, NT ~96.7–99 % (the rest are real text differences) |
| Type check | 0 errors, 0 warnings |
| Browser tests (Playwright, production build) | 17 passed, 3 skipped (file-import tests run on desktop only): library, reading detail, layers, both orders, Tamil UI, study rail/marks, search, flags, import → local preview, offline reload, 1 John TR⇄UGNT switch (5:7 TR-only words, preference remembered), USFM-only import of an unpublished book, publish to a mocked GitHub API (files, kept overrides, PR) |
| Deployment | Deploy workflow green after every push; live site serves the catalog (4 editions), chapters per edition and `data/library/` for all books |
| Real data | James (`jas-aligned.usfm` from Bridge) builds with only the bundled lists: UGNT 0 errors; TR 1,110 links kept, 10 without a counterpart. Owner confirmed importing works on the live site. |

**Not verified:** publishing against the real GitHub API (only mocked — the first real publish
is its first live run); the ESV API layer against the real API (no key yet; if CORS blocks it,
the fix is a tiny proxy); a real Bridge **Old Testament** file (Hebrew remap tested with real
UHB/WLC tokens but a synthetic alignment); iOS Safari install/offline (Chromium only); the new
Tamil interface strings (written by the developer, need a native speaker's review).

## 6. Known gaps and notes

| # | Gap |
|---|---|
| #18 | Remaining NT books — tooling complete; each needs only Bridge's aligned USFM |
| #19 | OT/Hebrew with real data — tooling done (UHB/WLC lists, OSHB decoder, remap); verify with the first aligned OT book |
| #20 | Converter STEPBible TAGNT/TAHOT → word lists — **done** (`npm run sources`); the issue can be closed |
| #21 | Full Strong's lexicon entries (today: lemma, lemma gloss, decoded morphology) |
| #22 | Whole-Bible search (today: per book) |
| #23 | Licensed English word-level links |
| #24 | Unit labels / reviewer notes from the pilot's `semantic_<BOOK>.json` |
| #25 | Sharing reviewer flags across devices / export to Paratext notes |

Open questions and notes:
* **Psalm titles:** TAHOT gives them as verse 0; the translationCore UHB has no title words. When
  Psalms is aligned, decide how titles appear (and check how the app shows a verse 0).
* **Republishing a book** from the importer writes `<BOOK>.aligned.usfm`; a book stored under
  another file name would end up with two aligned files (CI flags it).
* **Readers with the old app cached** load data from new paths only after accepting the update
  prompt (data moved to per-edition folders on 2026-11-24).
* **vitest on Windows** finds no tests when started from a lower-case drive path (`d:\…`).
* GitHub warns that actions/checkout@v4, setup-node@v4, upload-artifact@v4, deploy-pages@v4 run
  on deprecated Node 20; bump to their next majors when convenient.
* Smaller: the "under the cursor" bar and box appear only with a mouse (no hover on touch).

## 7. Activity log

| Date | Activity |
|---|---|
| 2026-11-24 | Reviewed the hand-over: design pages (reading, study), `phm-data.js` design data, the old single-page site (`philemon-interlinear/`, which contains the ESV), aligned/semantic/ESV USFM, `USFM_SCHEMA.md`, `build.py`, STEPBible TR tokens. |
| 2026-11-24 | Agreed with the owner: new public repo, Svelte + Vite + TS, repo pipeline + in-app import, ESV only through the owner's/readers' API key; app must be generic, not Philemon-specific. |
| 2026-11-24 | Created repo `selvabenz/interlinear-bible`, 9 labels, 5 milestones (M1 Foundation, M2 Reader, M3 Content system, M4 PWA & release, Backlog), 25 issues, project board #5 linked to the repo. Renamed Philemon-named issues/files to generic names after the owner's note. |
| 2026-11-24 | Scaffolded the project (#1). Ported and generalised the USFM tokenizer and readers (#2), join + validation (#3) with parity tests; content folder, build script, Philemon seeded with 435 `x-esv` attributes stripped (#4). |
| 2026-11-24 | Built app shell (#5), library (#6), reading/study views and both orders (#7–#9), search/flags (#10), importer (#11), settings + ESV provider (#12), PWA (#14), CI/deploy (#15), Playwright tests (#16), docs (#13). |
| 2026-11-24 | Bugs found by the browser tests and fixed: Svelte state proxies could not be posted to the import worker (now `$state.snapshot`); phone layers menu off-screen; phone header too tall. |
| 2026-11-24 | Pushed 13 commits to `main`; issues #1–#17 closed by their commits. Enabled GitHub Pages (Actions source). Deploy workflow passed; live site verified. |
| 2026-11-24 | Owner supplied Bridge's `1jn-aligned.usfm` (translationCore, aligned to UGNT) and asked for both source texts with the reader choosing, automatic UGNT⇄TR / UHB⇄WLC remapping stored in the repo, and Hebrew covered now. Built source-text editions: word-list generation, Strong's/morphology normalisation, remap engine and maps, per-edition data, Reader switch, Settings preference, importer for all editions. Published 1 John (UGNT + TR) and a UGNT edition of Philemon. Found: the Bridge file aligns ~150 Greek words in more than one place — kept as shared source words. |
| 2026-11-24 | Whole-Bible survey (`npm run sources:survey`): all 66 books generate and map. Found and fixed: TAGNT rows with alternative references in `[]`/`{}` were skipped (lost TR verses such as Jhn 7:53, Rom 16:25–27); 1 John TR regenerated (1,776 links kept). |
| 2026-11-24 | Owner: readers import only the aligned USFM; the app must bundle the word lists of all 66 books. Added `content/library/` (132 compact files), published as `data/library/`; `content/sources/` became an override. Importer keeps same-named files apart. Deployed; owner confirmed importing James works. |
| 2026-11-25 | Owner: imported books must reach every device; maintainers publish with a GitHub token, through a pull request. Added `src/lib/data/github.ts`, Settings → Publishing (repo + fine-grained token, Check), importer “Publish (pull request)”; E2E test mocks the GitHub API. Deployed. |
| 2026-11-25 | Owner: fresher, less cluttered UI with more reading space, responsive in every mode; one icon menu; all settings under Settings (App / Reading / Study); only menu and search on the home page; sticky section headings; fix text overflow (Greek order) and the Layers menu that could not be closed. Root cause of the latter: on phones the fixed "sheet" sat inside the header's `backdrop-filter` containing block, covering the button, with no other way to close. Replaced headers with `AppBar` + `AppMenu` + `Sheet`, added themes (Auto/Light/Dark/Sepia), home search for books/references and words in downloaded books, wrapping word rows, bundled Hebrew font. New E2E tests: menu closing, no overflow at 320–1360 px in both views/orders/languages, sticky heading, theme, home search. |

## 8. Where to start next

1. **First real publish:** create the fine-grained token (Settings → Publishing explains the
   permissions), publish one Bridge book (James is ready), merge the PR, and check the book on
   another device. Fix anything the real GitHub API does differently from the mock.
2. Close issue #20 and update #18/#19 on the board to reflect the new workflow.
3. Have a Tamil speaker review the new interface strings (source text, publishing, import).
4. When the first Old Testament book arrives from Bridge, import it and check the Hebrew view
   (right to left, OSHB morphology, WLC remap); settle the Psalm-titles question before Psalms.
5. Enter an ESV API key in Settings and check that the English verse appears.
6. After each new book, glance at its map stats in `content/maps/…/<BOOK>.json` and add
   `overrides` where an automatic link is wrong.
