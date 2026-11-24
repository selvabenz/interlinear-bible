# Interlinear Bible

An offline-capable web app (PWA) for reading and studying the Bible **interlinear** (in the
original's word order, translation beneath) and **reverse interlinear** (in the translation's
word order, Greek/Hebrew beneath). Every word of the IRV Tamil translation is aligned to the
Greek or Hebrew it renders, with Strong's number, morphology, transliteration, English gloss,
and — where a semantic alignment exists — study marks on meaning shifts, omissions and
cross-verse renderings.

**Live:** https://selvabenz.github.io/interlinear-bible/

The app is data-driven: it has no book-specific code. Books are added by dropping aligned
USFM and source-token files into `content/` and pushing, or previewed in the browser with the
built-in importer. Philemon is the first book with data; others follow as alignment data
becomes available.

## Features

- **Reading view** and **Study view** (tools rail with passages, passage map, study marks and
  statistics; word panel with Strong's entry, morphology, English gloss, semantic unit and
  other occurrences in the book)
- **Two word orders** — reverse interlinear (translation order) and interlinear (source order);
  Hebrew reads right to left
- **Layers** — transliteration, English gloss, Strong's, morphology, study marks, English verse
- **Search** Tamil words, Greek/Hebrew, transliteration, glosses or Strong's numbers
- **Verse flags** for reviewers, saved on the device, exportable as JSON
- **English / Tamil interface**
- **Offline** — installable; books can be saved for offline use
- **Import** — check new or updated USFM in the browser, preview it as a local book, and
  download a ready-to-commit content bundle
- **English verse (ESV)** — shown when a reader adds their own ESV API key in Settings; the ESV
  text is © Crossway and is not published with the site

## Quick start

```bash
npm ci
npm run dev          # builds public/data from content/, then http://localhost:5173
npm test             # pipeline unit tests (parity with the alignment pilot's build.py)
npm run check        # type check
npm run build        # production build in dist/
npm run test:e2e     # browser tests against the production build (npx playwright install chromium first)
```

## Adding or updating a book

See **[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md)**. In short:

```bash
cp ROM.aligned.usfm   content/translations/ta-irv/
cp ROM.semantic.usfm  content/translations/ta-irv/     # optional
cp ROM.json           content/sources/grc-tr/
npm run content:check                                   # must report 0 errors
git add content && git commit -m "content(ROM): add Romans" && git push
```

Pushing to `main` rebuilds and redeploys the site through GitHub Actions.

## Repository layout

```
content/                 what maintainers edit: catalog, source tokens, aligned/semantic USFM per translation
scripts/build-content.ts content/ → public/data/ (validation + build); scripts/make-icons.ts
src/lib/pipeline/        USFM tokenizer, alignment readers, join + validation — shared by the build and the importer
src/lib/data/            loader, local (IndexedDB) books, view model, importer
src/lib/components/      word stack, detail card, search, flag editor, update prompt
src/routes/              Library, Reader (Reading + Study views), Import, Settings
tests/unit/              pipeline tests;  tests/e2e/  Playwright tests
docs/                    content guide, data format, USFM schema, design references, developer hand-off
```

## Documentation

- [Content guide](docs/CONTENT_GUIDE.md) — adding and updating books
- [Data format](docs/DATA_FORMAT.md) — input files and generated JSON
- [USFM alignment schema](docs/USFM_SCHEMA.md) — `\zaln` and `\zsem` markers
- [Developer hand-off](docs/DEVELOPER_HANDOFF.md) — architecture, decisions, activity log, next steps
- [Design references](docs/design/) — the reading and study page designs the views follow

## Licences and attribution

- **IRV Tamil** — Bridge Connectivity Solutions, CC BY-SA 4.0
- **Greek text, Strong's, morphology, glosses, transliteration** — STEPBible TAGNT
  (Tyndale House, Cambridge), CC BY 4.0
- **Hebrew** (when added) — STEPBible TAHOT, CC BY 4.0
- **ESV** — © Crossway; not included. Fetched per reader from api.esv.org with their own key.
- **Semantic alignment** — AI-proposed, pending reviewer confirmation
- **Fonts** — Noto Serif Tamil, Gentium Book Plus, Instrument Sans, IBM Plex Mono (SIL OFL)
- **Code** — GPL-3.0 (see [LICENSE](LICENSE))
