/**
 * buildBook — join the source tokens, the word-alignment layer (\zaln) and the optional
 * semantic layer (\zsem) into the data the app renders. Port of the join + findings part of
 * the original build.py; its `assert`s become structured issues so the importer can show
 * them to a person instead of crashing.
 */
import type {
  BookExtra, BookMeta, BookStats, BuildResult, Chapter, Issue, Passage, RawSource,
  SourceWord, TargetWord, Unit, Verse
} from './types';
import { readAligned, type ReadResult, type RGroup } from './reader';
import { bookInfo, normaliseBookId } from './books';

export interface InputFile { name: string; text: string }

export interface BuildInput {
  translation: string;
  source: string;
  aligned: InputFile;
  semantic?: InputFile;
  sourceTokens: InputFile;
  extra?: InputFile;
  /** Book code to expect; taken from \id when omitted. */
  book?: string;
}

const OK_S7 = new Set(['PRESERVED', 'PRESERVED_WITH_RESTRUCTURING', '']);
const OK_COV = new Set(['COVERED', 'COVERED_BY_RESTRUCTURING', 'NOT_REQUIRED', '']);
const REF_RE = /(?:([1-3]?[A-Za-z]{2,5})\.?\s+)?(\d+):(\d+)/;

export function stripPunct(s: string): string {
  return s.replace(/[\p{P}\p{Z}\p{S}]/gu, '');
}

export function natCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

function refKey(ref: string): [number, number] {
  const [c, v] = ref.split(':').map(Number);
  return [c, v];
}
export function compareRef(a: string, b: string): number {
  const [ac, av] = refKey(a), [bc, bv] = refKey(b);
  return ac - bc || av - bv;
}

