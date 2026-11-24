/**
 * STEPBible TAGNT (Greek NT) and TAHOT (Hebrew OT) → source-token JSON.
 *
 *   tagntAll(book)  every word of every edition TAGNT records (NA28, TR, Byz …) — used to
 *                   enrich UGNT tokens with glosses and transliteration
 *   trTokens(book)  the Textus Receptus (Scrivener 1894): TAGNT words whose editions include
 *                   TR, plus TR readings that TAGNT gives as meaning/spelling variants
 *   wlcTokens(book) the Leningrad Codex from TAHOT (Qere where TAHOT prints it; LXX-supplied
 *                   "X" rows excluded), keyed by English versification
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseBookId } from '../../src/lib/pipeline/books';

export interface RawTok {
  ref: string;
  inst: string;
  type: string;
  word: string;
  translit: string;
  gloss: string;
  strong: string;
  morph: string;
  lemma: string;
  lemma_gloss: string;
  editions?: string;
  lang: string;
  variant_source?: string;
  order_variant?: boolean;
  tr_only?: boolean;
  differs_from_na?: boolean;
  heb_ref?: string;
  [k: string]: unknown;
}
export type RawBook = Record<string, RawTok[]>;

// "Rut.1.1#01=L", with an optional alternative reference in (), [] or {}:
// "1Sa.20.42(21.1)#01=L" (Hebrew), "Php.1.16[1.17]#01=NKO", "Jhn.7.53{8.1}#01=KO". The first
// (English/KJV) reference is the one used — the IRV follows it.
const KEY = /^([1-3]?[A-Za-z]{2,4})\.(\d+)\.(\d+)(?:[([{](\d+)\.(\d+)[)\]}])?#(\d+)=(\S+)$/;

function filesIn(dir: string, prefix: string): string[] {
  const sub = join(dir, 'Translators Amalgamated OT+NT');
  return readdirSync(sub).filter((f) => f.startsWith(prefix) && f.endsWith('.txt')).map((f) => join(sub, f));
}

interface Row { book: string; abbr: string; c: number; v: number; hc?: number; hv?: number; inst: string; type: string; f: string[] }

const cache = new Map<string, Row[]>();
function rows(dir: string, prefix: 'TAGNT' | 'TAHOT', book: string): Row[] {
  const ck = `${prefix}:${book}`;
  if (cache.has(ck)) return cache.get(ck)!;
  const out: Row[] = [];
  for (const file of filesIn(dir, prefix)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const f = line.replace(/\r$/, '').split('\t');
      const m = KEY.exec(f[0]);
      if (!m || normaliseBookId(m[1]) !== book) continue;
      out.push({ book, abbr: m[1], c: +m[2], v: +m[3], hc: m[4] ? +m[4] : undefined, hv: m[5] ? +m[5] : undefined, inst: m[6], type: m[7], f });
    }
  }
  cache.set(ck, out);
  return out;
}

const split = (s: string) => {
  const i = s.indexOf(' (');
  return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 2).replace(/\)\s*$/, '').trim()];
};
const kv = (s: string): [string, string] => {
  const i = s.indexOf('=');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
};
const TR_IN = /(^|\+)TR([«»]\d+)?(\+|$)/;

/** Strong's → [lemma, lemma gloss] over every TAGNT row read so far (for meaning variants). */
function lemmaIndex(dir: string): Map<string, [string, string]> {
  const idx = new Map<string, [string, string]>();
  for (const file of filesIn(dir, 'TAGNT')) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const f = line.split('\t');
      if (!KEY.test(f[0]) || f.length < 5) continue;
      const st = kv(f[3])[0].replace(/[A-Za-z]$/, '');
      if (!idx.has(st)) idx.set(st, kv(f[4]));
    }
  }
  return idx;
}
let lemmas: Map<string, [string, string]> | null = null;

function greekTok(r: Row, extra: Partial<RawTok> = {}): RawTok {
  const [word, translit] = split(r.f[1]);
  const [strong, morph] = kv(r.f[3]);
  const [lemma, lg] = kv(r.f[4]);
  const ref = `${r.abbr}.${r.c}.${r.v}`;
  return {
    ref, inst: r.inst, type: r.type, word, translit, gloss: (r.f[2] ?? '').trim(), strong, morph, lemma, lemma_gloss: lg,
    editions: (r.f[5] ?? '').trim(), lang: 'grc', ...extra
  };
}

function push(book: RawBook, t: RawTok) {
  (book[t.ref] ??= []).push(t);
}

