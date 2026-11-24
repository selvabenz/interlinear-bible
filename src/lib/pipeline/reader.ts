/**
 * Reads an aligned USFM file into verses, word-alignment groups (\zaln) and semantic units
 * (\zsem). A port of read_zaln / read_zsem from the original build.py, generalised to
 * multi-chapter books; one file may carry either layer or both.
 */
import type { Issue, VerseNote } from './types';
import { tokenize, readHeader, lineOf, type UsfmHeader } from './usfm';

export interface RWord {
  n: number;
  text: string;
  attrs: Record<string, string>;
  group?: string;
  unit?: string;          // semantic unit whose span contains the word (x-support words excluded)
  pre?: string;
  post?: string;
  br?: boolean;
}

export interface RVerse {
  c: number;
  v: number;
  ref: string;
  label: string;
  heads: string[];
  notes: VerseNote[];
  words: RWord[];
  text: string;
}

export interface RGroup {
  id: string;
  openers: Record<string, string>[];
  words: string[];        // "c:v.n"
  gapWords: string[];
  discontiguous: boolean;
  nopen: number;
  verse: string;          // verse the group sits in (target verse)
  at: number;
}

export interface RUnitSpan { ref: string; span: string; words: number[] }

export interface RUnit {
  id: string;
  kind: 's' | 'i' | 'nl';
  attrs: Record<string, string>;
  spans: RUnitSpan[];
  carriers: { ref: string; n: number }[];
  targetVerses: string[];
  gapWords: { ref: string; n: number; text: string }[];
  at: number;
}

export interface ReadResult {
  header: UsfmHeader;
  verses: Map<string, RVerse>;
  groups: RGroup[];
  units: Map<string, RUnit>;
  /** unit id order as first declared */
  unitOrder: string[];
}

