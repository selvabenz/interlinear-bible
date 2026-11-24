/**
 * One aligned translation file → one published book per source text ("edition").
 *
 *  primary  the source the alignment was made against: detected from the milestones
 *           (unfoldingWord format → the testament's uW source, e.g. UGNT/UHB), or `alignedTo`
 *           in <BOOK>.meta.json, or the translation's first source. Built as made, with the
 *           semantic layer if there is one.
 *  derived  every other source of the testament that has token data. The alignment is remapped
 *           automatically through a token map (content/maps/<primary>__<other>/<BOOK>.json,
 *           regenerated when it is stale) and built without the semantic layer.
 *
 * Shared by scripts/build-content.ts and the in-app importer.
 */
import type { BookExtra, BuildResult, EditionInfo, Issue, SourceInfo, SourceWord, Testament } from './types';
import { buildBook, hashText, readSource, type InputFile } from './build';
import { buildMapFile, identity, isMapCurrent, mapLookup, remapAligned, type MapFile, type RemapStats } from './remap';

export { sourcesFor } from './sources';

const UW_MARKERS = /x-strong="[GH]\d{5}"|x-strong="[a-z]:H\d|x-morph="(?:Gr|He|Ar),/;

/** Is this aligned USFM in unfoldingWord (translationCore) format? */
export function isUwAligned(text: string): boolean {
  return UW_MARKERS.test(text);
}

export function detectPrimary(
  alignedText: string, candidates: string[], sourceInfo: SourceInfo[], alignedTo?: string
): string {
  if (alignedTo) return alignedTo;
  if (isUwAligned(alignedText)) {
    const uw = candidates.find((id) => sourceInfo.find((s) => s.id === id)?.format === 'uw' || /ugnt|uhb/.test(id));
    if (uw) return uw;
  }
  return candidates[0];
}

export const mapKey = (from: string, to: string) => `${from}__${to}`;

export { sourceIdOfTokens } from './sources';

export interface EditionsInput {
  translation: string;
  book: string;
  testament: Testament;
  aligned: InputFile;
  semantic?: InputFile;
  extra?: InputFile;
  /** token files by source id, for the testament's sources that have data */
  tokens: Record<string, InputFile>;
  /** source ids in catalog order */
  sources: string[];
  sourceInfo: SourceInfo[];
  /** stored maps by mapKey(from,to) */
  maps?: Record<string, MapFile | null | undefined>;
}

export interface EditionOut {
  source: string;
  primary: boolean;
  result: BuildResult;
  remap?: RemapStats;
}

export interface EditionsOut {
  primary: string;
  editions: EditionOut[];
  /** maps that were (re)generated because none was stored or it was stale */
  newMaps: Record<string, MapFile>;
  issues: Issue[];
}

export function buildEditions(input: EditionsInput): EditionsOut {
  const issues: Issue[] = [];
  let alignedTo: string | undefined;
  if (input.extra) {
    try {
      alignedTo = (JSON.parse(input.extra.text.replace(/^﻿/, '')) as BookExtra & { alignedTo?: string }).alignedTo;
    } catch {
      /* buildBook reports invalid JSON */
    }
  }
  const available = input.sources.filter((s) => input.tokens[s]);
  const primary = detectPrimary(input.aligned.text, input.sources, input.sourceInfo, alignedTo);
  const out: EditionsOut = { primary, editions: [], newMaps: {}, issues };
  const pTok = input.tokens[primary];
  if (!pTok) {
    issues.push({
      level: 'error', code: 'source.missing', file: input.aligned.name,
      message: `${input.book} is aligned to ${primary}, but there is no ${primary} source-token file for it`
    });
    return out;
  }
  const label = (id: string) => input.sourceInfo.find((s) => s.id === id)?.shortName ?? id;
  const parsed = new Map<string, Map<string, SourceWord[]>>();
  const tokensOf = (id: string) => {
    let m = parsed.get(id);
    if (!m) {
      m = readSource(input.tokens[id], issues);
      parsed.set(id, m);
    }
    return m;
  };

  // ---------------------------------------------------------------- primary
  let alignedText = input.aligned.text;
  const uw = isUwAligned(alignedText);
  if (uw) {
    // translationCore files: normalise to canonical attributes; report unknown source words
    const P = tokensOf(primary);
    const r = remapAligned(alignedText, input.book, P, P, identity, { strict: true, file: input.aligned.name, label: label(primary) });
    issues.push(...r.issues.filter((i) => i.code !== 'remap.dropped'));
    alignedText = r.text;
  }
  const primaryEdition: EditionInfo = { primary: true };
  const pres = buildBook({
    translation: input.translation, source: primary, book: input.book,
    aligned: { name: input.aligned.name, text: alignedText }, semantic: input.semantic,
    sourceTokens: pTok, extra: input.extra, edition: primaryEdition, sharedSources: uw
  });
  out.editions.push({ source: primary, primary: true, result: pres });
  if (!pres.ok) return out;

  // ---------------------------------------------------------------- derived
  for (const other of available) {
    if (other === primary) continue;
    const key = mapKey(primary, other);
    const fromHash = hashText(pTok.text), toHash = hashText(input.tokens[other].text);
    let map = input.maps?.[key] ?? null;
    if (!isMapCurrent(map, fromHash, toHash)) {
      const fresh = buildMapFile(primary, other, input.book, tokensOf(primary), tokensOf(other), fromHash, toHash, map);
      if (map) {
        issues.push({ level: 'warning', code: 'map.stale', message: `${input.book}: stored map ${key} is out of date with the token files; regenerated (run npm run maps to store it)` });
      }
      map = fresh;
      out.newMaps[key] = fresh;
    }
    const r = remapAligned(alignedText, input.book, tokensOf(primary), tokensOf(other), mapLookup(map), {
      file: input.aligned.name, label: label(other)
    });
    const edition: EditionInfo = {
      primary: false, from: primary, kept: r.stats.kept, dropped: r.stats.dropped, crossVerse: r.stats.crossVerse,
      ...(pres.book?.hasSemantic ? { semanticOmitted: true } : {})
    };
    const res = buildBook({
      translation: input.translation, source: other, book: input.book,
      aligned: { name: `${input.aligned.name} → ${other}`, text: r.text },
      sourceTokens: input.tokens[other], extra: input.extra,
      passages: pres.book?.passages, edition, sharedSources: uw
    });
    res.issues.unshift(...r.issues.filter((i) => i.level !== 'error'));
    out.editions.push({ source: other, primary: false, result: res, remap: r.stats });
  }
  return out;
}
