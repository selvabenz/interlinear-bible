# Alignment in USFM 3 — file formats

Three files, all USFM 3, all validated with BCS `usfm-grammar` (0 errors) and all reducible to the original IRV SFM by stripping the markup (verified byte-for-byte).

| File | Layer | Format |
|---|---|---|
| `08RUTIRVTam.aligned.usfm`, `58PHMIRVTam.aligned.usfm` | Word alignment (Strong's + morphology) | unfoldingWord `\zaln` milestones — what translationCore / Scribe read |
| `58PHMIRVTam.semantic.usfm` | Passage-aware semantic alignment | custom `\zsem` milestones (documented below) |
| `08RUTGSB.aligned.usfm`, `58PHMGSB.aligned.usfm` | **ESV** word alignment to the same source | unfoldingWord `\zaln` milestones on the user's ESV USFM, derived from STEPBible TTESV |

## 1. Word alignment — `\zaln` (unfoldingWord format)

```usfm
\v 1 \zaln-s |x-strong="G5547" x-lemma="Χριστός" x-morph="N-GSM-T" x-occurrence="1" x-occurrences="1" x-content="Χριστοῦ"\*\w கிறிஸ்து|x-occurrence="1" x-occurrences="1"\w*\zaln-e\*
\zaln-s |x-strong="G1198" x-lemma="δέσμιος" x-morph="N-NSM" x-occurrence="1" x-occurrences="1" x-content="δέσμιος"\*\w சிறைச்சாலையில்|x-occurrence="1" x-occurrences="1"\w* \w கட்டப்பட்டவனாக|x-occurrence="1" x-occurrences="1"\w*\zaln-e\*
\w இருக்கிற|x-occurrence="1" x-occurrences="2"\w*
```

- One `\zaln-s … \zaln-e\*` pair per **source** word. A group of *n* source words opens *n* milestones, then the Tamil words, then *n* closes (many-to-many groups are one composite group, never duplicated).
- **One word is used only once**: every source word is in exactly one group; every Tamil word in at most one. A Tamil word outside any group (இருக்கிற above) is an unaligned `\w`.
- `x-occurrence` / `x-occurrences` count identical surface forms within the verse, as tC requires.
- **Cross-verse**: the milestone sits in the *target* verse and adds `x-ref="PHM 1:5"` naming the source verse. tC itself assumes same-verse; readers that ignore `x-` attributes they don't know will still parse the file, but will treat those source words as belonging to the Tamil verse they sit in. 58 milestones in Philemon and 8 in Ruth carry `x-ref`.
- **Discontiguous target spans** (Tamil words of one group separated by another group's words): the milestones interleave, which USFM 3 permits for milestones, and each carries `x-discontiguous="true"`. 3 groups in Philemon, 15 in Ruth. tC's editor may not display these.
- Differences from unfoldingWord's own data: Strong's are plain (`G3972`, `H1121/H9023` morpheme-segmented) rather than uW's 5-digit `G39720`; morphology is Robinson (`N-NSM-P`) / OSHM (`HNcmpc/Sp3ms`) rather than uW's `Gr,N,,,,,NMS,`. Both are one-line conversions if a consumer needs uW's exact codes.
- **The app also reads translationCore/Bridge files as they are** (aligned to UGNT/UHB): `x-strong="G05750"` / `"b:H7225"`, `x-morph="Gr,N,,,,,GFS,"` / `"He,C:Vqw3ms"`. Strong's numbers are compared after normalisation (`G05750` → `G0575`, `b:H7225` → `H7225`, `G3972G` → `G3972`), and in these files one source word may be aligned in more than one group (translationCore allows it when the translation repeats a word). Each such book is published against UGNT/UHB as aligned and remapped automatically to TR/WLC — see [CONTENT_GUIDE.md](CONTENT_GUIDE.md).

## 2. Semantic alignment — `\zsem` (custom, USFM 3 `\z` namespace)

```usfm
\zsem-s |x-unit="U16.6" x-type="RELATION" x-src="PHM 1:16#09-10" x-content="μάλιστα ἐμοί," x-strong="G3122,G1473"
        x-real="LEXICALLY_REALIZED" x-props="" x-scope="APPEAL" x-s7="UNDERTRANSLATED" x-dim="SPECIFICITY"
        x-cov="COVERED" x-review="AI_PROPOSED" x-note="ἐμοί 'to me' located; μάλιστα 'especially' has no realization."\*
\w எனக்குப்|strong="G1473" x-morph="P-1DS"\w*\zsem-e\*
```

| Marker | Meaning |
|---|---|
| `\zsem-s … \zsem-e\*` | wraps the Tamil realization of one semantic unit. A unit realized in two places (SPLIT) has two pairs with the same `x-unit` and `x-span="1/2"`, `x-span="2/2"`. |
| `\zsem-i \|…\*` | standalone: unit realized **implicitly** (δέ, γάρ carried by clause order) or **only by morphology** — placed at the end of its source verse; the carrying word has `x-carrier="U1.3"` on its `\w`. |
| `\zsem-nl \|…\*` | standalone: unit **not located** after searching the stated passage; carries `x-cov` (POSSIBLY_MISSING / NOT_REQUIRED) and `x-reason`. Placed at the end of the source verse. |
| `\w …\|x-support="…" x-reason="…"\w*` | a Tamil word outside every unit, with its Stage 8 support state (GRAMMATICALLY_REQUIRED, EXPLICITATION_SUPPORTED, CONTEXT_SUPPORTED, SOURCE_SUPPORTED, POSSIBLY_UNSUPPORTED). |

Attributes on `\zsem-s` / `-i` / `-nl`:

| Attribute | Values |
|---|---|
| `x-unit`, `x-type` | unit id; PARTICIPANT · EVENT · RELATION · CONCEPT · ATTRIBUTE · REFERENT · DISCOURSE · POLARITY · QUANTITY · TEMPORAL · MODALITY · META |
| `x-src`, `x-content`, `x-strong` | source verse + token positions, Greek text, Strong's |
| `x-real` | Stage 6B realization: LEXICALLY_REALIZED · GRAMMATICALLY_REALIZED · PRONOMINALIZED · IMPLICIT |
| `x-props` | CROSS_VERSE · REORDERED · SPLIT · MERGED · DISCONTIGUOUS (space-separated) |
| `x-scope` | passage searched: GREETING 1:1–3 · THANKSGIVING 1:4–7 · APPEAL 1:8–22 · CLOSING 1:23–25 |
| `x-s7`, `x-dim` | Stage 7 meaning status and dimension(s): PRESERVED · PRESERVED_WITH_RESTRUCTURING · PARTIAL · MEANING_SHIFT · UNDERTRANSLATED … / POLARITY · QUANTITY · LEXICAL_CONTENT · SPECIFICITY · REFERENT · PARTICIPANT · TEMPORAL_ASPECTUAL · MODALITY · RELATION |
| `x-vsna28` | Stage 7 status if judged against NA28 instead of TR (present only where the two differ) |
| `x-variant` | `TR-differs-NA28` when the source word is a TR≠NA28 reading |
| `x-cov` | COVERED · COVERED_BY_RESTRUCTURING · POSSIBLY_MISSING · NOT_REQUIRED |
| `x-review` | AI_PROPOSED (nothing here is human-approved yet) |
| `x-note`, `x-reason` | free text for the reviewer |

The `\w` words inside a `\zsem` span also carry `strong=` / `x-morph=` from the word-alignment layer, so one file holds both the lexical evidence and the semantic judgment.

## Constraints discovered while validating

- `usfm-grammar` reads `=` inside a quoted attribute value as the start of a new attribute, so values never contain `=` (STEPBible's compound morph `PRT-N + G2089=ADV` is written with `:`).
- A `\rem` line must not contain a literal `\w` — the parser opens a word.
- Attribute names should be letters/hyphens only.

## Regenerating

`pipeline/gen_usfm_aligned.py` builds all three files from `align_*.txt` (word layer) and `semantic_PHM.json` (semantic layer) and checks the round-trip. Both validators upstream of it enforce the one-word-one-group rule, so a violation can never reach the USFM.

## 3. The ESV leg

The ESV is added as an **English reference**, not as a third alignment target. Its word links come from STEPBible's **TTESV** (Tyndale House, CC BY-NC — non-commercial use), which tags each ESV word position with Strong's numbers. Those are matched to our Hebrew/Greek tokens verse by verse (pronoun Strong's normalised: TTESV's KJV-style 2257/4675/1700… → STEPBible's consolidated 3165/4771/1473).

Where it appears:

- `x-esv="…"` on every `\zaln-s` in the Tamil `*.aligned.usfm` files — the ESV rendering of that source word.
- `x-esv="…"` on every `\zsem-s` / `-i` / `-nl` in the semantic file — the ESV rendering of the whole semantic unit.
- `esv` columns in `words.csv`, `source_words.csv`, `additions_omissions.csv`, `semantic_units_PHM.csv`; `esvGloss` per unit and `esvText` per verse in `semantic_PHM.json`; `esv` on each `topWords` entry in `alignment_*.json`.
- `*GSB.aligned.usfm`: the ESV text itself with `\zaln` groups to the source — one source word per group, each ESV word in at most one group (TTESV groups that shared a token were merged). Hyphenated words and possessive `’s`, which TTESV counts as separate positions, are emitted as one `\w` when they belong to one group. Words inside `\nd …\nd*` are emitted as `\+w` with the milestones hoisted outside the span.

Coverage: TTESV links 289 of 348 TR words in Philemon and 974 of 1,294 Hebrew words in Ruth (untagged are mostly articles, particles, object markers and TR-only words absent from the ESV's base text). 14 TTESV tags found no matching source token (KJV/ESV base-text differences) and are listed under `unmatched` in `pipeline/esv_links.json`.

Copyright: the ESV text is Crossway's and stays in your files; the artifact showing it is private to you.
