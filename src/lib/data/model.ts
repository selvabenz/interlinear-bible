/**
 * View model: turns loaded book data into what the Reading and Study views draw.
 * Pure functions (no Svelte), so they work for any book and can be unit-tested.
 */
import type { Passage, SourceWord, TargetWord, Unit, Verse } from '../pipeline/types';
import type { LoadedBook } from './loader';
import { refParts, compareRef } from './loader';
import { describeMorph } from '../morph';
import { SUPPORT, UNIT_TYPE, CHAPTER_WORD, statusLabel, type UiLang, type Labels } from '../i18n/labels';

export type Order = 'target' | 'source';

export interface Item {
  key: string;            // "t:c:v.n" | "s:c:v#i"
  ref: string;            // verse "c:v"
  main: string;           // the word in the order being read
  second: string;         // the aligned word(s) in the other language
  secondMuted: boolean;   // no aligned word / shared with an earlier word of the same group
  tr: string;
  gl: string;
  st: string;
  mo: string;
  crossTo?: string;       // verse the aligned words sit in, when different (short label)
  crossRef?: string;      // the same verse as a full "c:v" reference
  units: string[];
  finding: boolean;
  br?: boolean;
}

export interface NoteLine { kind: string; text: string; tone: 'flag' | 'muted' | 'note' }

/** Label for a verse reference relative to the current one: "5" in the same chapter, "2:5" otherwise. */
export function shortRef(ref: string, from: string): string {
  return refParts(ref)[0] === refParts(from)[0] ? String(refParts(ref)[1]) : ref;
}

export function keyRef(key: string): string {
  const body = key.slice(2);
  return key.startsWith('t:') ? body.slice(0, body.lastIndexOf('.')) : body.split('#')[0];
}

function supportShort(s: string, ui: UiLang): string {
  return SUPPORT[s]?.[ui] ?? s.replace(/_/g, ' ').toLowerCase();
}

export function targetItem(book: LoadedBook, v: Verse, tw: TargetWord, n: number, ui: UiLang): Item {
  const ref = `${v.c}:${v.v}`;
  const gws = tw.src.map((k) => book.source(k)).filter((x): x is SourceWord => !!x);
  const other = tw.src.map((k) => k.split('#')[0]).find((r) => r !== ref);
  const unit = book.unit(tw.unit);
  return {
    key: `t:${ref}.${n}`,
    ref,
    main: (tw.pre ?? '') + tw.w + (tw.post ?? ''),
    second: gws.map((g) => g.w).join(' ') || (tw.sup || tw.gap || !tw.src.length ? '—' : ''),
    secondMuted: !gws.length,
    tr: gws.map((g) => g.tr).join(' · '),
    gl: gws.map((g) => g.gl).filter(Boolean).join(' · ') || (tw.sup ? '+ ' + supportShort(tw.sup.s, ui) : ''),
    st: tw.st.join(' '),
    mo: tw.mo.join(' '),
    crossTo: other ? shortRef(other, ref) : undefined,
    crossRef: other,
    units: tw.unit ? [tw.unit] : [],
    finding: !!unit?.finding,
    br: tw.br
  };
}

export function sourceItem(book: LoadedBook, v: Verse, sw: SourceWord): Item {
  const ref = `${v.c}:${v.v}`;
  const tws = sw.tgt.map((k) => book.target(k)).filter((x): x is TargetWord => !!x);
  const other = sw.tgt.map((k) => k.slice(0, k.lastIndexOf('.'))).find((r) => r !== ref);
  // members of a many-to-one group after the first show the shared translation muted
  const groupFirst = sw.grp ? v.s.find((t) => t.grp === sw.grp) : undefined;
  const shared = !!groupFirst && groupFirst.i !== sw.i;
  return {
    key: `s:${ref}#${sw.i}`,
    ref,
    main: sw.w,
    second: tws.map((t) => t.w).join(' ') || '—',
    secondMuted: !tws.length || shared,
    tr: sw.tr,
    gl: sw.gl,
    st: sw.st,
    mo: sw.mo,
    crossTo: other ? shortRef(other, ref) : undefined,
    crossRef: other,
    units: sw.units ?? [],
    finding: (sw.units ?? []).some((u) => book.unit(u)?.finding)
  };
}