/** FNV-1a 32-bit over the inputs — a stable content hash in Node and in the browser. */
export function hashText(...parts: string[]): string {
  let h = 0x811c9dc5;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function parseJson<T>(f: InputFile, issues: Issue[]): T | null {
  try {
    return JSON.parse(f.text.replace(/^﻿/, '')) as T;
  } catch (e) {
    issues.push({ level: 'error', code: 'json.invalid', message: `Not valid JSON: ${(e as Error).message}`, file: f.name });
    return null;
  }
}

/** Source tokens keyed by "c:v". Accepts STEPBible-style keys ("Phm.1.1", "PHM 1:1", "1:1"). */
export function readSource(f: InputFile, issues: Issue[]): Map<string, SourceWord[]> {
  const raw = parseJson<RawSource>(f, issues);
  const out = new Map<string, SourceWord[]>();
  if (!raw) return out;
  for (const [key, toks] of Object.entries(raw)) {
    const m = /(\d+)[.:](\d+)$/.exec(key.trim());
    if (!m || !Array.isArray(toks)) {
      issues.push({ level: 'warning', code: 'source.bad-key', message: `Source entry “${key}” is not a verse reference; skipped`, file: f.name });
      continue;
    }
    const ref = `${+m[1]}:${+m[2]}`;
    out.set(ref, toks.map((t, k) => {
      const strong = String(t.strong ?? '');
      const st = strong.replace(/([GH]\d+)[A-Za-z]$/, '$1');
      const w: SourceWord = {
        i: t.inst !== undefined && t.inst !== '' ? parseInt(String(t.inst), 10) : k + 1,
        w: String(t.word ?? ''),
        tr: String(t.translit ?? ''),
        gl: String(t.gloss ?? ''),
        lm: String(t.lemma ?? ''),
        lg: String(t.lemma_gloss ?? ''),
        st,
        mo: String(t.morph ?? ''),
        tgt: []
      };
      if (st !== strong) w.ds = strong;
      if (t.editions) w.ed = String(t.editions);
      if (t.tr_only) w.trOnly = true;
      if (t.differs_from_na) w.vNA = true;
      return w;
    }));
  }
  return out;
}

export function buildBook(input: BuildInput): BuildResult {
  const issues: Issue[] = [];
  const A = readAligned(input.aligned.text, input.aligned.name, issues, 'g');
  const S: ReadResult | null = input.semantic ? readAligned(input.semantic.text, input.semantic.name, issues, 's') : null;
  const source = readSource(input.sourceTokens, issues);
  const extra = input.extra ? parseJson<BookExtra>(input.extra, issues) ?? {} : {};

  const bookId = normaliseBookId(input.book || A.header.id || '');
  const info = bookInfo(bookId);
  if (!info) issues.push({ level: 'error', code: 'book.unknown', message: `Unknown book code “${A.header.id}” in \\id`, file: input.aligned.name });
  if (S && S.header.id && normaliseBookId(S.header.id) !== bookId) {
    issues.push({ level: 'error', code: 'book.mismatch', message: `Semantic file is for ${S.header.id}, aligned file for ${A.header.id}`, file: input.semantic!.name });
  }
  if (!A.verses.size) issues.push({ level: 'error', code: 'book.empty', message: 'The aligned file has no verses', file: input.aligned.name });
  if (!source.size) issues.push({ level: 'error', code: 'source.empty', message: 'The source file has no verses', file: input.sourceTokens.name });
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues };

  // ---------------------------------------------------------------- semantic layer onto words
  const semUnits = S ? S.units : A.units;
  const semOrder = S ? S.unitOrder : A.unitOrder;
  if (S) {
    for (const [ref, av] of A.verses) {
      const sv = S.verses.get(ref);
      if (!sv) {
        issues.push({ level: 'error', code: 'semantic.verse-missing', message: `Verse ${ref} is in the aligned file but not in the semantic file`, ref });
        continue;
      }
      if (av.words.length !== sv.words.length) {
        issues.push({ level: 'error', code: 'semantic.word-count', message: `Verse ${ref}: ${av.words.length} words in the aligned file, ${sv.words.length} in the semantic file`, ref });
        continue;
      }
      av.words.forEach((a, k) => {
        const s = sv.words[k];
        if (a.text !== s.text) {
          issues.push({ level: 'error', code: 'semantic.word-differs', message: `Verse ${ref} word ${k + 1}: “${a.text}” (aligned) ≠ “${s.text}” (semantic)`, ref });
          return;
        }
        a.unit = s.unit;
        for (const key of ['strong', 'x-morph', 'x-carrier', 'x-support', 'x-reason']) {
          if (s.attrs[key] !== undefined) a.attrs[key] = s.attrs[key];
        }
      });
    }
    for (const ref of S.verses.keys()) {
      if (!A.verses.has(ref)) issues.push({ level: 'error', code: 'semantic.extra-verse', message: `Verse ${ref} is in the semantic file but not in the aligned file`, ref });
    }
    if (issues.some((i) => i.level === 'error')) return { ok: false, issues };
  }

  // ---------------------------------------------------------------- discontiguous-gap words
  // A DISCONTIGUOUS \zaln group stays open across the words of other groups; an unaligned
  // target word that falls into that gap is *not* part of the group. The semantic file settles
  // it: aligned words carry strong=, unaligned ones do not.
  const groupById = new Map<string, RGroup>(A.groups.map((g) => [g.id, g]));
  const hasStrongAttrs = !!S || [...A.verses.values()].some((v) => v.words.some((w) => w.attrs.strong));
  if (hasStrongAttrs) {
    for (const v of A.verses.values()) {
      for (const w of v.words) {
        if (!w.group || w.attrs.strong) continue;
        const g = groupById.get(w.group)!;
        if (!g.discontiguous) {
          issues.push({ level: 'warning', code: 'zaln.word-without-strong', message: `Verse ${v.ref}: “${w.text}” is inside a contiguous alignment group but carries no strong=`, ref: v.ref });
          continue;
        }
        const key = `${v.ref}.${w.n}`;
        g.words = g.words.filter((x) => x !== key);
        g.gapWords.push(key);
        w.group = undefined;
        (w as { gap?: boolean }).gap = true;
      }
    }
  }

  // ---------------------------------------------------------------- groups -> source tokens
  const tokenGroup = new Map<string, string>();            // "c:v#i" -> group id
  const groupSrc = new Map<string, string[]>();            // group id -> ["c:v#i"]
  const findToken = (ref: string, content: string | undefined, strong: string | undefined, occ: number) => {
    const list = source.get(ref);
    if (!list) return null;
    if (content) {
      for (const norm of [(s: string) => s, stripPunct]) {
        const key = norm(content);
        let n = 0;
        for (const t of list) if (norm(t.w) === key && ++n === occ) return t;
      }
    }
    if (strong) {
      const st = strong.replace(/([GH]\d+)[A-Za-z]$/, '$1');
      let n = 0;
      for (const t of list) {
        if (t.st === st && ++n === occ) {
          if (content) issues.push({ level: 'warning', code: 'zaln.matched-by-strong', ref, message: `Verse ${ref}: “${content}” not found in the source text; matched ${t.w} by Strong's ${st} instead` });
          return t;
        }
      }
    }
    return null;
  };
  for (const g of A.groups) {
    const srcs: string[] = [];
    for (const a of g.openers) {
      let sref = g.verse;
      if (a['x-ref']) {
        const m = REF_RE.exec(a['x-ref']);
        if (m) sref = `${+m[2]}:${+m[3]}`;
        else issues.push({ level: 'warning', code: 'zaln.bad-xref', message: `Unreadable x-ref “${a['x-ref']}”`, ref: g.verse });
      }
      const occ = parseInt(a['x-occurrence'] ?? '1', 10) || 1;
      const tok = findToken(sref, a['x-content'], a['x-strong'], occ);
      if (!tok) {
        issues.push({
          level: 'error', code: 'zaln.source-not-found', ref: g.verse,
          message: `Verse ${g.verse}: source word “${a['x-content'] ?? a['x-strong']}” (occurrence ${occ}) not found in source verse ${sref}`
        });
        continue;
      }
      const key = `${sref}#${tok.i}`;
      if (tokenGroup.has(key)) {
        issues.push({ level: 'error', code: 'zaln.source-in-two-groups', ref: sref, message: `Source word ${tok.w} (${key}) is aligned in two groups` });
        continue;
      }
      tokenGroup.set(key, g.id);
      tok.grp = g.id;
      tok.tgt = [...g.words];
      srcs.push(key);
    }
    groupSrc.set(g.id, srcs);
  }

  // ---------------------------------------------------------------- verses
  const allRefs = [...new Set([...A.verses.keys(), ...source.keys()])].sort(compareRef);
  const versesOut = new Map<string, Verse>();
  const srcLookup = (key: string): SourceWord | undefined => {
    const [ref, i] = key.split('#');
    return source.get(ref)?.find((t) => t.i === +i);
  };
  for (const ref of allRefs) {
    const av = A.verses.get(ref);
    const [c, v] = refKey(ref);
    if (!av) {
      issues.push({ level: 'warning', code: 'verse.missing-target', message: `Verse ${ref} has source words but no translation`, ref });
    }
    if (!source.has(ref)) {
      issues.push({ level: 'warning', code: 'verse.missing-source', message: `Verse ${ref} has no source words`, ref });
    }
    const words: TargetWord[] = (av?.words ?? []).map((w) => {
      const src = w.group ? groupSrc.get(w.group) ?? [] : [];
      const semSt = w.attrs.strong ? w.attrs.strong.split(',').map((s) => s.trim()).filter(Boolean) : null;
      const semMo = w.attrs['x-morph'] ? w.attrs['x-morph'].split(',').map((s) => s.trim()).filter(Boolean) : null;
      const toks = src.map(srcLookup).filter((t): t is SourceWord => !!t);
      const out: TargetWord = {
        w: w.text,
        src,
        st: semSt ?? toks.map((t) => t.st),
        mo: semMo ?? toks.map((t) => t.mo)
      };
      if (w.pre) out.pre = w.pre;
      if (w.post) out.post = w.post;
      if (w.group) out.grp = w.group;
      if (w.unit) out.unit = w.unit;
      if (w.attrs['x-support']) out.sup = { s: w.attrs['x-support'], r: w.attrs['x-reason'] ?? '' };
      if (w.attrs['x-carrier']) out.car = w.attrs['x-carrier'].split(/[,\s]+/).filter(Boolean);
      if ((w as { gap?: boolean }).gap) out.gap = true;
      if (w.br) out.br = true;
      return out;
    });
    const verse: Verse = { c, v, t: av?.text ?? '', w: words, s: source.get(ref) ?? [] };
    if (av?.heads.length) verse.h = av.heads;
    if (av?.notes.length) verse.n = av.notes;
    versesOut.set(ref, verse);
  }

  // ---------------------------------------------------------------- semantic units
  const units: Unit[] = [];
  const wordAt = (ref: string, n: number) => versesOut.get(ref)?.w[n - 1];
  for (const id of semOrder) {
    const u = semUnits.get(id)!;
    const a = u.attrs;
    const m = /(\d+):(\d+)#([\d-]+)/.exec(a['x-src'] ?? '');
    if (!m) {
      issues.push({ level: 'error', code: 'zsem.bad-src', message: `Unit ${id}: unreadable x-src “${a['x-src'] ?? ''}”`, ref: u.targetVerses[0] });
      continue;
    }
    const srcRef = `${+m[1]}:${+m[2]}`;
    const idx = m[3].split('-').filter(Boolean).map((x) => parseInt(x, 10));
    const toks = idx.map((i) => source.get(srcRef)?.find((t) => t.i === i));
    toks.forEach((t, k) => {
      if (!t) issues.push({ level: 'error', code: 'zsem.source-not-found', ref: srcRef, message: `Unit ${id}: source word #${idx[k]} does not exist in ${srcRef}` });
      else (t.units ??= []).push(id);
    });
    const unit: Unit = {
      id,
      type: a['x-type'] ?? '',
      kind: u.kind,
      src: srcRef,
      idx,
      content: a['x-content'] ?? '',
      st: a['x-strong'] ? a['x-strong'].split(',') : [],
      real: a['x-real'] ?? '',
      props: a['x-props'] ? a['x-props'].split(/\s+/).filter(Boolean) : [],
      scope: a['x-scope'] ?? '',
      s7: a['x-s7'] ?? '',
      dim: a['x-dim'] ? a['x-dim'].split(',').filter(Boolean) : [],
      cov: a['x-cov'] ?? '',
      review: a['x-review'] ?? '',
      gloss: toks.map((t) => t?.gl ?? '').filter(Boolean).join(' '),
      spans: u.spans.map((sp) => ({ ref: sp.ref, words: sp.words, text: sp.words.map((n) => wordAt(sp.ref, n)?.w ?? '').join(' ') })),
      carriers: u.carriers.map((c) => ({ ref: c.ref, n: c.n, text: wordAt(c.ref, c.n)?.w ?? '' })),
      flags: [],
      finding: false
    };
    if (a['x-vsna28']) unit.vsNA28 = a['x-vsna28'];
    if (a['x-variant']) unit.variant = a['x-variant'];
    if (a['x-note']) unit.note = a['x-note'];
    if (a['x-reason']) unit.reason = a['x-reason'];
    const label = extra.unitLabels?.[id];
    if (label) (unit as Unit & { label?: string }).label = label;
    const f: string[] = [];
    if (unit.kind === 'nl' && unit.cov !== 'NOT_REQUIRED') f.push('NOT_LOCATED');
    if (!OK_COV.has(unit.cov)) f.push(unit.cov);
    if (!OK_S7.has(unit.s7)) f.push(unit.s7);
    if (unit.variant) f.push('TR≠NA28');
    if (unit.props.includes('CROSS_VERSE') || u.targetVerses.some((tv) => tv !== srcRef)) f.push('CROSS_VERSE');
    unit.flags = [...new Set(f)];
    unit.finding = unit.flags.some((x) => x !== 'CROSS_VERSE' && x !== 'TR≠NA28');
    units.push(unit);
  }
  if (semOrder.length) {
    for (const v of versesOut.values()) {
      v.w.forEach((w) => {
        if (w.unit && !semUnits.has(w.unit)) issues.push({ level: 'error', code: 'zsem.unknown-unit', message: `Word “${w.w}” is in unknown unit ${w.unit}`, ref: `${v.c}:${v.v}` });
      });
    }
  }

  // ---------------------------------------------------------------- passages
  const extraPassages = extra.passages ?? {};
  const passages = derivePassages(units, [...versesOut.keys()], extraPassages);

  // ---------------------------------------------------------------- chapters
  const chapters = new Map<number, Chapter>();
  for (const v of versesOut.values()) {
    if (!chapters.has(v.c)) chapters.set(v.c, { c: v.c, verses: [], units: [] });
    chapters.get(v.c)!.verses.push(v);
  }
  for (const u of units) chapters.get(refKey(u.src)[0])?.units.push(u);

  // ---------------------------------------------------------------- stats + concordance
  const allVerses = [...versesOut.values()];
  const count = (xs: string[]) => xs.reduce<Record<string, number>>((o, x) => ((o[x || '—'] = (o[x || '—'] ?? 0) + 1), o), {});
  const tw = allVerses.flatMap((v) => v.w);
  const sw = allVerses.flatMap((v) => v.s);
  const stats: BookStats = {
    verses: allVerses.length,
    sourceWords: sw.length,
    targetWords: tw.length,
    groups: A.groups.length,
    sourceUnaligned: sw.filter((t) => !t.grp).length,
    targetUnaligned: tw.filter((w) => !w.grp).length,
    crossVerseGroups: A.groups.filter((g) => (groupSrc.get(g.id) ?? []).some((k) => k.split('#')[0] !== g.verse)).length,
    units: units.length,
    unitsByKind: count(units.map((u) => u.kind)),
    unitsByS7: count(units.map((u) => u.s7)),
    unitsByCov: count(units.map((u) => u.cov)),
    unitsByType: count(units.map((u) => u.type)),
    supportStates: count(tw.filter((w) => w.sup).map((w) => w.sup!.s)),
    findings: units.filter((u) => u.finding).length,
    crossVerseUnits: units.filter((u) => u.flags.includes('CROSS_VERSE')).length,
    variants: units.filter((u) => u.variant).length
  };
  const concordance: Record<string, [string, string][]> = {};
  for (const v of allVerses) {
    v.w.forEach((w, k) => {
      for (const st of new Set(w.st)) (concordance[st] ??= []).push([`${v.c}:${v.v}.${k + 1}`, w.w]);
    });
  }

  if (stats.sourceUnaligned) {
    issues.push({ level: 'info', code: 'stats.source-unaligned', message: `${stats.sourceUnaligned} of ${stats.sourceWords} source words have no translation word aligned` });
  }
  if (stats.targetUnaligned) {
    issues.push({ level: 'info', code: 'stats.target-unaligned', message: `${stats.targetUnaligned} of ${stats.targetWords} translation words are not aligned to a source word` });
  }

  const book: BookMeta = {
    id: bookId,
    translation: input.translation,
    source: input.source,
    testament: info!.testament,
    order: info!.order,
    name: { en: info!.en, native: A.header.toc2 || A.header.h || info!.ta, abbr: A.header.toc3 },
    chapters: [...chapters.values()].sort((a, b) => a.c - b.c).map((c) => ({ c: c.c, verses: c.verses.length })),
    passages,
    hasSemantic: units.length > 0,
    stats,
    concordance,
    builtAt: new Date().toISOString(),
    hash: hashText(input.aligned.text, input.semantic?.text ?? '', input.sourceTokens.text, input.extra?.text ?? '')
  };
  const ok = !issues.some((i) => i.level === 'error');
  return { ok, issues, book, chapters: [...chapters.values()].sort((a, b) => a.c - b.c) };
}

