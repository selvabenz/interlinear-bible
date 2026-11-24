/// <reference lib="webworker" />
/**
 * Runs the content pipeline off the main thread for the in-app importer.
 * Same code as `npm run content`, so a book that passes here passes in CI: one aligned file
 * becomes one book per source text (the alignment's own, plus automatically remapped ones).
 */
import type { InputFile } from './pipeline/build';
import { classifyFile, type FileRole } from './pipeline/classify';
import { bookInfo } from './pipeline/books';
import { buildEditions } from './pipeline/editions';
import { sourceIdOfTokens, sourcesFor } from './pipeline/sources';
import type { MapFile } from './pipeline/remap';
import type { BuildResult, SourceInfo, TranslationInfo } from './pipeline/types';

export interface WorkerRequest {
  files: InputFile[];
  translation: string;
  sources: TranslationInfo['sources'];
  sourceInfo: SourceInfo[];
}

export interface BookFiles {
  aligned?: InputFile;
  semantic?: InputFile;
  meta?: InputFile;
  /** token files by source id */
  sources: Record<string, InputFile>;
}

export interface WorkerBookResult {
  book: string;
  sourceId: string;
  primary: boolean;
  /** the source the alignment was made against */
  alignedTo: string;
  result: BuildResult;
  files: { name: string; role: FileRole; text: string; source?: string }[];
  /** token maps computed for this book (content/maps/<key>/<BOOK>.json) */
  maps: Record<string, MapFile>;
}

export interface WorkerResponse {
  classified: { name: string; role: FileRole; book?: string; reason: string }[];
  books: WorkerBookResult[];
  missing: { book: string; need: string[] }[];
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { files, translation, sources, sourceInfo } = e.data;
  const classified = files.map((f) => ({ name: f.name, ...classifyFile(f.name, f.text) }));
  const byBook = new Map<string, BookFiles>();
  classified.forEach((c, k) => {
    if (c.role === 'unknown' || !c.book) return;
    const slot = byBook.get(c.book) ?? { sources: {} };
    if (c.role === 'source') {
      const info = bookInfo(c.book);
      const ids = sourcesFor({ sources }, info?.testament ?? 'NT');
      slot.sources[sourceIdOfTokens(files[k].text, ids, sourceInfo)] = files[k];
    } else {
      slot[c.role] = files[k];
    }
    byBook.set(c.book, slot);
  });
  const books: WorkerBookResult[] = [];
  const missing: { book: string; need: string[] }[] = [];
  for (const [book, f] of byBook) {
    const info = bookInfo(book);
    if (!f.aligned || !info) {
      if (!f.aligned && (f.semantic || f.meta)) missing.push({ book, need: ['aligned USFM (\\zaln)'] });
      continue;
    }
    if (!Object.keys(f.sources).length) {
      missing.push({ book, need: ['source tokens (.json)'] });
      continue;
    }
    const ids = sourcesFor({ sources }, info.testament);
    const out = buildEditions({
      translation, book, testament: info.testament, aligned: f.aligned, semantic: f.semantic, extra: f.meta,
      tokens: f.sources, sources: ids, sourceInfo
    });
    if (!out.editions.length) {
      const need = out.issues.filter((i) => i.level === 'error').map((i) => i.message);
      missing.push({ book, need: need.length ? need : ['source tokens (.json)'] });
      continue;
    }
    const kept: WorkerBookResult['files'] = (['aligned', 'semantic', 'meta'] as const)
      .filter((r) => f[r])
      .map((r) => ({ name: f[r]!.name, role: r as FileRole, text: f[r]!.text }));
    for (const [id, file] of Object.entries(f.sources)) kept.push({ name: file.name, role: 'source', text: file.text, source: id });
    for (const ed of out.editions) {
      // issues found while preparing the aligned file belong to the primary edition
      const result: BuildResult = ed.primary
        ? { ...ed.result, issues: [...out.issues, ...ed.result.issues], ok: ed.result.ok && !out.issues.some((i) => i.level === 'error') }
        : ed.result;
      books.push({ book, sourceId: ed.source, primary: ed.primary, alignedTo: out.primary, result, files: kept, maps: out.newMaps });
    }
  }
  const res: WorkerResponse = { classified, books, missing };
  (self as unknown as Worker).postMessage(res);
};
