# Data formats

## Inputs (`content/`)

### `content/catalog.json`

```jsonc
{
  "translations": [{
    "id": "ta-irv",                     // folder name under content/translations/
    "name": "Indian Revised Version (IRV) Tamil",
    "shortName": "IRV Tamil",           // used in headers
    "nameNative": "…",
    "language": "ta",                   // BCP-47; drives labels such as "Tamil order"
    "dir": "ltr",
    "licence": "CC BY-SA 4.0", "attribution": "…", "url": "…",
    "sources": { "NT": "grc-tr", "OT": "hbo-wlc" }   // which source text each testament is aligned to
  }],
  "sources": [{
    "id": "grc-tr", "name": "Textus Receptus (Scrivener 1894)", "shortName": "Textus Receptus 1894",
    "language": "grc",                  // grc | hbo | arc
    "dir": "ltr",                       // rtl for Hebrew: source rows and source order read right to left
    "licence": "CC BY 4.0", "attribution": "…", "url": "…"
  }]
}
```

### Source tokens — `content/sources/<source>/<BOOK>.json`

Verse key → list of tokens in source order (STEPBible TAGNT / TAHOT export shape). Keys may be
`Phm.1.1`, `PHM 1:1`, `PHM.1.1` or `1:1`.

```jsonc
{
  "Phm.1.1": [
    {
      "inst": "01",              // position in the verse; \zaln x-ref / \zsem x-src refer to it (falls back to list position)
      "word": "Παῦλος",          // surface form; \zaln x-content + x-occurrence are matched against it
      "translit": "Paulos",
      "gloss": "Paul",           // contextual English gloss — the English row of the interlinear
      "strong": "G3972G",        // disambiguated Strong's; normalised to G3972 for matching and display
      "morph": "N-NSM-P",        // Robinson (Greek) / OSHB (Hebrew)
      "lemma": "Παῦλος",
      "lemma_gloss": "Paul",
      "editions": "NA28+…+TR+Byz",   // optional
      "tr_only": false,              // optional
      "differs_from_na": false       // optional
    }
  ]
}
```

### Aligned USFM (`\zaln`) and semantic USFM (`\zsem`)

See [USFM_SCHEMA.md](USFM_SCHEMA.md) (the alignment pilot's format description). The reader
supports, in addition to what that document lists: multiple chapters, verse ranges (`\v 2-3`),
poetry and paragraph markers (`\q1`, `\m`, `\pi` …), character styles (`\nd`, `\wj`, `\add` …,
displayed as plain words), section headings (`\s#`, `\ms`, `\d`), footnotes and cross references,
and milestones it does not know (ignored).

### Book metadata — `content/translations/<translation>/<BOOK>.meta.json` (optional)

```json
{
  "passages": { "GREETING": { "en": "Greeting", "ta": "வாழ்த்துரை" } },
  "unitLabels": { "U1.1": "Paul (sender)" }
}
```

`passages` labels the semantic layer's passage scopes (`x-scope`). Without a semantic layer a
book is divided into chapters.

## Outputs (`public/data/`, generated — not committed)

```
public/data/catalog.json                       translations, sources, and the list of built books
public/data/<translation>/<BOOK>/book.json     book metadata: names, chapters, passages, stats, Strong's concordance
public/data/<translation>/<BOOK>/<c>.json      one chapter: verses (translation words + source words) and semantic units
```

Type definitions: [`src/lib/pipeline/types.ts`](../src/lib/pipeline/types.ts). Key shapes:

* **Verse** `{ c, v, h?: headings[], t: plain text, w: TargetWord[], s: SourceWord[], n?: notes[] }`
* **TargetWord** `{ w, pre?, post?, src: ["c:v#i"], st: Strong's[], mo: morph[], grp?, unit?, sup?: {s, r}, car?, gap?, br? }`
* **SourceWord** `{ i, w, tr, gl, lm, lg, st, ds?, mo, ed?, trOnly?, vNA?, grp?, tgt: ["c:v.n"], units? }`
* **Unit** `{ id, type, kind: s|i|nl, src: "c:v", idx[], content, real, props[], scope, s7, dim[], cov, review, note?, reason?, gloss, spans[], carriers[], flags[], finding }`

References: a verse is `"c:v"`, a translation word `"c:v.n"` (n = 1-based word index), a source
word `"c:v#i"` (i = `inst`). Cross-verse alignment is simply a reference into another verse.

Chapter-sized files keep large books cheap to open and to cache offline; the app loads the
chapters a passage needs (plus any chapter a cross-verse alignment points into), and the whole
book only for search.