/**
 * Passages: the semantic layer's passage scopes (x-scope) when present, made contiguous so
 * every verse belongs to exactly one; otherwise one passage per chapter.
 */
export function derivePassages(units: Unit[], refs: string[], labels: BookExtra['passages'] = {}): Passage[] {
  const sorted = [...refs].sort(compareRef);
  if (!sorted.length) return [];
  const firstOf = new Map<string, string>();
  for (const u of units) {
    if (!u.scope) continue;
    const cur = firstOf.get(u.scope);
    if (!cur || compareRef(u.src, cur) < 0) firstOf.set(u.scope, u.src);
  }
  if (firstOf.size) {
    const starts = [...firstOf.entries()].sort((a, b) => compareRef(a[1], b[1]));
    starts[0][1] = sorted[0];
    return starts.map(([id, start], k) => {
      const nextStart = starts[k + 1]?.[1];
      const end = nextStart ? sorted[sorted.indexOf(nextStart) - 1] ?? start : sorted[sorted.length - 1];
      const p: Passage = { id, start, end };
      if (labels?.[id]) p.label = labels[id];
      return p;
    });
  }
  const byChapter = new Map<number, string[]>();
  for (const r of sorted) {
    const c = refKey(r)[0];
    if (!byChapter.has(c)) byChapter.set(c, []);
    byChapter.get(c)!.push(r);
  }
  return [...byChapter.entries()].map(([c, rs]) => ({ id: `c${c}`, start: rs[0], end: rs[rs.length - 1] }));
}
