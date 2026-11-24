/**
 * Compact source-token files ("ib-tokens-1") — the bundled word lists of every book in every
 * source text (content/library/<source>/<BOOK>.json, published as data/library/…).
 *
 *   {
 *     "_format": "ib-tokens-1",
 *     "_meta": { "book": "JAS", "source": "grc-ugnt", … },
 *     "_lex": [[lemma, lemma gloss], …],          // shared by all tokens of the file
 *     "_ed":  ["NA28+NA27+…+TR+Byz", …],          // editions strings, shared
 *     "v": { "1:1": [[inst, word, translit, gloss, strong, morph, lex, ed, flags], …] }
 *   }
 *
 * lex / ed are indexes into _lex / _ed (-1 = none); flags: 1 = TR-only, 2 = differs from NA28.
 * decodeTokens turns it back into the STEPBible-style shape readSource understands.
 */
import type { RawSource, RawSourceToken } from './types';

export const TOKENS_FORMAT = 'ib-tokens-1';

type Row = [number, string, string, string, string, string, number, number, number];

export interface CompactTokens {
  _format: typeof TOKENS_FORMAT;
  _meta: Record<string, unknown> & { book: string; source: string };
  _lex: [string, string][];
  _ed: string[];
  v: Record<string, Row[]>;
}

export function isCompactTokens(j: unknown): j is CompactTokens {
  return !!j && typeof j === 'object' && (j as { _format?: unknown })._format === TOKENS_FORMAT;
}

/** Tokens keyed by any verse key ("Jas.1.1", "JAS 1:1") → compact file with "c:v" keys. */
export function encodeTokens(raw: Record<string, RawSourceToken[]>, meta: CompactTokens['_meta']): CompactTokens {
  const lex: [string, string][] = [], lexIdx = new Map<string, number>();
  const eds: string[] = [], edIdx = new Map<string, number>();
  const intern = <T>(list: T[], idx: Map<string, number>, key: string, val: T) => {
    let k = idx.get(key);
    if (k === undefined) {
      k = list.length;
      list.push(val);
      idx.set(key, k);
    }
    return k;
  };
  const v: Record<string, Row[]> = {};
  for (const [key, toks] of Object.entries(raw)) {
    const m = /(\d+)[.:](\d+)$/.exec(key);
    if (!m || !Array.isArray(toks)) continue;
    const ref = `${+m[1]}:${+m[2]}`;
    v[ref] = toks.map((t, k): Row => {
      const lm = String(t.lemma ?? ''), lg = String(t.lemma_gloss ?? '');
      const li = lm || lg ? intern(lex, lexIdx, `${lm}\u0001${lg}`, [lm, lg] as [string, string]) : -1;
      const ed = String(t.editions ?? '');
      const ei = ed ? intern(eds, edIdx, ed, ed) : -1;
      const flags = (t.tr_only ? 1 : 0) | (t.differs_from_na ? 2 : 0);
      const inst = t.inst !== undefined && t.inst !== '' ? parseInt(String(t.inst), 10) : k + 1;
      return [inst, String(t.word ?? ''), String(t.translit ?? ''), String(t.gloss ?? ''), String(t.strong ?? ''), String(t.morph ?? ''), li, ei, flags];
    });
  }
  return { _format: TOKENS_FORMAT, _meta: meta, _lex: lex, _ed: eds, v };
}

export function decodeTokens(c: CompactTokens): RawSource {
  const out: RawSource = {};
  for (const [ref, rows] of Object.entries(c.v)) {
    out[ref] = rows.map(([inst, word, translit, gloss, strong, morph, li, ei, flags]) => {
      const t: RawSourceToken = { inst, word, translit, gloss, strong, morph };
      if (li >= 0) [t.lemma, t.lemma_gloss] = c._lex[li];
      if (ei >= 0) t.editions = c._ed[ei];
      if (flags & 1) t.tr_only = true;
      if (flags & 2) t.differs_from_na = true;
      return t;
    });
  }
  return out;
}

/** One compact file per line of verses: small, and still diffable. */
export function formatTokens(c: CompactTokens): string {
  const verses = Object.entries(c.v).map(([ref, rows]) => `  ${JSON.stringify(ref)}: ${JSON.stringify(rows)}`);
  return [
    '{',
    `"_format": ${JSON.stringify(c._format)},`,
    `"_meta": ${JSON.stringify(c._meta)},`,
    `"_lex": ${JSON.stringify(c._lex)},`,
    `"_ed": ${JSON.stringify(c._ed)},`,
    '"v": {',
    verses.join(',\n'),
    '}',
    '}',
    ''
  ].join('\n');
}
