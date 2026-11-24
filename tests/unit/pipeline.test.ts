import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildBook, derivePassages, stripPunct } from '../../src/lib/pipeline/build';
import { classifyFile } from '../../src/lib/pipeline/classify';
import { tokenize } from '../../src/lib/pipeline/usfm';
import type { Issue } from '../../src/lib/pipeline/types';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const file = (p: string) => ({ name: p, text: readFileSync(join(ROOT, p), 'utf8') });
const PHM = {
  translation: 'ta-irv',
  source: 'grc-tr',
  aligned: file('content/translations/ta-irv/PHM.aligned.usfm'),
  semantic: file('content/translations/ta-irv/PHM.semantic.usfm'),
  sourceTokens: file('content/sources/grc-tr/PHM.json'),
  extra: file('content/translations/ta-irv/PHM.meta.json')
};
const res = buildBook(PHM);
const verses = res.chapters!.flatMap((c) => c.verses);
const units = res.chapters!.flatMap((c) => c.units);
const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/PHM/design-parity.json'), 'utf8'));

describe('Philemon build — parity with the original build.py', () => {
  it('builds without errors or warnings', () => {
    expect(res.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(res.ok).toBe(true);
  });
  it('matches the published counts', () => {
    const s = res.book!.stats;
    expect(s.verses).toBe(25);
    expect(s.sourceWords).toBe(348);
    expect(s.targetWords).toBe(316);
    expect(s.groups).toBe(222);
    expect(s.sourceUnaligned).toBe(24);
    expect(s.targetUnaligned).toBe(53);
    expect(s.units).toBe(168);
    expect(s.unitsByKind).toEqual({ s: 140, i: 22, nl: 6 });
    expect(s.findings).toBe(14);
    expect(s.crossVerseUnits).toBe(32);
    expect(s.variants).toBe(13);
    expect(s.unitsByCov).toEqual({ COVERED: 126, POSSIBLY_MISSING: 5, COVERED_BY_RESTRUCTURING: 36, NOT_REQUIRED: 1 });
  });
  it('carries no ESV material', () => {
    const json = JSON.stringify({ book: res.book, chapters: res.chapters });
    expect(json).not.toMatch(/x-esv|"esv/i);
  });
  it('places every source word in at most one group and keeps the three discontiguous-gap words out', () => {
    const seen = new Set<string>();
    for (const v of verses) for (const w of v.w) for (const s of w.src) seen.add(s);
    const gaps = verses.flatMap((v) => v.w.filter((w) => w.gap).map((w) => `${v.c}:${v.v} ${w.w}`));
    expect(gaps).toEqual(['1:4 உள்ள', '1:15 அவன்', '1:18 உம்மிடம்']);
  });
});

describe('Philemon build — parity with the design data (phm-data.js)', () => {
  it('assigns the same semantic unit to every word', () => {
    const got: Record<string, string> = {};
    for (const v of verses) v.w.forEach((w, k) => { if (w.unit) got[`${v.v}.${k + 1}`] = w.unit; });
    expect(got).toEqual(fx.unitByToken);
  });
  it('gives the same support state to every word outside a unit', () => {
    const got: Record<string, string> = {};
    for (const v of verses) v.w.forEach((w, k) => { if (w.sup) got[`${v.v}.${k + 1}`] = w.sup.s; });
    expect(got).toEqual(fx.supportByToken);
  });
  it('links every Tamil word to the same Greek words', () => {
    for (const v of verses) {
      expect(v.w.map((w) => [...w.src].sort())).toEqual(fx.tokenSrcs[v.v].map((s: string[]) => [...s].sort()));
    }
  });
  it('flags every design finding (meaning shift / partial / undertranslated)', () => {
    for (const f of fx.findingUnits) {
      const u = units.find((x) => x.id === f.unit)!;
      expect(u.s7).toBe(f.status);
      expect(u.finding).toBe(true);
    }
  });
  it('lists the same unaligned Greek words (the design files them under the Tamil verse, we under the Greek verse)', () => {
    const got = verses.flatMap((v) => v.s.filter((t) => !t.grp).map((t) => t.st)).sort();
    const want = (Object.values(fx.omissions) as string[][]).flat().sort();
    expect(got).toEqual(want);
  });
  it('reads headings, notes and passages', () => {
    expect(verses.find((v) => v.v === 4)!.h).toEqual([fx.headings['4']]);
    expect(verses.find((v) => v.v === 8)!.h).toEqual([fx.headings['8']]);
    expect(verses.find((v) => v.v === 2)!.n).toEqual([{ k: 'x', t: 'கொலோ 4:17' }]);
    expect(res.book!.passages.map((p) => `${p.id} ${p.start}-${p.end}`)).toEqual([
      'GREETING 1:1-1:3', 'THANKSGIVING 1:4-1:7', 'APPEAL 1:8-1:22', 'CLOSING 1:23-1:25'
    ]);
  });
  it('rebuilds the printed verse text from word + punctuation', () => {
    for (const v of verses) {
      const joined = v.w.map((w) => (w.pre ?? '') + w.w + (w.post ?? '')).join(' ');
      expect(joined.replace(/\s+/g, ' ')).toBe(v.t);
    }
  });
});

describe('Optional parity with the old site data (local only — not in the repo)', () => {
  const old = join(ROOT, 'philemon-interlinear/data/phm.json');
  it.skipIf(!existsSync(old))('same omitted Greek tokens and Tamil text per verse', () => {
    const o = JSON.parse(readFileSync(old, 'utf8'));
    for (const ov of o.verses) {
      const v = verses.find((x) => x.v === ov.v)!;
      expect(v.s.filter((t) => !t.grp).map((t) => t.i)).toEqual(ov.omitted);
      expect(v.t).toBe(ov.tamilText);
    }
  });
});

describe('Validation reports problems instead of crashing', () => {
  const broken = (fn: (t: string) => string, which: 'aligned' | 'semantic' = 'aligned') =>
    buildBook({ ...PHM, [which]: { name: 'broken.usfm', text: fn(PHM[which].text) } });
  const codes = (issues: Issue[]) => issues.filter((i) => i.level === 'error').map((i) => i.code);

  it('unknown source word', () => {
    const r = broken((t) => t.replace('x-content="Χριστοῦ"', 'x-content="Χριστόςς"').replace('x-strong="G5547"', 'x-strong="G9999"'));
    expect(r.ok).toBe(false);
    expect(codes(r.issues)).toContain('zaln.source-not-found');
  });
  it('falls back to Strong’s with a warning when the surface form differs', () => {
    const r = broken((t) => t.replace('x-content="Χριστοῦ"', 'x-content="Χριστόςς"'));
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('zaln.matched-by-strong');
  });
  it('source word aligned twice', () => {
    const r = broken((t) => t.replace('x-content="Ἰησοῦ"', 'x-content="Χριστοῦ"'));
    expect(codes(r.issues)).toContain('zaln.source-in-two-groups');
  });
  it('semantic and aligned files disagree on words', () => {
    const r = broken((t) => t.replace('\\w கிறிஸ்து|', '\\w கிறிஸ்த்|'), 'semantic');
    expect(codes(r.issues)).toContain('semantic.word-differs');
  });
  it('a semantic word is missing', () => {
    const r = broken((t) => t.replace(/\\w இருக்கிற\|[^\\]*\\w\*/, ''), 'semantic');
    expect(codes(r.issues)).toContain('semantic.word-count');
  });
  it('unbalanced milestones', () => {
    const r = broken((t) => t.replace('\\zaln-e\\*', ''));
    expect(r.ok).toBe(false);
  });
  it('bad JSON source', () => {
    const r = buildBook({ ...PHM, sourceTokens: { name: 'x.json', text: '{oops' } });
    expect(codes(r.issues)).toEqual(expect.arrayContaining(['json.invalid']));
  });
  it('works without the semantic layer', () => {
    const r = buildBook({ ...PHM, semantic: undefined, extra: undefined });
    expect(r.ok).toBe(true);
    expect(r.book!.hasSemantic).toBe(false);
    expect(r.book!.passages.map((p) => p.id)).toEqual(['c1']);
    expect(r.book!.stats.groups).toBe(222);
  });
});

describe('USFM tokenizer handles markers beyond Philemon', () => {
  it('poetry, character styles, headings, verse ranges and chapters', () => {
    const issues: Issue[] = [];
    const usfm = '\\id PSA\n\\c 1\n\\ms Book One\n\\s1 The Two Ways\n\\q1\n\\v 1 \\zaln-s |x-strong="H0835" x-content="אַשְׁרֵי"\\*\\w Blessed|x-occurrence="1"\\w*\\zaln-e\\* \\nd \\+w Lord\\+w*\\nd* is \\wj good\\wj*.\n\\q2\n\\v 2-3 \\add more\\add* text\\f + \\fr 1:2 \\ft a note\\f*\n\\c 2\n\\p\n\\v 1 x';
    const toks = tokenize(usfm, 't.usfm', issues);
    expect(issues).toEqual([]);
    expect(toks.filter((t) => t.k === 'head').map((t) => (t as { text: string }).text)).toEqual(['Book One', 'The Two Ways']);
    expect(toks.filter((t) => t.k === 'w').map((t) => (t as { text: string }).text)).toEqual(['Blessed', 'Lord']);
    expect(toks.filter((t) => t.k === 'v').map((t) => (t as { label: string }).label)).toEqual(['1', '2-3', '1']);
    expect(toks.filter((t) => t.k === 'note')).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('classifies files by content', () => {
    expect(classifyFile('58PHMIRVTam.aligned.usfm', PHM.aligned.text)).toMatchObject({ role: 'aligned', book: 'PHM' });
    expect(classifyFile('x.usfm', PHM.semantic.text)).toMatchObject({ role: 'semantic', book: 'PHM' });
    expect(classifyFile('src_phm_tr.json', PHM.sourceTokens.text)).toMatchObject({ role: 'source', book: 'PHM' });
    expect(classifyFile('PHM.meta.json', PHM.extra.text)).toMatchObject({ role: 'meta', book: 'PHM' });
  });
  it('strips punctuation like build.py', () => {
    expect(stripPunct('μου,')).toBe('μου');
  });
  it('makes passages contiguous', () => {
    const p = derivePassages([], ['1:1', '1:2', '2:1'], {});
    expect(p.map((x) => x.id)).toEqual(['c1', 'c2']);
  });
});
