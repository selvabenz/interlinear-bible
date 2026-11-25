/**
 * Search box helpers: recognise book names and references ("1 John 3:16", "rom 8", "phm 1.10",
 * a Tamil book name, or just "3:16" inside a book). Pure functions over the canon list, so any
 * book of any translation is found the same way.
 */
import { BOOKS } from '../pipeline/books';

export interface BookMatch {
  id: string;
  /** chapter:verse asked for, if any ("3:1" when only a chapter was typed) */
  ref?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[\s.\-_'’]/g, '');

/** Split a query into a book-name part and a chapter / verse. */
export function parseQuery(q: string): { name: string; c?: number; v?: number } {
  const t = q.trim();
  const m = t.match(/^(.*?)[\s.]*(\d+)(?:\s*[:.,]\s*(\d+))?$/u);
  if (m && /\p{L}/u.test(m[1])) return { name: m[1], c: +m[2], v: m[3] ? +m[3] : undefined };
  return { name: t };
}

/** "3:16", "3.16" or "3" on its own: a reference inside the open book. */
export function parseLocalRef(q: string): string | undefined {
  const m = q.trim().match(/^(\d+)(?:\s*[:.]\s*(\d+))?$/);
  return m ? `${+m[1]}:${m[2] ? +m[2] : 1}` : undefined;
}

/**
 * Books whose code, English name, Tamil name or name in the translation matches the query,
 * best first. Only books in `available` are returned; chapters past the end of a book are not.
 */
export function matchBooks(query: string, available: Set<string>, nativeName: (id: string) => string | undefined, max = 6): BookMatch[] {
  const { name, c, v } = parseQuery(query);
  const qn = norm(name);
  if (qn.length < 2) return [];
  const found: { score: number; order: number; m: BookMatch }[] = [];
  for (const b of BOOKS) {
    if (!available.has(b.id)) continue;
    if (c !== undefined && (c < 1 || c > b.chapters)) continue;
    let score = 0;
    for (const k of [b.id, b.en, b.ta, nativeName(b.id) ?? ''].map(norm)) {
      if (!k) continue;
      if (k === qn) score = Math.max(score, 3);
      else if (k.startsWith(qn)) score = Math.max(score, 2);
      else if (qn.length >= 3 && k.includes(qn)) score = Math.max(score, 1);
    }
    if (score) found.push({ score, order: b.order, m: { id: b.id, ref: c ? `${c}:${v ?? 1}` : undefined } });
  }
  return found.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, max).map((f) => f.m);
}