export function verseItems(book: LoadedBook, v: Verse, order: Order, ui: UiLang): Item[] {
  return order === 'target' ? v.w.map((tw, k) => targetItem(book, v, tw, k + 1, ui)) : v.s.map((sw) => sourceItem(book, v, sw));
}

/** Verses of a passage, in order. */
export function passageVerses(book: LoadedBook, p: Passage): Verse[] {
  return book.allVerses().filter((v) => {
    const r = `${v.c}:${v.v}`;
    return compareRef(r, p.start) >= 0 && compareRef(r, p.end) <= 0;
  });
}

export function passageChapters(p: Passage): number[] {
  const [a] = refParts(p.start), [b] = refParts(p.end);
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** Chapters referenced by cross-verse alignments in the given verses (e.g. 4:1 rendered in 3:26). */
export function referencedChapters(verses: Verse[]): number[] {
  const out = new Set<number>();
  for (const v of verses) {
    for (const w of v.w) for (const k of w.src) out.add(+k.split(':')[0]);
    for (const s of v.s) for (const k of s.tgt) out.add(+k.split(':')[0]);
  }
  return [...out];
}

/**
 * A passage's name. Chapter passages are named in the Bible's own language when `lang` (the
 * translation's language) is known — a Tamil Bible says "அத்தியாயம் 2" in either interface.
 */
export function passageLabel(p: Passage, ui: UiLang, L: Labels, lang?: string): string {
  const l = p.label?.[ui] ?? p.label?.en;
  if (l) return l;
  if (/^c\d+$/.test(p.id)) return `${(lang && CHAPTER_WORD[lang]) || L.chapter} ${p.id.slice(1)}`;
  return p.id.charAt(0) + p.id.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function passageRange(p: Passage): string {
  const [sc, sv] = refParts(p.start), [ec, ev] = refParts(p.end);
  return sc === ec ? `${sc}:${sv}–${ev}` : `${sc}:${sv}–${ec}:${ev}`;
}

export function passageOf(passages: Passage[], ref: string): Passage | undefined {
  return passages.find((p) => compareRef(ref, p.start) >= 0 && compareRef(ref, p.end) <= 0);
}

/** Study-mark lines under a verse. */
export function verseNotes(book: LoadedBook, v: Verse, ui: UiLang, L: Labels): NoteLine[] {
  const ref = `${v.c}:${v.v}`;
  const out: NoteLine[] = [];
  const srcName = book.meta.testament === 'OT' ? (ui === 'ta' ? 'எபிரெயம்' : 'HEBREW') : ui === 'ta' ? 'கிரேக்கம்' : 'GREEK';
  for (const s of v.s) {
    if (s.grp) continue;
    out.push({ kind: srcName, text: `${s.w}${s.gl ? ` “${s.gl}”` : ''} — ${L.notRendered}`, tone: 'flag' });
  }
  const seen = new Set<string>();
  for (const u of book.unitsInRange(`${v.c}:1`, `${v.c}:999`)) {
    if (!u.finding || seen.has(u.id)) continue;
    const here = u.spans.length ? u.spans.some((s) => s.ref === ref) : u.src === ref;
    if (!here) continue;
    seen.add(u.id);
    out.push({ kind: statusLabel(unitStatus(u), ui).toUpperCase(), text: u.note || u.reason || u.content, tone: 'flag' });
  }
  v.w.forEach((w) => {
    if (w.sup && w.sup.s !== 'GRAMMATICALLY_REQUIRED') {
      out.push({ kind: ui === 'ta' ? 'குறிப்பு' : 'NOTE', text: `${w.w} — ${supportShort(w.sup.s, ui)}${w.sup.r ? ': ' + w.sup.r : ''}`, tone: 'note' });
    }
  });
  for (const n of v.n ?? []) {
    out.push({ kind: n.k === 'x' ? (ui === 'ta' ? 'ஒத்த வசனம்' : 'CROSS-REF') : ui === 'ta' ? 'அடிக்குறிப்பு' : 'FOOTNOTE', text: n.t, tone: 'muted' });
  }
  return out;
}

/** The status to show for a unit: its meaning status, or its coverage when it was not located. */
export function unitStatus(u: Unit): string {
  if (u.kind === 'nl') return u.cov === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : u.cov || 'NOT_LOCATED';
  if (u.s7 && !['PRESERVED', 'PRESERVED_WITH_RESTRUCTURING'].includes(u.s7)) return u.s7;
  if (u.cov === 'POSSIBLY_MISSING') return u.cov;
  return u.s7 || u.cov;
}

export function unitLabel(u: Unit, ui: UiLang): string {
  const l = (u as Unit & { label?: string }).label;
  if (l) return l;
  const t = UNIT_TYPE[u.type]?.[ui] ?? u.type.toLowerCase();
  return `${u.gloss || u.content} · ${t}`;
}

export interface Detail {
  key: string;
  ref: string;
  ta: string;              // translation word(s)
  gr: string;              // source word(s)
  tr: string;
  st: string;
  mo: string;
  lemma: string;
  lemmaGloss: string;
  morphLong: string;
  english: string;         // English gloss of the source words
  unit?: Unit;
  unitLabel: string;
  status: string;          // status code
  statusText: string;
  note: string;
  strongs: string[];
  crossTo?: string;
}

export function detailFor(book: LoadedBook, key: string, ui: UiLang, L: Labels): Detail | null {
  const ref = keyRef(key);
  if (key.startsWith('t:')) {
    const tw = book.target(key.slice(2));
    if (!tw) return null;
    const gws = tw.src.map((k) => book.source(k)).filter((x): x is SourceWord => !!x);
    const u = book.unit(tw.unit);
    const other = tw.src.map((k) => k.split('#')[0]).find((r) => r !== ref);
    return {
      key, ref,
      ta: (tw.pre ?? '') + tw.w + (tw.post ?? ''),
      gr: gws.map((g) => g.w).join(' ') || '—',
      tr: gws.map((g) => g.tr).join(' · '),
      st: tw.st.join(' ') || (tw.sup ? L.addition : ''),
      mo: tw.mo.join(' '),
      lemma: gws.map((g) => g.lm).join(' · ') || '—',
      lemmaGloss: gws.map((g) => g.lg || g.gl).filter(Boolean).join(' · ') || (tw.sup?.r ?? L.noSource),
      morphLong: describeMorph(tw.mo),
      english: gws.map((g) => g.gl).filter(Boolean).join(' · ') || '—',
      unit: u,
      unitLabel: u ? unitLabel(u, ui) : tw.sup ? supportShort(tw.sup.s, ui) : '—',
      status: u ? unitStatus(u) : '',
      statusText: u ? statusLabel(unitStatus(u), ui) : tw.sup ? tw.sup.s.replace(/_/g, ' ').toLowerCase() : '',
      note: u?.note || u?.reason || tw.sup?.r || '',
      strongs: tw.st,
      crossTo: other ? shortRef(other, ref) : undefined
    };
  }
  const sw = book.source(key.slice(2));
  if (!sw) return null;
  const tws = sw.tgt.map((k) => book.target(k)).filter((x): x is TargetWord => !!x);
  const u = book.unit(sw.units?.[0]);
  const other = sw.tgt.map((k) => k.slice(0, k.lastIndexOf('.'))).find((r) => r !== ref);
  return {
    key, ref,
    ta: tws.map((t) => t.w).join(' ') || '—',
    gr: sw.w,
    tr: sw.tr,
    st: sw.st,
    mo: sw.mo,
    lemma: sw.lm || '—',
    lemmaGloss: sw.lg || sw.gl,
    morphLong: describeMorph(sw.mo),
    english: sw.gl || '—',
    unit: u,
    unitLabel: u ? unitLabel(u, ui) : '—',
    status: u ? unitStatus(u) : '',
    statusText: u ? statusLabel(unitStatus(u), ui) : tws.length ? '' : L.notRendered,
    note: u?.note || u?.reason || '',
    strongs: [sw.st],
    crossTo: other ? shortRef(other, ref) : undefined
  };
}

/** Other places in the book where the same Strong's numbers occur in the translation. */
export function occurrences(book: LoadedBook, strongs: string[], exclude: string, max = 16): { key: string; ref: string; ta: string }[] {
  const out: { key: string; ref: string; ta: string }[] = [];
  const seen = new Set<string>();
  for (const st of strongs) {
    for (const [k, w] of book.meta.concordance[st] ?? []) {
      const key = `t:${k}`;
      if (key === exclude || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, ref: k.slice(0, k.lastIndexOf('.')), ta: w });
    }
  }
  return out.sort((a, b) => compareRef(a.ref, b.ref) || a.key.localeCompare(b.key)).slice(0, max);
}

export interface MapRow { src: string; tgt: string; tag: string; moved: boolean }

/** Where each source verse of the passage was rendered in the translation. */
export function passageMap(book: LoadedBook, verses: Verse[], L: Labels): MapRow[] {
  return verses.map((v) => {
    const ref = `${v.c}:${v.v}`;
    const targets = new Set<string>();
    for (const s of v.s) for (const k of s.tgt) targets.add(k.slice(0, k.lastIndexOf('.')));
    const list = [...targets].sort(compareRef);
    const moved = list.length > 1 || (list.length === 1 && list[0] !== ref);
    const notLocated = book.unitsInRange(ref, ref).some((u) => u.kind === 'nl');
    return {
      src: ref,
      tgt: list.length ? list.join(', ') : '—',
      tag: list.length > 1 ? L.split : moved ? L.swapped : notLocated ? '·' : '',
      moved
    };
  });
}

/** The first word to select for a unit: a word of its span, a carrier, or its first source word. */
export function unitAnchor(u: Unit): string {
  const sp = u.spans.find((s) => s.words.length);
  if (sp) return `t:${sp.ref}.${sp.words[0]}`;
  if (u.carriers.length) return `t:${u.carriers[0].ref}.${u.carriers[0].n}`;
  return `s:${u.src}#${u.idx[0]}`;
}

export interface SearchHit { key: string; ref: string; ta: string; gr: string }

/** Search translation words, source words, transliteration, glosses and Strong's. */
export function search(book: LoadedBook, query: string, max = 30): SearchHit[] {
  const q = query.trim().toLowerCase().normalize('NFC');
  if (!q) return [];
  const qs = /^[gh]\d+$/i.test(q) ? q.toUpperCase().replace(/^([GH])0*/, '$1') : null;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const qn = norm(q);
  const out: SearchHit[] = [];
  for (const v of book.allVerses()) {
    const ref = `${v.c}:${v.v}`;
    for (let n = 0; n < v.w.length && out.length < max; n++) {
      const tw = v.w[n];
      const gws = tw.src.map((k) => book.source(k)).filter((x): x is SourceWord => !!x);
      let hit = tw.w.toLowerCase().includes(q);
      if (!hit && qs) hit = tw.st.some((s) => s.replace(/^([GH])0*/, '$1') === qs);
      if (!hit) hit = gws.some((g) => norm(g.w).includes(qn) || g.tr.toLowerCase().includes(q) || g.gl.toLowerCase().includes(q) || norm(g.lm).includes(qn));
      if (hit) out.push({ key: `t:${ref}.${n + 1}`, ref, ta: tw.w, gr: gws.map((g) => g.w).join(' ') || '—' });
    }
    if (out.length >= max) break;
  }
  return out;
}

export function verseText(v: Verse): string {
  return v.t;
}
