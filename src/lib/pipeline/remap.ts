/**
 * Automatic remapping between two editions of the source text (e.g. UGNT ⇄ Textus Receptus,
 * UHB ⇄ WLC).
 *
 *  alignTokens   word-to-word alignment of the two token streams of a book. It works on the
 *                whole book, not verse by verse, so text variants and versification differences
 *                (1 Jn 2:13/14, Hebrew chapter-boundary shifts) are handled the same way.
 *  MapFile       the stored result (content/maps/<from>__<to>/<BOOK>.json): an `auto` table
 *                regenerated when either token file changes, plus hand-made `overrides`.
 *  remapAligned  rewrites a \zaln-aligned USFM file so that its milestones point at the other
 *                edition's tokens (x-content, x-occurrence, x-strong, x-lemma, x-morph, x-ref).
 *                Source words with no counterpart lose their milestone; the translation's words
 *                stay and become unaligned when their group loses every source word.
 */
import type { Issue, SourceWord } from './types';
import { bareForm, findSourceToken, normForm, occurrenceOf, stripPunct } from './match';
import { normStrong } from './strong';

export type MatchHow = 'exact' | 'spelling' | 'lexical' | 'none' | 'override';

export interface MapFile {
  version: 1;
  from: string;
  to: string;
  book: string;
  fromHash: string;
  toHash: string;
  generatedAt: string;
  stats: { exact: number; spelling: number; lexical: number; unmatchedFrom: number; unmatchedTo: number };
  /** [from "c:v#i", to "c:v#i" | null, how] for every token of the `from` edition */
  auto: [string, string | null, MatchHow][];
  /** hand corrections: from "c:v#i" → to "c:v#i", or null to unlink. Never rewritten by tools. */
  overrides: Record<string, string | null>;
}

interface Tok {
  key: string;      // "c:v#i"
  ref: string;      // "c:v"
  w: SourceWord;
  exact: string;
  bare: string;
  lex: string;      // lemma (normalised)
  st: string;
}

function stream(tokens: Map<string, SourceWord[]>): Tok[] {
  const refs = [...tokens.keys()].sort((a, b) => {
    const [ac, av] = a.split(':').map(Number), [bc, bv] = b.split(':').map(Number);
    return ac - bc || av - bv;
  });
  const out: Tok[] = [];
  for (const ref of refs) {
    for (const w of tokens.get(ref)!) {
      out.push({
        key: `${ref}#${w.i}`, ref, w,
        exact: normForm(w.w), bare: bareForm(w.w),
        lex: normForm((w.lm || '').split(/[,=]/)[0]), st: normStrong(w.st)
      });
    }
  }
  return out;
}

const SCORE = { exact: 8, spelling: 6, lexical: 3 };

function how(a: Tok, b: Tok): Exclude<MatchHow, 'none' | 'override'> | null {
  if (a.exact && a.exact === b.exact) return 'exact';
  if (a.bare && a.bare === b.bare) return 'spelling';
  if ((a.lex && a.lex === b.lex) || (a.st && a.st === b.st)) return 'lexical';
  return null;
}

