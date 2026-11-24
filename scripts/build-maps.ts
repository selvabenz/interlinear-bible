/**
 * npm run maps — the remap "database": content/maps/<from>__<to>/<BOOK>.json
 *
 * For every book in content/translations, the alignment's own source (primary) is mapped token
 * by token to each other source text of the testament that has token data. A map is rewritten
 * only when a token file changed (its hashes no longer match); hand-made `overrides` are kept.
 */
import { pathToFileURL } from 'node:url';
import { hashText } from '../src/lib/pipeline/build';
import { buildMapFile, isMapCurrent } from '../src/lib/pipeline/remap';
import { detectPrimary, mapKey } from '../src/lib/pipeline/editions';
import { readSource } from '../src/lib/pipeline/build';
import {
  input, loadCatalog, loadMap, rel, scanTranslation, sourcesFor, testamentOf, tokenFiles, writeMap, type ScanIssue
} from './content-index';

export function refreshMaps(force = false): { written: number; current: number } {
  const cat = loadCatalog();
  let written = 0, current = 0;
  const issues: ScanIssue[] = [];
  for (const tr of cat.translations) {
    for (const [book, files] of scanTranslation(tr.id, issues)) {
      const testament = testamentOf(book);
      if (!testament || !files.aligned) continue;
      const sources = sourcesFor(tr, testament);
      const tokens = tokenFiles(sources, book);
      let alignedTo: string | undefined;
      if (files.meta) alignedTo = (JSON.parse(input(files.meta)!.text) as { alignedTo?: string }).alignedTo;
      const primary = detectPrimary(input(files.aligned)!.text, sources, cat.sources, alignedTo);
      if (!tokens[primary]) continue;
      for (const other of Object.keys(tokens)) {
        if (other === primary) continue;
        const key = mapKey(primary, other);
        const fromHash = hashText(tokens[primary].text), toHash = hashText(tokens[other].text);
        const old = loadMap(key, book);
        if (!force && isMapCurrent(old, fromHash, toHash)) {
          current++;
          continue;
        }
        const map = buildMapFile(primary, other, book, readSource(tokens[primary], []), readSource(tokens[other], []), fromHash, toHash, old);
        const p = writeMap(map);
        const s = map.stats;
        console.log(`  map ${rel(p)}: ${s.exact} exact · ${s.spelling} spelling · ${s.lexical} lexical · ${s.unmatchedFrom} ${primary}-only · ${s.unmatchedTo} ${other}-only${Object.keys(map.overrides).length ? ` · ${Object.keys(map.overrides).length} override(s) kept` : ''}`);
        written++;
      }
    }
  }
  for (const i of issues) if (i.level === 'error') console.log(`  ✗ ${i.message}`);
  console.log(`maps: ${written} written, ${current} up to date`);
  return { written, current };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) refreshMaps(process.argv.includes('--force'));
