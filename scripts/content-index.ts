/** Reading content/: catalog, aligned/semantic/meta files per book, source tokens and maps. */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFile } from '../src/lib/pipeline/classify';
import { bookInfo } from '../src/lib/pipeline/books';
import { sourcesFor } from '../src/lib/pipeline/editions';
import { formatMapFile, type MapFile } from '../src/lib/pipeline/remap';
import type { InputFile } from '../src/lib/pipeline/build';
import type { SourceInfo, Testament, TranslationInfo } from '../src/lib/pipeline/types';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CONTENT = join(ROOT, 'content');

export const read = (p: string) => readFileSync(p, 'utf8');
export const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');
export const input = (p?: string): InputFile | undefined => (p ? { name: rel(p), text: read(p) } : undefined);

export interface ContentCatalog { translations: TranslationInfo[]; sources: SourceInfo[] }
export const loadCatalog = (): ContentCatalog => JSON.parse(read(join(CONTENT, 'catalog.json')));

export interface BookFiles { aligned?: string; semantic?: string; meta?: string }
export interface ScanIssue { level: 'error' | 'warning'; message: string }

/** Group a translation folder's files by book. */
export function scanTranslation(trId: string, issues: ScanIssue[]): Map<string, BookFiles> {
  const dir = join(CONTENT, 'translations', trId);
  const byBook = new Map<string, BookFiles>();
  if (!existsSync(dir)) return byBook;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const c = classifyFile(f, read(p));
    if (c.role === 'unknown' || !c.book) {
      issues.push({ level: 'warning', message: `[${trId}] ${f}: skipped — ${c.reason}` });
      continue;
    }
    if (c.role !== 'aligned' && c.role !== 'semantic' && c.role !== 'meta') continue;
    const slot = byBook.get(c.book) ?? {};
    if (slot[c.role]) issues.push({ level: 'error', message: `[${c.book}] two ${c.role} files: ${rel(slot[c.role]!)} and ${rel(p)}` });
    slot[c.role] = p;
    byBook.set(c.book, slot);
  }
  return byBook;
}

export const tokenPath = (source: string, book: string) => join(CONTENT, 'sources', source, `${book}.json`);

/** Token files that exist for the given sources. */
export function tokenFiles(sources: string[], book: string): Record<string, InputFile> {
  const out: Record<string, InputFile> = {};
  for (const s of sources) {
    const p = tokenPath(s, book);
    if (existsSync(p)) out[s] = input(p)!;
  }
  return out;
}

export const mapPath = (key: string, book: string) => join(CONTENT, 'maps', key, `${book}.json`);

export function loadMap(key: string, book: string): MapFile | null {
  const p = mapPath(key, book);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(read(p)) as MapFile;
  } catch {
    return null;
  }
}

export function writeMap(map: MapFile): string {
  const p = mapPath(`${map.from}__${map.to}`, map.book);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, formatMapFile(map));
  return p;
}

export function testamentOf(book: string): Testament | undefined {
  return bookInfo(book)?.testament;
}
export { sourcesFor };
