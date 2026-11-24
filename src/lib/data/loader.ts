/**
 * Loads the catalog and books (published under <base>/data/, or imported locally) and keeps
 * a per-book cache of chapters. Chapters load on demand, so the same code serves a one-chapter
 * letter and a 150-chapter book. A book exists once per source-text edition:
 *   data/<translation>/<BOOK>/<source>/book.json, <c>.json
 */
import type { BookMeta, Catalog, CatalogBook, Chapter, SourceWord, TargetWord, Testament, Unit, Verse } from '../pipeline/types';
import { sourcesFor } from '../pipeline/sources';
import { getLocalBook } from './local';

const BASE = `${import.meta.env.BASE_URL}data/`;

let catalogPromise: Promise<Catalog> | null = null;

export function loadCatalog(force = false): Promise<Catalog> {
  if (!catalogPromise || force) {
    catalogPromise = fetch(`${BASE}catalog.json`, { cache: force ? 'no-cache' : 'default' })
      .then((r) => {
        if (!r.ok) throw new Error(`catalog ${r.status}`);
        return r.json() as Promise<Catalog>;
      })
      .catch((e) => {
        catalogPromise = null;
        throw e;
      });
  }
  return catalogPromise;
}

export function chapterUrl(translation: string, book: string, source: string, c: number): string {
  return `${BASE}${translation}/${book}/${source}/${c}.json`;
}
export function bookUrl(translation: string, book: string, source: string): string {
  return `${BASE}${translation}/${book}/${source}/book.json`;
}

/**
 * The source texts a book is available in, default edition first (the translation's catalog
 * order for the testament): published editions plus any imported in this browser.
 */
export function editionsOf(
  catalog: Catalog | null | undefined, translation: string, book: string, testament: Testament, local: BookMeta[] = []
): string[] {
  const tr = catalog?.translations.find((t) => t.id === translation);
  const order = sourcesFor(tr, testament);
  const have = new Set<string>([
    ...(catalog?.books ?? []).filter((b) => b.translation === translation && b.id === book).map((b) => b.source),
    ...local.filter((b) => b.translation === translation && b.id === book).map((b) => b.source)
  ]);
  const rank = (s: string) => (order.indexOf(s) < 0 ? 99 : order.indexOf(s));
  return [...have].sort((a, b) => rank(a) - rank(b));
}

/** The edition to open: the one asked for, else the reader's preferred one, else the default. */
export function pickEdition(available: string[], asked?: string, preferred?: string): string | undefined {
  if (asked && available.includes(asked)) return asked;
  if (preferred && available.includes(preferred)) return preferred;
  return available[0];
}

export function catalogEntry(catalog: Catalog | null | undefined, translation: string, book: string, source: string): CatalogBook | undefined {
  return catalog?.books.find((b) => b.translation === translation && b.id === book && b.source === source);
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** A loaded book with indexes over the chapters fetched so far. */
export class LoadedBook {
  readonly meta: BookMeta;
  readonly local: boolean;
  private chapters = new Map<number, Chapter>();
  private pending = new Map<number, Promise<Chapter>>();
  private verses = new Map<string, Verse>();
  private units = new Map<string, Unit>();

  constructor(meta: BookMeta, local: boolean, chapters: Chapter[] = []) {
    this.meta = meta;
    this.local = local;
    for (const c of chapters) this.add(c);
  }

  private add(ch: Chapter) {
    this.chapters.set(ch.c, ch);
    for (const v of ch.verses) this.verses.set(`${v.c}:${v.v}`, v);
    for (const u of ch.units) this.units.set(u.id, u);
  }

  hasChapter(c: number): boolean {
    return this.chapters.has(c);
  }

  async ensureChapters(cs: number[]): Promise<void> {
    const want = [...new Set(cs)].filter((c) => !this.chapters.has(c) && this.meta.chapters.some((x) => x.c === c));
    await Promise.all(
      want.map((c) => {
        let p = this.pending.get(c);
        if (!p) {
          p = getJson<Chapter>(chapterUrl(this.meta.translation, this.meta.id, this.meta.source, c)).then((ch) => {
            this.add(ch);
            this.pending.delete(c);
            return ch;
          });
          p.catch(() => this.pending.delete(c));
          this.pending.set(c, p);
        }
        return p;
      })
    );
  }

  async ensureAll(): Promise<void> {
    await this.ensureChapters(this.meta.chapters.map((c) => c.c));
  }

  verse(ref: string): Verse | undefined {
    return this.verses.get(ref);
  }
  unit(id: string | undefined): Unit | undefined {
    return id ? this.units.get(id) : undefined;
  }
  /** "c:v#i" */
  source(key: string): SourceWord | undefined {
    const [ref, i] = key.split('#');
    return this.verses.get(ref)?.s.find((t) => t.i === +i);
  }
  /** "c:v.n" */
  target(key: string): TargetWord | undefined {
    const dot = key.lastIndexOf('.');
    return this.verses.get(key.slice(0, dot))?.w[+key.slice(dot + 1) - 1];
  }
  allVerses(): Verse[] {
    return [...this.chapters.values()].sort((a, b) => a.c - b.c).flatMap((c) => c.verses);
  }
  unitsInRange(start: string, end: string): Unit[] {
    return [...this.units.values()].filter((u) => inRange(u.src, start, end));
  }
}

export function refParts(ref: string): [number, number] {
  const [c, v] = ref.split(':').map(Number);
  return [c, v];
}
export function compareRef(a: string, b: string): number {
  const [ac, av] = refParts(a), [bc, bv] = refParts(b);
  return ac - bc || av - bv;
}
export function inRange(ref: string, start: string, end: string): boolean {
  return compareRef(ref, start) >= 0 && compareRef(ref, end) <= 0;
}

const books = new Map<string, Promise<LoadedBook>>();

export function loadBook(translation: string, bookId: string, source: string, force = false): Promise<LoadedBook> {
  const k = `${translation}/${bookId}/${source}`;
  let p = books.get(k);
  if (!p || force) {
    p = (async () => {
      const local = await getLocalBook(translation, bookId, source);
      if (local) return new LoadedBook(local.book, true, local.chapters);
      const meta = await getJson<BookMeta>(bookUrl(translation, bookId, source));
      return new LoadedBook(meta, false);
    })();
    p.catch(() => books.delete(k));
    books.set(k, p);
  }
  return p;
}

/** Drop cached copies: one edition, or every edition of the book. */
export function forgetBook(translation: string, bookId: string, source?: string): void {
  for (const k of [...books.keys()]) {
    if (source ? k === `${translation}/${bookId}/${source}` : k.startsWith(`${translation}/${bookId}/`)) books.delete(k);
  }
}

/** Fetch every file of a published book so the service worker caches it for offline use. */
export async function saveForOffline(
  translation: string, bookId: string, source: string, chapters: number[], onProgress?: (done: number, total: number) => void
): Promise<void> {
  const urls = [bookUrl(translation, bookId, source), ...chapters.map((c) => chapterUrl(translation, bookId, source, c))];
  let done = 0;
  for (const u of urls) {
    const r = await fetch(u, { cache: 'reload' });
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    await r.arrayBuffer();
    onProgress?.(++done, urls.length);
  }
  try {
    localStorage.setItem(`ib-offline:${translation}/${bookId}/${source}`, new Date().toISOString());
  } catch {
    /* storage unavailable */
  }
}

export function isSavedOffline(translation: string, bookId: string, source: string): boolean {
  try {
    return !!localStorage.getItem(`ib-offline:${translation}/${bookId}/${source}`);
  } catch {
    return false;
  }
}