export function tagntAll(dir: string, book: string): RawBook {
  const out: RawBook = {};
  for (const r of rows(dir, 'TAGNT', book)) push(out, greekTok(r));
  return out;
}

export function trTokens(dir: string, book: string): RawBook {
  const out: RawBook = {};
  for (const r of rows(dir, 'TAGNT', book)) {
    const eds = (r.f[5] ?? '').trim();
    const list = eds.split('+');
    const meaning = (r.f[6] ?? '').trim(), spelling = (r.f[7] ?? '').trim();
    if (TR_IN.test(eds)) {
      const t = greekTok(r, {
        variant_source: 'main', order_variant: /TR[«»]/.test(eds),
        tr_only: !list.includes('NA28'), differs_from_na: !list.includes('NA28')
      });
      // TR spells the word differently: "TR: ἐξῆλθον ;"
      for (const part of spelling.split(';')) {
        const [e, form] = [part.slice(0, part.indexOf(':')), part.slice(part.indexOf(':') + 1)];
        if (part.includes(':') && TR_IN.test(e.trim()) && form.trim()) {
          t.word = form.trim() + t.word.replace(/^[\p{L}\p{M}᾽’']+/u, '');
          t.differs_from_na = true;
          break;
        }
      }
      push(out, t);
      continue;
    }
    // TR reading given as a meaning variant: "ἀγαπητῇ (T=agapētēa) beloved - G0027=A-DSF in: TR+Byz"
    for (const part of meaning.split(';')) {
      const m = /^\s*(\S+)\s+\((?:\w+=)?([^)]*)\)\s*(.*?)\s+-\s+(G\d+[A-Za-z]?)=(\S+)\s+in:\s*(\S+)/.exec(part);
      if (!m || !TR_IN.test(m[6])) continue;
      lemmas ??= lemmaIndex(dir);
      const [lm, lg] = lemmas.get(m[4].replace(/[A-Za-z]$/, '')) ?? ['', ''];
      push(out, {
        ref: `${r.abbr}.${r.c}.${r.v}`, inst: r.inst, type: r.type, word: m[1], translit: m[2], gloss: m[3],
        strong: m[4], morph: m[5], lemma: lm, lemma_gloss: lg, editions: eds, lang: 'grc',
        variant_source: 'meaning-variant', order_variant: /TR[«»]/.test(m[6]), tr_only: false, differs_from_na: true
      });
      break;
    }
  }
  return out;
}

/** TAHOT row → token. Morphemes are joined; the main (braced) Strong's is the token's number. */
function hebrewTok(r: Row): RawTok {
  const f = r.f;
  const word = (f[1] ?? '').replace(/\//g, '').replace(/\\/g, '').trim();
  const translit = (f[2] ?? '').replace(/\//g, '').trim();
  const gloss = (f[3] ?? '').replace(/\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const strongs = (f[4] ?? '').trim();
  const main = /\{([^}]+)\}/.exec(strongs)?.[1] ?? strongs.split('/').filter((x) => /H\d/.test(x)).pop() ?? strongs;
  // expanded tags: "H9001=ו=&/{H1961=הָיָה=to be}"
  const exp = /\{[^=}]+=([^=}]+)=([^}]*)\}/.exec(f[11] ?? '');
  const ref = `${r.abbr}.${r.c}.${r.v}`;
  const t: RawTok = {
    ref, inst: r.inst, type: r.type, word, translit, gloss, strong: main, morph: (f[5] ?? '').trim(),
    lemma: exp?.[1] ?? '', lemma_gloss: (exp?.[2] ?? '').replace(/^:\s*/, '').split('»')[0].trim(),
    strongs_all: strongs, segs: (f[1] ?? '').split('/').filter(Boolean), lang: r.f[5]?.startsWith('A') ? 'arc' : 'hbo'
  };
  if (r.hc !== undefined) t.heb_ref = `${r.hc}:${r.hv}`;
  return t;
}

export function wlcTokens(dir: string, book: string): RawBook {
  const out: RawBook = {};
  for (const r of rows(dir, 'TAHOT', book)) if (!r.type.startsWith('X')) push(out, hebrewTok(r));
  return out;
}
/** All TAHOT rows (incl. LXX-supplied) — enrichment of UHB tokens. */
export const tahotAll = (dir: string, book: string): RawBook => {
  const out: RawBook = {};
  for (const r of rows(dir, 'TAHOT', book)) push(out, hebrewTok(r));
  return out;
};
