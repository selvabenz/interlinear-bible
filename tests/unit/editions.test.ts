import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { normStrong } from '../../src/lib/pipeline/strong';
import { describeMorph, uwGreekToRobinson, uwHebrewToOshb, describeHebrew } from '../../src/lib/morph';
import { readSource, hashText } from '../../src/lib/pipeline/build';
import { alignTokens, buildMapFile, mapLookup, remapAligned, identity, type MapFile } from '../../src/lib/pipeline/remap';
import { buildEditions, detectPrimary, isUwAligned, sourcesFor } from '../../src/lib/pipeline/editions';
import { findSourceToken, occurrenceOf, normForm } from '../../src/lib/pipeline/match';
import type { SourceInfo, SourceWord } from '../../src/lib/pipeline/types';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const file = (p: string) => ({ name: p, text: readFileSync(join(ROOT, p), 'utf8') });
const catalog = JSON.parse(readFileSync(join(ROOT, 'content/catalog.json'), 'utf8')) as { sources: SourceInfo[] };

describe("Strong's normalisation", () => {
  it.each([
    ['G05750', 'G0575'], ['G0575', 'G0575'], ['G575', 'G0575'], ['G3972G', 'G3972'], ['G37390', 'G3739'],
    ['b:H7225', 'H7225'], ['c:d:H1961', 'H1961'], ['H9001/{H1961}', 'H1961'], ['{H8199}', 'H8199'], ['H1961a', 'H1961'],
    ['H430', 'H0430'], ['', '']
  ])('%s → %s', (a, b) => expect(normStrong(a)).toBe(b));
});

describe('morphology', () => {
  it.each([
    ['Gr,V,IIA3,,S,', 'V-IAI-3S'], ['Gr,N,,,,,GFS,', 'N-GSF'], ['Gr,V,IEA1,,P,', 'V-RAI-1P'],
    ['Gr,RP,,,1G,P,', 'P-1GP'], ['Gr,EA,,,,NMS,', 'T-NSM'], ['Gr,P,,,,,G,,,', 'PREP'], ['Gr,CC,,,,,,,,', 'CONJ'],
    ['Gr,V,PPA,NMS,', 'V-PAP-NSM'], ['Gr,V,PEP,NFS,', 'V-RPP-NSF'], ['Gr,V,NPA,,,,,', 'V-PAN'], ['Gr,RR,,,,NNS,', 'R-NSN']
  ])('UGNT %s → Robinson %s', (a, b) => expect(uwGreekToRobinson(a)).toBe(b));

  it('UHB → OSHB', () => {
    expect(uwHebrewToOshb('He,C:Vqw3ms')).toBe('HC/Vqw3ms');
    expect(uwHebrewToOshb('Ar,Ncmsd')).toBe('ANcmsd');
  });

  it('decodes OSHB codes, including TAHOT lower-case conjunctions', () => {
    expect(describeHebrew('Hc/Vqw3ms')).toBe('conjunction + verb — qal sequential imperfect, third person masculine singular');
    expect(describeHebrew('HNcmpc/Sp3ms')).toBe('noun — masculine plural construct + pronominal suffix — third person masculine singular');
    expect(describeHebrew('HTd/Vqrmpa')).toContain('particle — definite article + verb — qal participle');
    expect(describeHebrew('HNpl')).toBe('proper noun — location');
  });

  it('describeMorph keeps a uW code with commas as one code', () => {
    expect(describeMorph('Gr,N,,,,,GFS,')).toBe('noun — genitive singular feminine');
    expect(describeMorph('N-GSM-T,V-PAI-3S')).toBe('noun — genitive singular masculine, title · verb — present active indicative, third person singular');
  });
});

describe('source-token lookup', () => {
  const list = [
    { i: 1, w: 'ἡμῶν' }, { i: 2, w: 'καὶ' }, { i: 3, w: 'ἡμῶν,' }
  ] as SourceWord[];
  it('x-occurrence written by the remap resolves back to the same token', () => {
    for (const t of list) {
      const [k] = occurrenceOf(list, t);
      expect(findSourceToken(list, t.w.replace(/,/, ''), undefined, k)?.tok).toBe(t);
    }
  });
  it('folds grave/acute and apostrophe forms', () => {
    expect(normForm('ἀπ’')).toBe(normForm('ἀπ᾽'));
    expect(normForm('καὶ')).toBe(normForm('καί'));
    expect(normForm('וַ⁠יְהִ֗י')).toBe(normForm('וַיְהִי'));
  });
});

