# Developer hand-off — Interlinear Bible PWA

**Repository:** https://github.com/selvabenz/interlinear-bible
**Live site:** https://selvabenz.github.io/interlinear-bible/
**Project board:** https://github.com/users/selvabenz/projects/5
**Status (2026-11-24):** v0.1.0 — app, content pipeline, importer, PWA, CI/CD complete; one
book (Philemon) published; remaining books wait for alignment data.

---

## 1. What this is

A static, offline-capable web app for studying the Bible word by word:

* **Reverse interlinear** — the IRV Tamil text in its own order, each word stacked over the
  Greek (or Hebrew) it renders, with transliteration, English gloss, Strong's and morphology.
* **Interlinear** — the same alignment in the original's word order, Tamil beneath.
* **Study layer** — where a semantic alignment exists (`\zsem`), study marks for meaning
  shifts, possibly missing content, cross-verse renderings and text-critical differences.

It started from a hand-over of: two design pages (reading, study) built for Philemon, the
alignment pilot's Philemon USFM (word + semantic + ESV), STEPBible Greek tokens, and the
pilot's `build.py`. The brief was to build the whole app **for any book**, deploy it, and make
it possible to add or update Bible and alignment data whenever it becomes available.

## 2. Architecture

```
content/  ──(scripts/build-content.ts)──▶  public/data/  ──(fetch, cached by SW)──▶  app
   ▲                    │ same code                                               │
   │                    ▼                                                         │
   └── content bundle ◀── src/lib/pipeline/ ◀── import.worker.ts ◀── Import screen ┘
```

| Layer | Files | Notes |
|---|---|---|
| Pipeline | `src/lib/pipeline/{usfm,reader,build,classify,books,types}.ts` | TypeScript port of `build.py` (tokenizer, `read_zaln`, `read_zsem`, join, findings), generalised to whole books. Runs in Node (content build) and in a Web Worker (importer). Returns an issue list instead of asserting. |
| Content build | `scripts/build-content.ts` | Scans `content/translations/<id>/*`, classifies files by content (book from `\id`), builds each book, writes `public/data/catalog.json`, `<tr>/<BOOK>/book.json`, `<tr>/<BOOK>/<c>.json`. `--check` validates only. |
| Data access | `src/lib/data/loader.ts`, `local.ts` | `LoadedBook` caches chapters, indexes verses/units; local (IndexedDB) books override published ones in that browser. |
| View model | `src/lib/data/model.ts` | Pure functions: stacks for either order, study-mark lines, word detail, occurrences, passage map, search. No Svelte — easy to test. |
| UI | `src/routes/*.svelte`, `src/lib/components/*.svelte` | Svelte 5 (runes). `Reader.svelte` renders both Reading and Study views. |
| State | `src/lib/stores/*.svelte.ts` | Preferences and flags in localStorage; router on `location.hash`. |
| PWA | `vite.config.ts` (vite-plugin-pwa), `UpdatePrompt.svelte` | Shell precached; `data/` runtime-cached (catalog network-first, books stale-while-revalidate). |
| CI/CD | `.github/workflows/ci.yml`, `deploy.yml` | PR: validate, unit, type check, build, Playwright. `main`: validate, unit, build with `BASE_PATH=/interlinear-bible/`, deploy to Pages. |

Data shapes: [DATA_FORMAT.md](DATA_FORMAT.md). Content workflow: [CONTENT_GUIDE.md](CONTENT_GUIDE.md).

## 3. Decisions and why