/** Weighted LCS over a[aLo,aHi) × b[bLo,bHi). Small ranges only. */
function dp(a: Tok[], b: Tok[], aLo: number, aHi: number, bLo: number, bHi: number, out: Map<number, number>) {
  const n = aHi - aLo, m = bHi - bLo;
  if (!n || !m) return;
  const W = m + 1;
  const S = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const h = how(a[aLo + i], b[bLo + j]);
      const diag = h ? S[(i + 1) * W + j + 1] + SCORE[h] : -1;
      S[i * W + j] = Math.max(diag, S[(i + 1) * W + j], S[i * W + j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < n && j < m) {
    const h = how(a[aLo + i], b[bLo + j]);
    if (h && S[i * W + j] === S[(i + 1) * W + j + 1] + SCORE[h]) {
      out.set(aLo + i, bLo + j);
      i++; j++;
    } else if (S[i * W + j] === S[(i + 1) * W + j]) i++;
    else j++;
  }
}

/** Longest increasing subsequence of pairs [ai, bi] (already sorted by ai), by bi. */
function lis(pairs: [number, number][]): [number, number][] {
  const tails: number[] = [], prev: number[] = new Array(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < pairs[k][1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[k] = tails[lo - 1];
    tails[lo] = k;
  }
  const res: [number, number][] = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) res.push(pairs[k]);
  return res.reverse();
}

const DP_LIMIT = 600_000;

function solve(a: Tok[], b: Tok[], aLo: number, aHi: number, bLo: number, bHi: number, out: Map<number, number>) {
  // common prefix / suffix
  while (aLo < aHi && bLo < bHi && a[aLo].exact === b[bLo].exact) out.set(aLo++, bLo++);
  while (aLo < aHi && bLo < bHi && a[aHi - 1].exact === b[bHi - 1].exact) out.set(--aHi, --bHi);
  if (aLo >= aHi || bLo >= bHi) return;
  if ((aHi - aLo) * (bHi - bLo) <= DP_LIMIT) return dp(a, b, aLo, aHi, bLo, bHi, out);
  // patience anchors: forms unique in both ranges
  const count = (xs: Tok[], lo: number, hi: number) => {
    const c = new Map<string, number[]>();
    for (let k = lo; k < hi; k++) {
      const l = c.get(xs[k].exact);
      if (l) l.push(k);
      else c.set(xs[k].exact, [k]);
    }
    return c;
  };
  const ca = count(a, aLo, aHi), cb = count(b, bLo, bHi);
  const pairs: [number, number][] = [];
  for (const [k, ia] of ca) {
    const ib = cb.get(k);
    if (ia.length === 1 && ib?.length === 1) pairs.push([ia[0], ib[0]]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const anchors = lis(pairs);
  if (!anchors.length) {
    // no anchor: cut both ranges proportionally into DP-sized pieces
    const pieces = Math.ceil(Math.sqrt(((aHi - aLo) * (bHi - bLo)) / DP_LIMIT));
    for (let p = 0; p < pieces; p++) {
      const a0 = aLo + Math.floor(((aHi - aLo) * p) / pieces), a1 = aLo + Math.floor(((aHi - aLo) * (p + 1)) / pieces);
      const b0 = bLo + Math.floor(((bHi - bLo) * p) / pieces), b1 = bLo + Math.floor(((bHi - bLo) * (p + 1)) / pieces);
      dp(a, b, a0, a1, b0, b1, out);
    }
    return;
  }
  let pa = aLo, pb = bLo;
  for (const [ia, ib] of anchors) {
    solve(a, b, pa, ia, pb, ib, out);
    out.set(ia, ib);
    pa = ia + 1;
    pb = ib + 1;
  }
  solve(a, b, pa, aHi, pb, bHi, out);
}

export function alignTokens(from: Map<string, SourceWord[]>, to: Map<string, SourceWord[]>): Omit<MapFile, 'fromHash' | 'toHash' | 'from' | 'to' | 'book' | 'generatedAt' | 'overrides' | 'version'> {
  const a = stream(from), b = stream(to);
  const pairs = new Map<number, number>();
  solve(a, b, 0, a.length, 0, b.length, pairs);
  const stats = { exact: 0, spelling: 0, lexical: 0, unmatchedFrom: 0, unmatchedTo: 0 };
  const auto: MapFile['auto'] = a.map((t, k) => {
    const j = pairs.get(k);
    if (j === undefined) {
      stats.unmatchedFrom++;
      return [t.key, null, 'none'];
    }
    const h = how(t, b[j])!;
    stats[h]++;
    return [t.key, b[j].key, h];
  });
  stats.unmatchedTo = b.length - pairs.size;
  return { stats, auto };
}

export function buildMapFile(
  fromId: string, toId: string, book: string,
  from: Map<string, SourceWord[]>, to: Map<string, SourceWord[]>,
  fromHash: string, toHash: string, previous?: MapFile | null
): MapFile {
  const { stats, auto } = alignTokens(from, to);
  return {
    version: 1, from: fromId, to: toId, book, fromHash, toHash,
    generatedAt: new Date().toISOString(), stats, auto,
    overrides: previous?.overrides ?? {}
  };
}

/** from-key → to-key lookup with overrides applied. */
export function mapLookup(map: Pick<MapFile, 'auto' | 'overrides'>): (fromKey: string) => { to: string | null; how: MatchHow } {
  const auto = new Map(map.auto.map(([f, t, h]) => [f, { to: t, how: h }]));
  return (k) => {
    if (Object.prototype.hasOwnProperty.call(map.overrides ?? {}, k)) return { to: map.overrides[k], how: 'override' };
    return auto.get(k) ?? { to: null, how: 'none' };
  };
}

/** A map file as stored: one `auto` row per line so diffs and hand review stay readable. */
export function formatMapFile(map: MapFile): string {
  const { auto, overrides, ...head } = map;
  return [
    '{',
    ...Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    `  "overrides": ${JSON.stringify(overrides ?? {}, null, 2).replace(/\n/g, '\n  ')},`,
    '  "auto": [',
    auto.map((r) => `    ${JSON.stringify(r)}`).join(',\n'),
    '  ]',
    '}',
    ''
  ].join('\n');
}

export function isMapCurrent(map: MapFile | null | undefined, fromHash: string, toHash: string): map is MapFile {
  return !!map && map.version === 1 && map.fromHash === fromHash && map.toHash === toHash;
}

// --------------------------------------------------------------------------- USFM rewrite

export interface RemapStats {
  milestones: number;
  kept: number;
  dropped: number;
  duplicates: number;
  notFound: number;
  crossVerse: number;
  changedForm: number;
}

export interface RemapResult {
  text: string;
  issues: Issue[];
  stats: RemapStats;
}

const MS = /\\zaln-s\s*\|([^\\]*?)\\\*|\\zaln-e\\\*|\\v\s+(\d+)[^\s\\]*|\\c\s+(\d+)/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const REF = /(?:([1-3]?[A-Za-z]{2,5})\.?\s+)?(\d+):(\d+)/;

const esc = (s: string) => s.replace(/"/g, '');

/**
 * Rewrite every \zaln-s of `usfm` from `from` tokens to `to` tokens.
 *  - `lookup` maps a from-token key to a to-token key (identity when from === to).
 *  - With `strict`, a milestone whose source word cannot be found is an error (primary build);
 *    otherwise a warning.
 * A source word aligned in several groups (translationCore allows it) is mapped the same way
 * each time; buildBook is then run with `sharedSources`.
 */
export function remapAligned(
  usfm: string,
  book: string,
  from: Map<string, SourceWord[]>,
  to: Map<string, SourceWord[]>,
  lookup: (fromKey: string) => { to: string | null; how: MatchHow },
  opts: { strict?: boolean; file?: string; label?: string } = {}
): RemapResult {
  const text = usfm.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const issues: Issue[] = [];
  const stats: RemapStats = { milestones: 0, kept: 0, dropped: 0, duplicates: 0, notFound: 0, crossVerse: 0, changedForm: 0 };
  const toTok = (key: string): [string, SourceWord] | null => {
    const [ref, i] = key.split('#');
    const t = to.get(ref)?.find((x) => x.i === +i);
    return t ? [ref, t] : null;
  };
  const usedFrom = new Set<string>();
  const usedTo = new Map<string, string>(); // to-key → the from-key that claimed it
  const dropsByVerse = new Map<string, string[]>();
  const noteDrop = (ref: string, w: string) => {
    const l = dropsByVerse.get(ref) ?? [];
    l.push(w);
    dropsByVerse.set(ref, l);
  };
  const keep: boolean[] = [];
  let chapter = 0, verse = 0;
  let out = '';
  let pos = 0;
  for (let m = MS.exec(text); m; m = MS.exec(text)) {
    out += text.slice(pos, m.index);
    pos = MS.lastIndex;
    const s = m[0];
    if (m[3]) { chapter = +m[3]; out += s; continue; }
    if (m[2]) { verse = +m[2]; out += s; continue; }
    if (s.startsWith('\\zaln-e')) {
      if (keep.pop() !== false) out += s;
      continue;
    }
    stats.milestones++;
    const a: Record<string, string> = {};
    for (const am of m[1].matchAll(ATTR)) a[am[1]] = am[2];
    const here = `${chapter}:${verse}`;
    let sref = here;
    if (a['x-ref']) {
      const r = REF.exec(a['x-ref']);
      if (r) sref = `${+r[2]}:${+r[3]}`;
    }
    const occ = parseInt(a['x-occurrence'] ?? '1', 10) || 1;
    const found = findSourceToken(from.get(sref), a['x-content'], a['x-strong'], occ);
    const label = a['x-content'] ?? a['x-strong'] ?? '?';
    if (!found) {
      stats.notFound++;
      stats.dropped++;
      keep.push(false);
      issues.push({
        level: opts.strict ? 'error' : 'warning', code: 'zaln.source-not-found', ref: here, file: opts.file,
        message: `Verse ${here}: source word “${label}” (occurrence ${occ}) not found in ${opts.label ?? 'the source'} verse ${sref}`
      });
      continue;
    }
    const fromKey = `${sref}#${found.tok.i}`;
    // translationCore may align one source word in several groups; it keeps its mapping
    if (usedFrom.has(fromKey)) stats.duplicates++;
    usedFrom.add(fromKey);
    const target = lookup(fromKey);
    const hit = target.to ? toTok(target.to) : null;
    const owner = target.to ? usedTo.get(target.to) : undefined;
    if (!hit || (owner !== undefined && owner !== fromKey)) {
      stats.dropped++;
      keep.push(false);
      noteDrop(here, label);
      continue;
    }
    usedTo.set(target.to!, fromKey);
    const [tref, t] = hit;
    const [k, n] = occurrenceOf(to.get(tref)!, t);
    const parts = [
      `x-strong="${esc(t.ds ?? t.st)}"`,
      t.lm ? `x-lemma="${esc(t.lm)}"` : '',
      t.mo ? `x-morph="${esc(t.mo)}"` : '',
      `x-occurrence="${k}"`, `x-occurrences="${n}"`,
      `x-content="${esc(stripPunct(t.w))}"`
    ];
    if (tref !== here) {
      parts.push(`x-ref="${book} ${tref}"`);
      stats.crossVerse++;
    }
    if (a['x-discontiguous']) parts.push(`x-discontiguous="${a['x-discontiguous']}"`);
    if (normForm(t.w) !== normForm(found.tok.w)) stats.changedForm++;
    out += `\\zaln-s |${parts.filter(Boolean).join(' ')}\\*`;
    keep.push(true);
    stats.kept++;
  }
  out += text.slice(pos);
  for (const [ref, ws] of dropsByVerse) {
    issues.push({
      level: 'info', code: 'remap.dropped', ref,
      message: `Verse ${ref}: ${ws.join(', ')} — no counterpart in ${opts.label ?? 'the other edition'}; left unaligned`
    });
  }
  return { text: out, issues, stats };
}

/** Identity lookup: every token maps to itself (used to normalise a primary uW file). */
export const identity = (k: string) => ({ to: k, how: 'exact' as MatchHow });
