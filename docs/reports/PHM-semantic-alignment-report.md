# Philemon — Passage-Aware Semantic Alignment (worked example)

IRV Tamil ↔ Textus Receptus (Scrivener 1894). Built on top of the word alignment in `../alignment_PHM.json`, which remains the lexical evidence layer. Everything here is **machine-proposed** (`reviewState: AI_PROPOSED`); nothing is a confirmed error until a reviewer says so.

## Why this layer exists

The word-alignment pilot reported for Philemon: **24 source words omitted, 53 Tamil words added**. Those numbers are true and useless. They count γάρ and δέ as omissions and நான் as an addition. The semantic layer asks the questions the master prompt asks — *where did each meaning go, how is it realized, is it preserved, is the target content supported?* — and gets a different answer from the same data:

| | Word alignment | Semantic alignment |
|---|---|---|
| Unit of account | 348 Greek tokens / 316 Tamil tokens | **168 semantic units** (participants, events, relations, discourse functions, polarity, quantity, referents, temporal, modality) |
| Source side | 24 omitted | **5 POSSIBLY_MISSING** (1 of them a base-text difference), 1 NOT_REQUIRED (colophon), 162 covered |
| Target side | 53 added | **0 unsupported**. 22 grammatically required, 11 explicitation-supported, 6 context-supported, 1 source-supported (via NA28) |
| Meaning judgment | none | **9 findings**: 5 MEANING_SHIFT, 1 UNDERTRANSLATED, 1 PARTIAL — plus 4 of the shifts vanish when judged against NA28 |
| Cross-verse | flagged per word | 32 units realized in a different verse; 11 reordered, 5 split, 3 merged, 5 discontiguous |

## Passage scopes used

Every relationship records the scope that was searched before any NOT_LOCATED verdict:

| Scope | Range | Why |
|---|---|---|
| GREETING | 1:1–1:3 | epistolary opening |
| THANKSGIVING | 1:4–1:7 | one sentence in Greek; IRV swaps v4/v5 |
| APPEAL | 1:8–1:22 | the body; IRV swaps v8/v9 and moves the v15/v16 boundary |
| CLOSING | 1:23–1:25 | greetings + benediction; IRV moves the greeting verb to v24 |

## Stage 6B — where the meaning went (passage map)

```
SOURCE (TR)          TARGET (IRV Tamil)
PHM 1:1  ─────────▶  1:1
PHM 1:2  ─────────▶  1:2          (1 unit not located: TR "beloved")
PHM 1:3  ─────────▶  1:3
PHM 1:4  ─────────▶  1:5          ◀ swapped
PHM 1:5  ─────────▶  1:4          ◀ swapped
PHM 1:6  ─────────▶  1:6
PHM 1:7  ─────────▶  1:7
PHM 1:8  ─┬───────▶  1:8          Διό only
          └───────▶  1:9          rest of verse     (1 unit not located: πολλήν)
PHM 1:9  ─┬───────▶  1:9          διὰ τὴν ἀγάπην μᾶλλον παρακαλῶ
          └───────▶  1:8          τοιοῦτος ὢν … Ἰησοῦ
PHM 1:10–14 ──────▶  same verse
PHM 1:15 ─────────▶  1:15         (2 units not located: τάχα, διὰ τοῦτο)
PHM 1:16 ─┬───────▶  1:15         οὐκέτι … ἀδελφὸν ἀγαπητόν
          └───────▶  1:16         μάλιστα … ἐν κυρίῳ  (re-cast as a conditional)
PHM 1:17–22 ──────▶  same verse   (1:22: ἅμα not located)
PHM 1:23 ─┬───────▶  1:23         Epaphras
          └───────▶  1:24         Ἀσπάζονταί σε → verb-final after the name list
PHM 1:24 ─────────▶  1:24
PHM 1:25 ─────────▶  1:25         (subscription NOT_REQUIRED)
```

Realization of the 168 units: 128 lexical · 21 grammatical (Tamil suffixes -உம், -ஆல், -க்காக realizing καί, ὅτι/γάρ, ἵνα) · 5 pronominalized · 8 implicit (δέ, γάρ, ἀλλά carried by clause order) · 6 not located.

## Stage 7 — is the meaning preserved?

Of 162 located units: **136 PRESERVED, 17 PRESERVED_WITH_RESTRUCTURING**, and these nine:

### Textual, not translational (judged against TR = shift; against NA28 = preserved)

| Ref | Unit | TR | IRV Tamil | NA28 |
|---|---|---|---|---|
| 1:6 | U6.6 REFERENT | ἐν ὑμῖν "in you" | நமக்குள் "in us" | ἐν ἡμῖν ✓ |
| 1:7 | U7.1 LEXICAL | χάριν "thanks" | சந்தோஷம் "joy" | χαράν ✓ |
| 1:7 | U7.4 PARTICIPANT | ἔχομεν "we have" | அடைந்திருக்கிறேன் "I have" | ἔσχον ✓ |
| 1:20 | U20.6 LEXICAL | ἐν κυρίῳ | கிறிஸ்துவிற்குள் "in Christ" | ἐν Χριστῷ ✓ |

Add the not-located TR ἀγαπητῇ (1:2) whose slot is filled by NA28's ἀδελφῇ "sister", and IRV Philemon follows the critical text in **five** places against TR in four (Ἰησοῦν 1:6, προσλαβοῦ 1:12, ἡμῶν and ἀμήν 1:25). A base-text decision is needed before any of these can be called a translation issue.

### Translational — candidates for reviewer attention