export function readAligned(text: string, file: string, issues: Issue[], groupPrefix = 'g'): ReadResult {
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const header = readHeader(text);
  const toks = tokenize(text, file, issues);
  const verses = new Map<string, RVerse>();
  const groups: RGroup[] = [];
  const units = new Map<string, RUnit>();
  const unitOrder: string[] = [];

  let chapter = 0;
  let cur: RVerse | null = null;
  let pendingHeads: string[] = [];
  let pendingBr = false;
  let pendingPre = '';
  let last: RWord | null = null;
  let textBuf: string[] = [];

  // \zaln state
  const stack: RGroup[] = [];
  let openers: Record<string, string>[] = [];
  let openersAt = 0;
  // \zsem state
  const semStack: string[] = [];
  const carrierLinks: { unit: string; ref: string; n: number; at: number }[] = [];

  const err = (code: string, message: string, at: number, ref?: string) =>
    issues.push({ level: 'error', code, message: `${message} (line ${lineOf(text, at)})`, file, ref });

  const finishVerse = () => {
    if (cur) cur.text = textBuf.join('').replace(/\s+/g, ' ').trim();
    textBuf = [];
  };

  const unitFrom = (attrs: Record<string, string>, kind: 's' | 'i' | 'nl', ref: string, at: number): RUnit | null => {
    const id = attrs['x-unit'];
    if (!id) {
      err('zsem.no-id', 'A \\zsem milestone has no x-unit', at, ref);
      return null;
    }
    let u = units.get(id);
    if (!u) {
      u = { id, kind, attrs, spans: [], carriers: [], targetVerses: [], gapWords: [], at };
      units.set(id, u);
      unitOrder.push(id);
    } else if (kind === 's') {
      u.kind = 's';
    }
    if (kind === 's') u.spans.push({ ref, span: attrs['x-span'] ?? '', words: [] });
    if (!u.targetVerses.includes(ref)) u.targetVerses.push(ref);
    return u;
  };

  for (const t of toks) {
    switch (t.k) {
      case 'c':
        finishVerse();
        chapter = t.n;
        cur = null;
        last = null;
        break;
      case 'v': {
        finishVerse();
        if (stack.length) {
          err('zaln.open-across-verse', `Alignment group ${stack[stack.length - 1].id} is still open when verse ${chapter}:${t.n} starts`, t.at);
          stack.length = 0;
        }
        if (!chapter) {
          err('usfm.verse-before-chapter', 'Verse before any chapter', t.at);
          break;
        }
        const ref = `${chapter}:${t.n}`;
        if (verses.has(ref)) err('usfm.duplicate-verse', `Verse ${ref} appears twice`, t.at, ref);
        cur = { c: chapter, v: t.n, ref, label: t.label, heads: pendingHeads, notes: [], words: [], text: '' };
        verses.set(ref, cur);
        pendingHeads = [];
        last = null;
        break;
      }
      case 'head':
        pendingHeads.push(t.text);
        pendingBr = true;
        break;
      case 'para':
        pendingBr = true;
        if (cur) textBuf.push(' ');
        break;
      case 'note':
        if (cur) cur.notes.push({ k: t.kind, t: t.text });
        break;
      case 'ms': {
        if (!cur) {
          err('usfm.milestone-outside-verse', `\\${t.name} outside a verse`, t.at);
          break;
        }
        if (t.name === 'zaln-s') {
          if (!openers.length) openersAt = t.at;
          openers.push(t.attrs);
        } else if (t.name === 'zsem-s') {
          const u = unitFrom(t.attrs, 's', cur.ref, t.at);
          if (u) semStack.push(u.id);
        } else {
          unitFrom(t.attrs, t.name === 'zsem-i' ? 'i' : 'nl', cur.ref, t.at);
        }
        break;
      }
      case 'me': {
        if (t.name === 'zaln-e') {
          if (openers.length) {
            err('zaln.empty-group', 'An alignment group has no target words', t.at, cur?.ref);
            openers = [];
            break;
          }
          const g = stack[stack.length - 1];
          if (!g) {
            err('zaln.unbalanced', '\\zaln-e without a matching \\zaln-s', t.at, cur?.ref);
            break;
          }
          g.nopen -= 1;
          if (g.nopen === 0) stack.pop();
        } else {
          if (!semStack.length) err('zsem.unbalanced', '\\zsem-e without a matching \\zsem-s', t.at, cur?.ref);
          else semStack.pop();
        }
        break;
      }
      case 'w': {
        if (!cur) {
          err('usfm.word-outside-verse', `Word “${t.text}” outside a verse`, t.at);
          break;
        }
        if (openers.length) {
          const g: RGroup = {
            id: `${groupPrefix}${groups.length + 1}`,
            openers,
            words: [],
            gapWords: [],
            discontiguous: openers.some((a) => a['x-discontiguous'] === 'true'),
            nopen: openers.length,
            verse: cur.ref,
            at: openersAt
          };
          groups.push(g);
          stack.push(g);
          openers = [];
        }
        const n = cur.words.length + 1;
        const w: RWord = { n, text: t.text, attrs: t.attrs };
        if (pendingPre) { w.pre = pendingPre; pendingPre = ''; }
        if (pendingBr && cur.words.length) w.br = true;
        pendingBr = false;
        const top = stack[stack.length - 1];
        if (top) {
          w.group = top.id;
          top.words.push(`${cur.ref}.${n}`);
        }
        // A word carrying x-support is by definition outside every unit, even when it sits
        // inside an open (discontiguous) \zsem-s span.
        const semTop = semStack[semStack.length - 1];
        if (semTop) {
          const u = units.get(semTop)!;
          if (!t.attrs['x-support']) {
            w.unit = semTop;
            u.spans[u.spans.length - 1].words.push(n);
          } else {
            u.gapWords.push({ ref: cur.ref, n, text: t.text });
          }
        }
        if (t.attrs['x-carrier']) {
          for (const c of t.attrs['x-carrier'].trim().split(/[,\s]+/).filter(Boolean)) {
            carrierLinks.push({ unit: c, ref: cur.ref, n, at: t.at });
          }
        }
        cur.words.push(w);
        textBuf.push(w.text);
        last = w;
        break;
      }
      case 'text': {
        if (!cur) break;
        const s = t.text.replace(/\n/g, ' ');
        textBuf.push(s);
        if (!s.trim()) break;
        // Punctuation glued to the previous word ("word,") becomes its `post`; a chunk glued
        // to the next word (“word) becomes that word's `pre`; anything between goes to `post`.
        const chunks = s.split(/\s+/).filter(Boolean);
        const glueLeft = !/^\s/.test(s);
        const glueRight = !/\s$/.test(s);
        chunks.forEach((ch, k) => {
          const isLast = k === chunks.length - 1;
          if (isLast && glueRight && !(k === 0 && glueLeft && last)) {
            pendingPre += ch;
          } else if (last) {
            last.post = (last.post ?? '') + (k === 0 && glueLeft ? '' : ' ') + ch;
          } else {
            pendingPre += ch + ' ';
          }
        });
        break;
      }
    }
  }
  finishVerse();
  if (stack.length) err('zaln.unclosed', `Alignment group ${stack[stack.length - 1].id} never closes`, stack[stack.length - 1].at);
  if (semStack.length) issues.push({ level: 'error', code: 'zsem.unclosed', message: `Semantic unit ${semStack[semStack.length - 1]} never closes`, file });

  for (const l of carrierLinks) {
    const u = units.get(l.unit);
    if (!u) err('zsem.carrier-unknown', `Word carries unit ${l.unit}, which is never declared`, l.at, l.ref);
    else u.carriers.push({ ref: l.ref, n: l.n });
  }
  return { header, verses, groups, units, unitOrder };
}
