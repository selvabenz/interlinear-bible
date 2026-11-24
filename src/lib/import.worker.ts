/// <reference lib="webworker" />
/**
 * Runs the content pipeline off the main thread for the in-app importer.
 * Same code as `npm run content`, so a book that passes here passes in CI.
 */
import { buildBook, type InputFile } from './pipeline/build';
import { classifyFile, type FileRole } from './pipeline/classify';
import { bookInfo } from './pipeline/books';
import type { BuildResult } from './pipeline/types';

export interface WorkerRequest {
  files: InputFile[];
  translation: string;
  sources: { NT?: string; OT?: string };
}

export interface BookFiles {
  aligned?: InputFile;
  semantic?: InputFile;
  source?: InputFile;
  meta?: InputFile;
}

export interface WorkerBookResult {
  book: string;
  sourceId: string;
  result: BuildResult;
  files: { name: string; role: FileRole; text: string }[];
}

export interface WorkerResponse {
  classified: { name: string; role: FileRole; book?: string; reason: string }[];
  books: WorkerBookResult[];
  missing: { book: string; need: string[] }[];
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { files, translation, sources } = e.data;
  const classified = files.map((f) => ({ name: f.name, ...classifyFile(f.name, f.text) }));
  const byBook = new Map<string, BookFiles>();
  classified.forEach((c, k) => {
    if (c.role === 'unknown' || !c.book) return;
    const slot = byBook.get(c.book) ?? {};
    slot[c.role] = files[k];
    byBook.set(c.book, slot);
  });
  const books: WorkerBookResult[] = [];
  const missing: { book: string; need: string[] }[] = [];
  for (const [book, f] of byBook) {
    const need: string[] = [];
    if (!f.aligned) need.push('aligned USFM (\\zaln)');
    if (!f.source) need.push('source tokens (.json)');
    if (need.length) {
      missing.push({ book, need });
      continue;
    }
    const info = bookInfo(book);
    const sourceId = (info && sources[info.testament]) || (info?.testament === 'OT' ? 'hbo-wlc' : 'grc-tr');
    const result = buildBook({ translation, source: sourceId, aligned: f.aligned!, semantic: f.semantic, sourceTokens: f.source!, extra: f.meta, book });
    const kept = (['aligned', 'semantic', 'source', 'meta'] as const)
      .filter((r) => f[r])
      .map((r) => ({ name: f[r]!.name, role: r as FileRole, text: f[r]!.text }));
    books.push({ book, sourceId, result, files: kept });
  }
  const res: WorkerResponse = { classified, books, missing };
  (self as unknown as Worker).postMessage(res);
};
