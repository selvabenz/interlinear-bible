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

const key = (translation: string, book: string) => `book:${translation}/${book}`;

export async function saveLocalBook(lb: LocalBook): Promise<void> {
  lb.book.local = true;
  await set(key(lb.book.translation, lb.book.id), lb);
}

export async function getLocalBook(translation: string, book: string): Promise<LocalBook | undefined> {
  try {
    return await get<LocalBook>(key(translation, book));
  } catch {
    return undefined;
  }
}

export async function deleteLocalBook(translation: string, book: string): Promise<void> {
  await del(key(translation, book));
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