| Decision | Why |
|---|---|
| **Nothing book-specific in code or names.** Book, chapters, passages, languages, direction come from data; design files renamed `reading-view` / `study-view`. | The owner asked for a system for the whole Bible, with Philemon as only the first book. |
| **Svelte 5 + Vite + TypeScript**, no backend | Owner's choice (same family as the Suvadi PWA); static hosting on GitHub Pages; small bundles (≈61 KB gzip JS). |
| **Pipeline in TypeScript, shared by build and importer** | One parser: a book that passes the importer passes CI. Parity tests pin it to `build.py`'s output. |
| **Chapter-sized JSON** | Large books stay cheap to open and cache; passages load only the chapters they need (plus chapters a cross-verse alignment points into). Search loads the whole book on demand. |
| **ESV not published.** All `x-esv` attributes stripped from `content/`; the ESV USFM not copied. English verse via api.esv.org with a reader-supplied key (Settings). English word row uses STEPBible glosses (CC BY). | ESV text © Crossway; the hand-over README itself said not to redistribute it publicly. Owner chose "I will provide an API key later". |
| **Two update routes:** repo (`content/` → push → Actions) for everyone; in-app import for local preview + bundle export | Owner's choice. Publishing stays reviewed (PR + CI); previewing needs no tooling. |
| **Importer rebuilds source tokens from published data** | Updating the Tamil alignment of a published book then needs only the USFM. |
| **Hash routing** | Deep links work on GitHub Pages without 404 rewrites. |
| **Flags stay on the device** (export/import JSON) | No backend; sync is a backlog item (#25). |
| **Passages:** semantic `x-scope` ranges made contiguous; labels from `<BOOK>.meta.json`; otherwise one passage per chapter | Matches the design's passage tabs where data exists, degrades sensibly elsewhere. |
| **Unaligned source words listed under their source verse** | Same as `build.py`; the design data had filed them under the Tamil verse. Totals match. |
| **TypeScript pinned to 6.x** | `svelte-check` 4.7 does not accept TypeScript 7 yet. |
| **robots.txt disallows indexing** | Semantic data is AI-proposed and unreviewed (as in the original site). Remove when the data is reviewed and the owner wants the site indexed. |

## 4. How to work on it

```bash
npm ci
npm run dev            # content build + dev server (http://localhost:5173)
npm test               # 24 pipeline tests
npm run check          # svelte-check, 0 errors / 0 warnings expected
npm run build          # dist/
npx playwright install chromium && npm run test:e2e   # 13 browser tests (desktop + phone)
npm run icons          # re-render PNG icons after changing public/favicon.svg
```

Base path: local builds use `/`; Pages builds set `BASE_PATH=/interlinear-bible/`.

## 5. Verification done

| Check | Result |
|---|---|
| Content build (Philemon) | 25 verses · 348 Greek / 316 Tamil words · 222 groups · 168 units · 14 findings · 0 errors / 0 warnings — identical to `build.py` |
| Unit tests (Vitest) | 24 passed: build.py parity (counts, gap words, omissions, text), design-data parity (unit and support state of every word, Greek links of every word, findings), validation of broken inputs, tokenizer on poetry/headings/verse ranges, file classification, no ESV in output |
| Type check | 0 errors, 0 warnings |
| Browser tests (Playwright, production build) | 13 passed, 1 skipped (import on phone — covered on desktop): library, reading detail, layers, both orders, Tamil UI, study rail/marks, search across passages, flags after reload, import → local preview → remove, offline reload |
| Visual check | Screens compared with the design pages at 1360 px and phone width; fixed: phone layers menu (now a bottom sheet), tall phone header (now scrolls away) |
| Deployment | Deploy workflow green (validate → unit → build → Pages). Live site checked in Chromium: library, study panel, service worker at /interlinear-bible/sw.js, manifest with 3 icons, no console errors |

**Not verified:** the ESV API layer against the real API (no key available yet — enter one
in Settings and check a passage; if the browser blocks the request (CORS), the fix is a tiny
proxy, e.g. a Cloudflare Worker); Hebrew/OT with real data (only synthetic tokenizer tests);
iOS Safari install/offline (Chromium only).

## 6. Known gaps → backlog issues

| # | Gap |
|---|---|
| #18 | Remaining NT books — need aligned USFM + TR source tokens |
| #19 | OT/Hebrew with real data; OSHB morphology decoder (Hebrew codes shown raw today) |
| #20 | Converter STEPBible TAGNT/TAHOT → source-token JSON (today the tokens come from the pilot) |
| #21 | Full Strong's lexicon entries (today: lemma, lemma gloss, decoded morphology) |
| #22 | Whole-Bible search (today: per book) |
| #23 | Licensed English word-level links (design's "ESV rendering" per word is not published) |
| #24 | Unit labels / reviewer notes from the pilot's `semantic_<BOOK>.json` (the design data had them; `meta.json` already accepts `unitLabels`) |
| #25 | Sharing reviewer flags across devices / export to Paratext notes |

Smaller notes: no dark theme (the design is light only); Library "save for offline" covers
published books (local books are already in IndexedDB); the hover bar is hidden on phones.

## 7. Activity log

| Date | Activity |
|---|---|
| 2026-11-24 | Reviewed the hand-over: design pages (reading, study), `phm-data.js` design data, the old single-page site (`philemon-interlinear/`, which contains the ESV), aligned/semantic/ESV USFM, `USFM_SCHEMA.md`, `build.py`, STEPBible TR tokens. |
| 2026-11-24 | Agreed with the owner: new public repo, Svelte + Vite + TS, repo pipeline + in-app import, ESV only through the owner's/readers' API key; app must be generic, not Philemon-specific. |
| 2026-11-24 | Created repo `selvabenz/interlinear-bible`, 9 labels, 5 milestones (M1 Foundation, M2 Reader, M3 Content system, M4 PWA & release, Backlog), 25 issues, project board #5 linked to the repo. Renamed Philemon-named issues/files to generic names after the owner's note. |
| 2026-11-24 | Scaffolded the project (#1). Ported and generalised the USFM tokenizer and readers (#2), join + validation (#3) with parity tests; content folder, build script, Philemon seeded with 435 `x-esv` attributes stripped (#4). |
| 2026-11-24 | Built app shell (#5), library (#6), reading/study views and both orders (#7–#9), search/flags (#10), importer (#11), settings + ESV provider (#12), PWA (#14), CI/deploy (#15), Playwright tests (#16), docs (#13). |
| 2026-11-24 | Bugs found by the browser tests and fixed: Svelte state proxies could not be posted to the import worker (now `$state.snapshot`); phone layers menu off-screen; phone header too tall. |
| 2026-11-24 | Pushed 13 commits to `main`; issues #1–#17 closed by their commits. Enabled GitHub Pages (Actions source). Deploy workflow passed; live site verified. Board: #1–#17 Done, backlog #18–#25 Todo. |
| — | Note: GitHub warns that actions/checkout@v4, setup-node@v4, upload-artifact@v4 run on deprecated Node 20; bump to their next major versions when convenient. |

## 8. Where to start next

1. Enter an ESV API key in Settings on the live site and check that the English verse appears
   (see §5).
2. Add the next book through [CONTENT_GUIDE.md](CONTENT_GUIDE.md) (#18); open a PR so CI runs.
3. For the OT, start with Ruth (aligned in the pilot) and #19/#20.
