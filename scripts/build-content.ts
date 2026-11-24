/**
 * npm run content          validate content/ and write public/data/
 * npm run content:check    validate only; exit 1 on any error
 *
 * content/
 *   catalog.json                         translations + source texts
 *   sources/<sourceId>/<BOOK>.json       source tokens (STEPBible TAGNT/TAHOT shape)
 *   translations/<translationId>/*.usfm  aligned (\zaln) and optional semantic (\zsem) USFM,
 *                                        any file names; the book comes from \id
 *   translations/<translationId>/<BOOK>.meta.json   optional passage labels
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook } from '../src/lib/pipeline/build';
import { classifyFile } from '../src/lib/pipeline/classify';
import type { Catalog, CatalogBook, Issue, SourceInfo, TranslationInfo } from '../src/lib/pipeline/types';
import { bookInfo } from '../src/lib/pipeline/books';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'public', 'data');
const check = process.argv.includes('--check');

const read = (p: string) => readFileSync(p, 'utf8');
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

const cat = JSON.parse(read(join(CONTENT, 'catalog.json'))) as { translations: TranslationInfo[]; sources: SourceInfo[] };
const books: CatalogBook[] = [];
let errors = 0;
let warnings = 0;

function report(book: string, issues: Issue[]) {
  for (const i of issues) {
    if (i.level === 'info') continue;
    if (i.level === 'error') errors++;
    else warnings++;
    const where = [i.file, i.ref].filter(Boolean).join(' ');
    console.log(`  ${i.level === 'error' ? '✗' : '!'} [${book}] ${i.code}: ${i.message}${where ? `  (${where})` : ''}`);
  }
}

if (!check) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

for (const tr of cat.translations) {
  const dir = join(CONTENT, 'translations', tr.id);
  if (!existsSync(dir)) {
    console.log(`- ${tr.id}: no folder ${rel(dir)} yet`);
    continue;
  }
  // group files by book
  const byBook = new Map<string, { aligned?: string; semantic?: string; meta?: string }>();
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const c = classifyFile(f, read(p));
    if (c.role === 'unknown' || !c.book) {
      console.log(`  ! [${tr.id}] ${f}: skipped — ${c.reason}`);
      warnings++;
      continue;
    }
    const slot = byBook.get(c.book) ?? {};
    if (c.role === 'aligned' || c.role === 'semantic' || c.role === 'meta') {
      if (slot[c.role]) {
        console.log(`  ✗ [${c.book}] two ${c.role} files: ${rel(slot[c.role]!)} and ${rel(p)}`);
        errors++;
      }
      slot[c.role] = p;
    }
    byBook.set(c.book, slot);
  }
  for (const [bookId, files] of byBook) {
    const info = bookInfo(bookId);
    if (!files.aligned) {
      console.log(`  ✗ [${bookId}] no aligned (\\zaln) USFM file in ${rel(dir)}`);
      errors++;
      continue;
    }
    const sourceId = info ? tr.sources[info.testament] : undefined;
    const srcPath = sourceId ? join(CONTENT, 'sources', sourceId, `${bookId}.json`) : '';
    if (!sourceId || !existsSync(srcPath)) {
      console.log(`  ✗ [${bookId}] missing source tokens ${srcPath ? rel(srcPath) : '(no source text configured for this testament)'}`);
      errors++;
      continue;
    }
    const f = (p?: string) => (p ? { name: rel(p), text: read(p) } : undefined);
    const res = buildBook({
      translation: tr.id,
      source: sourceId,
      aligned: f(files.aligned)!,
      semantic: f(files.semantic),
      sourceTokens: f(srcPath)!,
      extra: f(files.meta),
      book: bookId
    });
    report(bookId, res.issues);
    if (!res.ok || !res.book || !res.chapters) {
      console.log(`- ${tr.id}/${bookId}: NOT built`);
      continue;
    }
    const b = res.book;
    books.push({
      id: b.id, translation: tr.id, name: { en: b.name.en, native: b.name.native }, testament: b.testament,
      order: b.order, chapters: b.chapters.length, verses: b.stats.verses, hasSemantic: b.hasSemantic,
      hash: b.hash, findings: b.stats.findings, units: b.stats.units
    });
    const s = b.stats;
    console.log(`- ${tr.id}/${bookId}: ${s.verses} verses · ${s.sourceWords} source / ${s.targetWords} target words · ${s.groups} groups · ${s.units} units · ${s.findings} findings`);
    if (check) continue;
    const bdir = join(OUT, tr.id, bookId);
    mkdirSync(bdir, { recursive: true });
    writeFileSync(join(bdir, 'book.json'), JSON.stringify(b));
    for (const ch of res.chapters) writeFileSync(join(bdir, `${ch.c}.json`), JSON.stringify(ch));
  }
}

books.sort((a, b) => a.translation.localeCompare(b.translation) || a.order - b.order);
const catalog: Catalog = { version: 1, builtAt: new Date().toISOString(), translations: cat.translations, sources: cat.sources, books };
if (!check) writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`${books.length} book(s) ${check ? 'validated' : 'written to public/data'} · ${errors} error(s) · ${warnings} warning(s)`);
if (errors) process.exit(1);