| Ref | Unit | Dimension | Status | What happened |
|---|---|---|---|---|
| 1:6 | U6.4 ἐν ἐπιγνώσει | RELATION | MEANING_SHIFT | "in/by the knowledge of every good thing" → தெரியப்படுகிறதினாலே "because [the good] is being made known". The knower changes: Greek has Philemon acknowledging the good; Tamil has the good becoming known. |
| 1:10 | U10.3 ὃν ἐγέννησα | LEXICAL_CONTENT | PARTIAL | The *event* "whom I begot [in my chains]" is merged into the *state* மகனாகிய "who is my son". IRV adds விசுவாசத்தில் "in faith" to keep the spiritual sense (footnoted). |
| 1:16 | U16.6 μάλιστα ἐμοί | SPECIFICITY | UNDERTRANSLATED | "to me" is located (எனக்குப்); "especially" is not. The verse's rhetorical build (especially to me → how much more to you) loses its first step. **LOCATED ≠ PRESERVED.** |
| 1:21 | U21.1 ὑπακοή | LEXICAL_CONTENT | MEANING_SHIFT | "confident of your *obedience*" → சம்மதிப்பீர் "you will *agree/consent*". Compliance-to-authority softened to agreement. |
| 1:22 | U22.7 χαρισθήσομαι | LEXICAL_CONTENT, PARTICIPANT | MEANING_SHIFT | "I will be *graciously given* to you" (divine passive; grace vocabulary) → அனுப்பப்படுவேன் "I will be *sent*" (release by authorities). |

Restructurings judged acceptable (PRESERVED_WITH_RESTRUCTURING) include the two verse swaps, the v15/16 conditional recast, the metaphor→simile in 1:12 (போல்), passive→active in 1:15, conditional→comparative in 1:17, and the moved greeting verb in 1:23/24.

## Stage 8 — coverage and support

### Source → target: POSSIBLY_MISSING (never auto-promoted to MISSING)

| Ref | Unit | Scope searched | Reason |
|---|---|---|---|
| 1:2 | ἀγαπητῇ "beloved" | GREETING | slot filled by NA28 reading "sister" — textual |
| 1:8 | πολλήν "much [boldness]" | APPEAL 1:8–1:9 | துணிவுள்ளவனாக has no degree word — QUANTITY |
| 1:15 | τάχα "perhaps" | APPEAL 1:15–1:16 | no hedge anywhere in the sentence — MODALITY; Paul's tentativeness about providence is lost |
| 1:15 | διὰ τοῦτο "for this reason" | APPEAL 1:15–1:16 | anaphoric causal link not realized; the ἵνα purpose is — RELATION |
| 1:22 | ἅμα "at the same time" | APPEAL 1:21–1:22 | மேலும் covers δὲ καί only — TEMPORAL, low weight |

The 8 TR-only subscription words are `NOT_REQUIRED`, not missing.

### Target → source: every Tamil token outside a relationship

| State | n | Examples |
|---|---|---|
| GRAMMATICALLY_REQUIRED | 22 | subject pronouns நான்/நீர்/அவன்; copulas இருக்கிற/வேண்டும்; quotative என்று |
| EXPLICITATION_SUPPORTED | 11 | சுவிசேஷ "gospel" (1:1), கூடிவருகிற "gathering" (1:2), விசுவாசத்தில் "in faith" (1:10), இந்தக் கடிதத்தை "this letter" (1:21) |
| CONTEXT_SUPPORTED | 6 | வேண்டுதல் செய்கிறேன் "I pray" (1:6 — licensed by 1:4 προσευχῶν, outside the verse); உம்மிடம் "to you" (1:12 — from ἀνα- "back"); பிரியமுள்ளவனாக (1:16 — from ἀγαπητόν earlier in the verse) |
| SOURCE_SUPPORTED | 1 | சகோதரி "sister" (1:2) — supported by NA28, not TR |
| POSSIBLY_UNSUPPORTED / UNSUPPORTED | **0** | |

Passage awareness matters concretely at 1:6: a verse-local check would flag "I pray" as unsupported; the prayer is in 1:4.

## Invariants enforced by the compiler

- Every Greek token belongs to exactly one semantic unit.
- Every Tamil token belongs to at most one relationship (the user's rule: *one word is used only once*). Where a Tamil word carries both a lexical meaning and a suffix that realizes another unit (தீமோத்தேயும் = Timothy + καί), the suffix unit is `GRAMMATICALLY_REALIZED` with a non-owning **carrier** pointer to that token.
- Every unit is either located or has an explicit NOT_LOCATED record with the scope searched.
- Every Tamil token is either in a relationship or has an explicit support state.
- Source and target references are stored as independent arrays; `CROSS_VERSE` is derived, never assumed.

## Files

| File | Contents |
|---|---|
| `semantic_PHM.json` | Full data model per spec §5K: units, relationships (6B/7/8 states, properties, scope, carrier tokens, notes, review state), target support, statistics, passage map |
| `semantic_units_PHM.csv/.tsv` | One row per semantic unit — Excel-ready |
| `target_support_PHM.csv/.tsv` | One row per Tamil token outside any relationship |
| `../pipeline/semantic_phm_data.py` | The hand-authored inventory and judgments |
| `../pipeline/compile_semantic.py` | Validator + generator |

## What this shows for scaling

Building the semantic layer for 25 verses on top of an existing word alignment took a fraction of the word-alignment effort, and the word alignment is what made it checkable. The scaled pipeline should therefore be: automatic word alignment as evidence → LLM builds semantic units and 6B relationships per **passage** (not per verse) → LLM Stage 7 per relationship → compiler enforces the invariants → reviewer sees only the findings (here: 5 coverage + 9 preservation out of 168 units, i.e. ~8 % of units need a human glance).
