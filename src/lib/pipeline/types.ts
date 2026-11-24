/**
 * Data model shared by the content build (Node) and the in-app importer (browser).
 *
 * References inside a book are written "c:v" (chapter:verse). A target word is addressed
 * as "c:v.n" (n = 1-based word index in the verse), a source word as "c:v#i"
 * (i = the source token's position number, `inst` in STEPBible data).
 */

export type Testament = 'OT' | 'NT';

/** One source-language token as published (Greek or Hebrew). */
export interface SourceWord {
  i: number;            // position in verse (inst)
  w: string;            // surface form
  tr: string;           // transliteration
  gl: string;           // contextual English gloss (STEPBible)
  lm: string;           // lemma
  lg: string;           // lemma gloss
  st: string;           // Strong's, normalised (G3972G -> G3972)
  ds?: string;          // disambiguated Strong's if it differs (G3972G)
  mo: string;           // morphology code (Robinson / OSHB)
  ed?: string;          // editions containing the word
  trOnly?: boolean;     // TR-only reading
  vNA?: boolean;        // differs from NA28
  grp?: string;         // alignment group id
  tgt: string[];        // target words "c:v.n" in this word's group (in target order)
  units?: string[];     // semantic units this word belongs to
}

export type SupportState =
  | 'GRAMMATICALLY_REQUIRED'
  | 'EXPLICITATION_SUPPORTED'
  | 'CONTEXT_SUPPORTED'
  | 'SOURCE_SUPPORTED'
  | 'POSSIBLY_UNSUPPORTED'
  | string;

/** One target-language (translation) word as published. */
export interface TargetWord {
  w: string;            // word as printed
  pre?: string;         // punctuation/space-less text printed before the word (opening quotes)
  post?: string;        // punctuation printed after the word
  src: string[];        // source words "c:v#i" (alignment group members)
  st: string[];         // Strong's carried by this word
  mo: string[];         // morphology carried by this word
  grp?: string;         // alignment group id
  unit?: string;        // semantic unit realized here
  sup?: { s: SupportState; r: string }; // word outside every unit, with its support state
  car?: string[];       // units carried implicitly by this word (zsem-i carriers)
  gap?: boolean;        // sits inside a discontiguous group's gap, unaligned
  br?: boolean;         // a paragraph break precedes this word
}

export interface VerseNote {
  k: 'f' | 'x';         // footnote / cross reference
  t: string;
}

export interface Verse {
  c: number;
  v: number;
  h?: string[];         // section headings before the verse
  t: string;            // plain target text
  w: TargetWord[];
  s: SourceWord[];
  n?: VerseNote[];
}

export type UnitKind = 's' | 'i' | 'nl';

export interface Unit {
  id: string;
  type: string;
  kind: UnitKind;               // s = realized span, i = implicit, nl = not located
  src: string;                  // source verse "c:v"
  idx: number[];                // source token positions
  content: string;              // source text
  st: string[];
  real: string;
  props: string[];
  scope: string;
  s7: string;
  dim: string[];
  vsNA28?: string;
  variant?: string;
  cov: string;
  review: string;
  note?: string;
  reason?: string;
  gloss: string;                // English gloss assembled from the source tokens (STEPBible)
  spans: { ref: string; words: number[]; text: string }[];
  carriers: { ref: string; n: number; text: string }[];
  flags: string[];
  finding: boolean;
}

export interface Chapter {
  c: number;
  verses: Verse[];
  units: Unit[];                // units whose source verse is in this chapter
}

export interface Passage {
  id: string;                   // scope name (e.g. GREETING) or "c3"
  start: string;                // "c:v"
  end: string;                  // "c:v"
  label?: { en?: string; ta?: string; [lang: string]: string | undefined };
}

export interface BookStats {
  verses: number;
  sourceWords: number;
  targetWords: number;
  groups: number;
  sourceUnaligned: number;
  targetUnaligned: number;
  crossVerseGroups: number;
  units: number;
  unitsByKind: Record<string, number>;
  unitsByS7: Record<string, number>;
  unitsByCov: Record<string, number>;
  unitsByType: Record<string, number>;
  supportStates: Record<string, number>;
  findings: number;
  crossVerseUnits: number;
  variants: number;
}

export interface BookMeta {
  id: string;                   // USFM book code, e.g. PHM
  translation: string;          // translation id, e.g. ta-irv
  source: string;               // source text id, e.g. grc-tr
  testament: Testament;
  order: number;                // canonical order 1..66
  name: { en: string; native: string; abbr?: string };
  chapters: { c: number; verses: number }[];
  passages: Passage[];
  hasSemantic: boolean;
  stats: BookStats;
  /** Strong's -> occurrences in this book's target text: [ref "c:v.n", word] */
  concordance: Record<string, [string, string][]>;
  builtAt: string;
  hash: string;                 // content hash of the inputs
  local?: boolean;              // imported in this browser, not published
}

export interface TranslationInfo {
  id: string;
  name: string;
  nameNative?: string;
  language: string;             // BCP-47
  dir?: 'ltr' | 'rtl';
  licence: string;
  attribution: string;
  url?: string;
  sources: { NT?: string; OT?: string };
}

export interface SourceInfo {
  id: string;
  name: string;
  language: string;             // grc | hbo
  dir: 'ltr' | 'rtl';
  licence: string;
  attribution: string;
  url?: string;
}

export interface CatalogBook {
  id: string;
  translation: string;
  name: { en: string; native: string };
  testament: Testament;
  order: number;
  chapters: number;
  verses: number;
  hasSemantic: boolean;
  hash: string;
  findings: number;
  units: number;
}

export interface Catalog {
  version: number;
  builtAt: string;
  translations: TranslationInfo[];
  sources: SourceInfo[];
  books: CatalogBook[];
}

/** Optional per-book metadata supplied next to the USFM (`<BOOK>.meta.json`). */
export interface BookExtra {
  passages?: Record<string, { en?: string; ta?: string; [lang: string]: string | undefined }>;
  unitLabels?: Record<string, string>;
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  ref?: string;
  file?: string;
}

export interface BuildResult {
  ok: boolean;
  issues: Issue[];
  book?: BookMeta;
  chapters?: Chapter[];
}

/** Raw STEPBible-style token, as found in content/sources/<id>/<BOOK>.json. */
export interface RawSourceToken {
  ref?: string;
  inst?: string | number;
  word: string;
  translit?: string;
  gloss?: string;
  strong: string;
  morph?: string;
  lemma?: string;
  lemma_gloss?: string;
  editions?: string;
  tr_only?: boolean;
  differs_from_na?: boolean;
  [k: string]: unknown;
}

export type RawSource = Record<string, RawSourceToken[]>;