const NT = ['grc-tr', 'grc-ugnt'];
const tokens1JN = { 'grc-tr': file('content/sources/grc-tr/1JN.json'), 'grc-ugnt': file('content/sources/grc-ugnt/1JN.json') };
const aligned1JN = file('content/translations/ta-irv/1JN.aligned.usfm');

describe('1 John: Bridge (UGNT) alignment, published in two editions', () => {
  const tr = readSource(tokens1JN['grc-tr'], []);
  const ugnt = readSource(tokens1JN['grc-ugnt'], []);

  it('detects the Bridge file as unfoldingWord-format and aligned to UGNT', () => {
    expect(isUwAligned(aligned1JN.text)).toBe(true);
    expect(detectPrimary(aligned1JN.text, NT, catalog.sources)).toBe('grc-ugnt');
    expect(detectPrimary(file('content/translations/ta-irv/PHM.aligned.usfm').text, NT, catalog.sources)).toBe('grc-tr');
    expect(sourcesFor({ sources: { NT: 'grc-tr' } }, 'NT')).toEqual(['grc-tr']);
  });

  it('aligns the UGNT and TR token streams of the whole book', () => {
    const { stats, auto } = alignTokens(ugnt, tr);
    expect(stats.exact).toBeGreaterThan(2000);
    expect(stats.exact + stats.spelling + stats.lexical + stats.unmatchedFrom).toBe(2137);
    const to = new Map(auto.map(([f, t]) => [f, t]));
    expect(to.get('1:1#1')).toBe('1:1#1');      // ὃ
    // TR-only words of 5:7 ("in heaven, the Father, the Word …") have no UGNT counterpart
    const trFrom57 = new Set(auto.map(([, t]) => t).filter((t): t is string => !!t && t.startsWith('5:7#')));
    expect(tr.get('5:7')!.length - trFrom57.size).toBeGreaterThanOrEqual(15);
  });

  it('remaps every milestone it can and builds both editions without errors', () => {
    const res = buildEditions({
      translation: 'ta-irv', book: '1JN', testament: 'NT', aligned: aligned1JN,
      tokens: tokens1JN, sources: NT, sourceInfo: catalog.sources
    });
    expect(res.primary).toBe('grc-ugnt');
    expect(res.issues.filter((i) => i.level === 'error')).toEqual([]);
    const [p, d] = res.editions;
    expect(p.source).toBe('grc-ugnt');
    expect(p.result.ok).toBe(true);
    expect(p.result.book!.edition).toEqual({ primary: true });
    expect(d.source).toBe('grc-tr');
    expect(d.result.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(d.remap!.milestones).toBe(1805);
    expect(d.remap!.kept).toBeGreaterThan(1750);
    expect(d.result.book!.edition).toMatchObject({ primary: false, from: 'grc-ugnt' });
    // same Tamil text in both editions
    expect(d.result.book!.stats.targetWords).toBe(p.result.book!.stats.targetWords);
    // a map was produced because none was passed in
    expect(Object.keys(res.newMaps)).toEqual(['grc-ugnt__grc-tr']);
  });

  it('keeps a source word that the Bridge file aligns in two places', () => {
    const res = buildEditions({
      translation: 'ta-irv', book: '1JN', testament: 'NT', aligned: aligned1JN,
      tokens: tokens1JN, sources: NT, sourceInfo: catalog.sources
    });
    const v = res.editions[0].result.chapters![4].verses.find((x) => x.v === 20)!;
    const oidamen = v.s.find((t) => t.w.startsWith('οἴδαμεν'))!;
    expect(oidamen.tgt.length).toBeGreaterThan(1);
  });

  it('uses a stored map when current and flags it stale otherwise; overrides win', () => {
    const fromHash = hashText(tokens1JN['grc-ugnt'].text), toHash = hashText(tokens1JN['grc-tr'].text);
    const map = buildMapFile('grc-ugnt', 'grc-tr', '1JN', ugnt, tr, fromHash, toHash);
    const input = { translation: 'ta-irv', book: '1JN', testament: 'NT' as const, aligned: aligned1JN, tokens: tokens1JN, sources: NT, sourceInfo: catalog.sources };
    const fresh = buildEditions({ ...input, maps: { 'grc-ugnt__grc-tr': map } });
    expect(fresh.newMaps).toEqual({});
    expect(fresh.issues.some((i) => i.code === 'map.stale')).toBe(false);

    const stale: MapFile = { ...map, toHash: 'x', overrides: { '1:1#1': null } };
    const r = buildEditions({ ...input, maps: { 'grc-ugnt__grc-tr': stale } });
    expect(r.issues.some((i) => i.code === 'map.stale')).toBe(true);
    expect(r.newMaps['grc-ugnt__grc-tr'].overrides).toEqual({ '1:1#1': null });
    expect(mapLookup(r.newMaps['grc-ugnt__grc-tr'])('1:1#1')).toEqual({ to: null, how: 'override' });
  });
});

describe('Philemon: TR alignment also published against UGNT', () => {
  it('builds a derived UGNT edition that keeps the TR passages and omits study marks', () => {
    const res = buildEditions({
      translation: 'ta-irv', book: 'PHM', testament: 'NT',
      aligned: file('content/translations/ta-irv/PHM.aligned.usfm'),
      semantic: file('content/translations/ta-irv/PHM.semantic.usfm'),
      extra: file('content/translations/ta-irv/PHM.meta.json'),
      tokens: { 'grc-tr': file('content/sources/grc-tr/PHM.json'), 'grc-ugnt': file('content/sources/grc-ugnt/PHM.json') },
      sources: NT, sourceInfo: catalog.sources
    });
    expect(res.primary).toBe('grc-tr');
    const [p, d] = res.editions;
    expect(p.result.book!.stats.groups).toBe(222);   // parity build unchanged
    expect(d.result.ok).toBe(true);
    expect(d.result.book!.passages.map((x) => x.id)).toEqual(p.result.book!.passages.map((x) => x.id));
    expect(d.result.book!.hasSemantic).toBe(false);
    expect(d.result.book!.edition?.semanticOmitted).toBe(true);
  });
});

describe('Hebrew: UHB ⇄ WLC (Ruth, real tokens; synthetic alignment)', () => {
  const uhbFile = file('tests/fixtures/RUT/hbo-uhb.json');
  const wlcFile = file('tests/fixtures/RUT/hbo-wlc.json');
  const uhb = readSource(uhbFile, []);
  const wlc = readSource(wlcFile, []);
  const raw = JSON.parse(uhbFile.text) as Record<string, { word: string; uw_strong: string; uw_morph: string; lemma: string }[]>;

  it('aligns ≥ 99% of the UHB words to the WLC', () => {
    const { stats } = alignTokens(uhb, wlc);
    const total = [...uhb.values()].reduce((s, l) => s + l.length, 0);
    expect(stats.exact + stats.spelling + stats.lexical).toBeGreaterThanOrEqual(Math.floor(total * 0.99));
  });

  it('remaps a translationCore-style aligned Ruth to the WLC with no lost source words', () => {
    // one placeholder target word per Hebrew word, milestones exactly as translationCore writes them
    const lines = ['\\id RUT synthetic', '\\h Ruth', '\\c 1'];
    let chapter = 1;
    for (const [key, toks] of Object.entries(raw)) {
      if (key.startsWith('_')) continue;
      const [, c, v] = /(\d+):(\d+)$/.exec(key)!;
      if (+c !== chapter) { chapter = +c; lines.push(`\\c ${c}`); }
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t.word, (counts.get(t.word) ?? 0) + 1);
      const seen = new Map<string, number>();
      const words = toks.map((t, k) => {
        const n = (seen.get(t.word) ?? 0) + 1;
        seen.set(t.word, n);
        return `\\zaln-s |x-strong="${t.uw_strong}" x-lemma="${t.lemma}" x-morph="${t.uw_morph}" x-occurrence="${n}" x-occurrences="${counts.get(t.word)}" x-content="${t.word}"\\*\\w w${k + 1}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`;
      });
      lines.push(`\\v ${v} ${words.join(' ')}`);
    }
    const usfm = lines.join('\n');
    expect(isUwAligned(usfm)).toBe(true);
    const same = remapAligned(usfm, 'RUT', uhb, uhb, identity, { strict: true });
    expect(same.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(same.stats.kept).toBe(1294);
    const res = buildEditions({
      translation: 'ta-irv', book: 'RUT', testament: 'OT', aligned: { name: 'RUT.synthetic.usfm', text: usfm },
      tokens: { 'hbo-wlc': wlcFile, 'hbo-uhb': uhbFile }, sources: ['hbo-wlc', 'hbo-uhb'], sourceInfo: catalog.sources
    });
    expect(res.primary).toBe('hbo-uhb');
    expect(res.issues.filter((i) => i.level === 'error')).toEqual([]);
    const d = res.editions.find((e) => e.source === 'hbo-wlc')!;
    expect(d.result.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(d.remap!.kept).toBeGreaterThanOrEqual(Math.floor(1294 * 0.99));
  });
});
