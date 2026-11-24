/**
 * Work out what an input file is, from its name and content, so people can drop in files
 * with their own naming (e.g. Paratext's 58PHMIRVTam.aligned.usfm).
 */
import { normaliseBookId } from './books';

export type FileRole = 'aligned' | 'semantic' | 'source' | 'meta' | 'unknown';

export interface Classified {
  role: FileRole;
  book?: string;
  reason: string;
}

export function classifyFile(name: string, text: string): Classified {
  const head = text.slice(0, 4000).replace(/^﻿/, '');
  if (/^\s*\\id\s/.test(head) || /\\c\s+\d/.test(head)) {
    const id = /\\id\s+(\S+)/.exec(head)?.[1];
    const book = id ? normaliseBookId(id) : undefined;
    const hasZaln = text.includes('\\zaln-s');
    const hasZsem = text.includes('\\zsem-');
    if (hasZsem && (!hasZaln || /semantic/i.test(name))) return { role: 'semantic', book, reason: 'USFM with \\zsem semantic units' };
    if (hasZaln) return { role: 'aligned', book, reason: 'USFM with \\zaln word alignment' };
    return { role: 'unknown', book, reason: 'USFM without alignment markers (\\zaln)' };
  }
  if (/^\s*[{[]/.test(head)) {
    try {
      const j = JSON.parse(text.replace(/^﻿/, ''));
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        if ('passages' in j || 'unitLabels' in j || 'alignedTo' in j) {
          const book = /([1-3]?[A-Za-z]{2,4})\.meta\.json$/i.exec(name)?.[1];
          return { role: 'meta', book: book ? normaliseBookId(book) : undefined, reason: 'Book metadata (passage labels)' };
        }
        if (j._format === 'ib-tokens-1' && j._meta?.book) {
          return { role: 'source', book: normaliseBookId(String(j._meta.book)), reason: 'Source-text tokens (bundled word list)' };
        }
        const keys = Object.keys(j).filter((k) => !k.startsWith('_'));
        const m = keys.length ? /^([1-3]?[A-Za-z]+)[.\s]\d+[.:]\d+$/.exec(keys[0]) : null;
        if (m && Array.isArray(j[keys[0]])) return { role: 'source', book: normaliseBookId(m[1]), reason: 'Source-text tokens keyed by verse' };
      }
    } catch {
      return { role: 'unknown', reason: 'JSON that could not be parsed' };
    }
  }
  return { role: 'unknown', reason: 'Not USFM or a recognised JSON file' };
}
