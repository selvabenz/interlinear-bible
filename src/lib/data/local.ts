/**
 * Books imported in this browser (IndexedDB via idb-keyval). They override the published copy
 * of the same translation/book so people can preview an update before publishing it.
 */
import { get, set, del, keys } from 'idb-keyval';
import type { BookMeta, Chapter } from '../pipeline/types';

export interface LocalBook {
  book: BookMeta;
  chapters: Chapter[];
  /** the raw input files, so a content bundle can be exported for publishing */
  files: { name: string; role: string; text: string }[];
  importedAt: string;
}

// One entry per edition: book:<translation>/<BOOK>/<source>. Entries saved before editions
// existed (book:<translation>/<BOOK>) are still read, as the edition their meta names.
const key = (translation: string, book: string, source: string) => `book:${translation}/${book}/${source}`;
const legacyKey = (translation: string, book: string) => `book:${translation}/${book}`;

export async function saveLocalBook(lb: LocalBook): Promise<void> {
  lb.book.local = true;
  await set(key(lb.book.translation, lb.book.id, lb.book.source), lb);
  const old = await get<LocalBook>(legacyKey(lb.book.translation, lb.book.id)).catch(() => undefined);
  if (old?.book.source === lb.book.source) await del(legacyKey(lb.book.translation, lb.book.id));
}

export async function getLocalBook(translation: string, book: string, source: string): Promise<LocalBook | undefined> {
  try {
    const lb = await get<LocalBook>(key(translation, book, source));
    if (lb) return lb;
    const old = await get<LocalBook>(legacyKey(translation, book));
    return old?.book.source === source ? old : undefined;
  } catch {
    return undefined;
  }
}

/** Remove local copies: one edition, or every edition of the book. */
export async function deleteLocalBook(translation: string, book: string, source?: string): Promise<void> {
  const base = legacyKey(translation, book);
  for (const k of await keys()) {
    if (typeof k !== 'string') continue;
    if (k === base) {
      const old = await get<LocalBook>(k);
      if (!source || old?.book.source === source) await del(k);
    } else if (source ? k === key(translation, book, source) : k.startsWith(`${base}/`)) {
      await del(k);
    }
  }
}

export async function listLocalBooks(): Promise<BookMeta[]> {
  try {
    const ks = (await keys()).filter((k) => typeof k === 'string' && k.startsWith('book:')) as string[];
    const out: BookMeta[] = [];
    for (const k of ks) {
      const lb = await get<LocalBook>(k);
      if (lb) out.push(lb.book);
    }
    return out;
  } catch {
    return [];
  }
}
