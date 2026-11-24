/**
 * npm run content          validate content/ and write public/data/
 * npm run content:check    validate only; exit 1 on any error
 *   --strict               also fail when a stored map (content/maps) is missing or out of date (CI)
 *
 * content/
 *   catalog.json                         translations + source texts (per testament, default first)
 *   sources/<sourceId>/<BOOK>.json       source tokens (npm run sources)
 *   maps/<from>__<to>/<BOOK>.json        token maps between editions (npm run maps)
 *   translations/<translationId>/*.usfm  aligned (\zaln) and optional semantic (\zsem) USFM,
 *                                        any file names; the book comes from \id
 *   translations/<translationId>/<BOOK>.meta.json   optional passage labels / alignedTo
 *
 * Each book is published once per source text that has token data:
 *   public/data/<translation>/<BOOK>/<source>/book.json, <c>.json
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildEditions, mapKey, sourcesFor } from '../src/lib/pipeline/editions';
import type { Catalog, CatalogBook, Issue } from '../src/lib/pipeline/types';
import { bookInfo } from '../src/lib/pipeline/books';
import { ROOT, input, loadCatalog, loadMap, rel, scanTranslation, tokenFiles, tokenPath, type ScanIssue } from './content-index';

const OUT = join(ROOT, 'public', 'data');
const check = process.argv.includes('--check');
const strict = process.argv.includes('--strict');

const cat = loadCatalog();
const books: CatalogBook[] = [];
let errors = 0;
let warnings = 0;

function report(book: string, issues: Issue[]) {
  for (const i of issues) {
    if (i.level === 'info') continue;
    const level = strict && i.code === 'map.stale' ? 'error' : i.level;
    if (level === 'error') errors++;
    else warnings++;
    const where = [i.file, i.ref].filter(Boolean).join(' ');
    console.log(`  ${level === 'error' ? '✗' : '!'} [${book}] ${i.code}: ${i.message}${where ? `  (${where})` : ''}`);
  }
}

if (!check) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

for (const tr of cat.translations) {
  const scan: ScanIssue[] = [];
  const byBook = scanTranslation(tr.id, scan);
  for (const s of scan) {
    if (s.level === 'error') errors++;
    else warnings++;
    console.log(`  ${s.level === 'error' ? '✗' : '!'} ${s.message}`);
  }
  if (!byBook.size) console.log(`- ${tr.id}: no books in content/translations/${tr.id}`);

  for (const [bookId, files] of byBook) {
    const info = bookInfo(bookId);
    if (!info) continue;
    if (!files.aligned) {
      console.log(`  ✗ [${bookId}] no aligned (\\zaln) USFM file in content/translations/${tr.id}`);
      errors++;
      continue;
    }
    const sources = sourcesFor(tr, info.testament);
    const tokens = tokenFiles(sources, bookId);
    if (!Object.keys(tokens).length) {
      console.log(`  ✗ [${bookId}] missing source tokens ${rel(tokenPath(sources[0], bookId))} (npm run sources -- ${bookId})`);
      errors++;
      continue;
    }
    const maps: Record<string, ReturnType<typeof loadMap>> = {};
    for (const a of sources) for (const b of sources) if (a !== b) maps[mapKey(a, b)] = loadMap(mapKey(a, b), bookId);

    const res = buildEditions({
      translation: tr.id, book: bookId, testament: info.testament,
      aligned: input(files.aligned)!, semantic: input(files.semantic), extra: input(files.meta),
      tokens, sources, sourceInfo: cat.sources, maps
    });
    report(bookId, res.issues);
    for (const key of Object.keys(res.newMaps)) {
      if (!maps[key]) {
        const msg = `no stored map content/maps/${key}/${bookId}.json — computed for this build (run npm run maps to store it)`;
        if (strict) { errors++; console.log(`  ✗ [${bookId}] map.missing: ${msg}`); }
        else { warnings++; console.log(`  ! [${bookId}] map.missing: ${msg}`); }
      }
    }
    for (const ed of res.editions) {
      const r = ed.result;
      report(`${bookId}/${ed.source}`, r.issues);
      if (!r.ok || !r.book || !r.chapters) {
        console.log(`- ${tr.id}/${bookId} [${ed.source}]: NOT built`);
        continue;
      }
      const b = r.book;
      books.push({
        id: b.id, translation: tr.id, source: ed.source, edition: b.edition,
        name: { en: b.name.en, native: b.name.native }, testament: b.testament,
        order: b.order, chapters: b.chapters.length, verses: b.stats.verses, hasSemantic: b.hasSemantic,
        hash: b.hash, findings: b.stats.findings, units: b.stats.units
      });
      const s = b.stats;
      const how = ed.primary ? 'primary' : `remapped from ${ed.remap ? `${res.primary}: ${ed.remap.kept} kept, ${ed.remap.dropped} dropped, ${ed.remap.crossVerse} cross-verse` : res.primary}`;
      console.log(`- ${tr.id}/${bookId} [${ed.source}, ${how}]: ${s.verses} verses · ${s.sourceWords} source / ${s.targetWords} target words · ${s.groups} groups · ${s.units} units · ${s.findings} findings`);
      if (check) continue;
      const bdir = join(OUT, tr.id, bookId, ed.source);
      mkdirSync(bdir, { recursive: true });
      writeFileSync(join(bdir, 'book.json'), JSON.stringify(b));
      for (const ch of r.chapters) writeFileSync(join(bdir, `${ch.c}.json`), JSON.stringify(ch));
    }
  }
}

books.sort((a, b) => a.translation.localeCompare(b.translation) || a.order - b.order || Number(!!b.edition?.primary) - Number(!!a.edition?.primary));
const catalog: Catalog = { version: 2, builtAt: new Date().toISOString(), translations: cat.translations, sources: cat.sources, books };
if (!check) writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`${books.length} edition(s) ${check ? 'validated' : 'written to public/data'} · ${errors} error(s) · ${warnings} warning(s)`);
if (errors) process.exit(1);
