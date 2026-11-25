import type { Order } from '../data/model';

/** Transient UI state shared between routes (never saved). */
export const ui = $state<{
  /** a verse ("c:v") to scroll to once the reader has drawn it, e.g. after a reference search */
  scrollVerse: string | null;
}>({ scrollVerse: null });

/**
 * What the reader adds to the settings panel when it is opened from a book: the source-text
 * editions of that book and order labels named after its languages.
 */
export interface ReaderCtx {
  editions: string[];
  source: string;
  srcName: (id: string) => string;
  onsource: (id: string) => void;
  onorder: (o: Order) => void;
  targetLang: string;
  sourceLang: string;
  /** how this edition's alignment was made, when it was remapped from another source text */
  note?: string;
}
