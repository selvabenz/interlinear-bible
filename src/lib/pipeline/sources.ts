/** Small helpers about source texts, kept apart from the build so the app shell stays light. */
import type { SourceInfo, Testament, TranslationInfo } from './types';

/** The ordered source ids of a translation for a testament ("NT": "grc-tr" or ["grc-tr","grc-ugnt"]). */
export function sourcesFor(tr: Pick<TranslationInfo, 'sources'> | undefined, testament: Testament): string[] {
  const v = tr?.sources?.[testament];
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list.length ? list : [testament === 'OT' ? 'hbo-wlc' : 'grc-tr'];
}

/**
 * Which source text a token file holds: its "_meta.source" (written by npm run sources), else
 * unfoldingWord-style tokens (uw_strong) → the uW source, else the default source.
 */
export function sourceIdOfTokens(text: string, candidates: string[], sourceInfo: SourceInfo[]): string {
  try {
    const j = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown> & { _meta?: { source?: string } };
    const declared = j._meta?.source;
    if (declared) return declared;
    const first = Object.entries(j).find(([k, v]) => !k.startsWith('_') && Array.isArray(v))?.[1] as Record<string, unknown>[] | undefined;
    const tok = first?.[0];
    if (tok && ('uw_strong' in tok || /^[GH]\d{5}$/.test(String(tok.strong ?? '')))) {
      const uw = candidates.find((id) => sourceInfo.find((s) => s.id === id)?.format === 'uw');
      if (uw) return uw;
    }
  } catch {
    /* reported by the build */
  }
  return candidates[0];
}
