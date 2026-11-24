/**
 * Word-form normalisation and source-token lookup shared by the build (\zaln → token) and the
 * remap engine (token ⇄ token across editions).
 */
import type { SourceWord } from './types';
import { normStrong } from './strong';

/** Remove punctuation, spaces and symbols (also apostrophes such as ᾽ ’). */
export function stripPunct(s: string): string {
  return s.replace(/[\p{P}\p{Z}\p{S}⁠‍‌/]/gu, '');
}

// Hebrew cantillation (U+0591–U+05AF), meteg (U+05BD), paseq / sof pasuq / maqaf
const HEB_ACCENTS = /[֑-ֽ֯׀׃־]/g;

/**
 * Comparable form: NFC, punctuation/joiners removed, Hebrew accents removed, Greek grave →
 * acute (a context accent), lower case. Two editions printing the same word agree on this.
 */
export function normForm(s: string): string {
  let t = s.normalize('NFD').replace(HEB_ACCENTS, '').replace(/̀/g, '́');
  t = stripPunct(t);
  return t.normalize('NFC').toLowerCase();
}

/** Diacritic-free form: catches spelling variants (ἀλαζονεία / ἀλαζονία, plene / defective). */
export function bareForm(s: string): string {
  // Hebrew: also ignore vowel letters (vav/yod) after the first letter — plene vs defective spelling
  return normForm(s).normalize('NFD').replace(/\p{Mn}/gu, '').replace(/(?<=.)[וי]/g, '');
}

/**
 * Find the occ-th token in a verse for a \zaln-s (x-content + x-occurrence), falling back to
 * Strong's. `how` tells which test matched.
 */
export function findSourceToken(
  list: SourceWord[] | undefined,
  content: string | undefined,
  strong: string | undefined,
  occ: number
): { tok: SourceWord; how: 'content' | 'strong' } | null {
  if (!list) return null;
  if (content) {
    for (const norm of [(s: string) => s, stripPunct, normForm]) {
      const key = norm(content);
      let n = 0;
      for (const t of list) if (norm(t.w) === key && ++n === occ) return { tok: t, how: 'content' };
    }
  }
  if (strong) {
    const st = normStrong(strong);
    let n = 0;
    for (const t of list) if (normStrong(t.st) === st && ++n === occ) return { tok: t, how: 'strong' };
  }
  return null;
}

/**
 * x-occurrence / x-occurrences for a token, written with x-content = stripPunct(tok.w): the
 * occurrence is the one findSourceToken resolves back to this very token.
 */
export function occurrenceOf(list: SourceWord[], tok: SourceWord): [number, number] {
  const content = stripPunct(tok.w);
  const n = list.filter((t) => stripPunct(t.w) === content).length;
  for (let k = 1; k <= n; k++) if (findSourceToken(list, content, undefined, k)?.tok === tok) return [k, n];
  return [1, n];
}
