/**
 * npm run sources -- <BOOK> [<BOOK> …] [--stepbible <dir>] [--tc <dir>] [--force] [--no-maps]
 *
 * Writes the source-token files of every source text the catalog lists for the book's testament:
 *   NT  content/sources/grc-tr/<BOOK>.json    Textus Receptus from STEPBible TAGNT
 *       content/sources/grc-ugnt/<BOOK>.json  UGNT from translationCore resources, glossed via TAGNT
 *   OT  content/sources/hbo-wlc/<BOOK>.json   Leningrad Codex from STEPBible TAHOT
 *       content/sources/hbo-uhb/<BOOK>.json   UHB from translationCore resources, glossed via TAHOT
 * then refreshes content/maps (npm run maps). Existing token files are kept (they may be curated,
 * like Philemon's pilot tokens) unless --force is given.
 *
 * Data folders: --stepbible / STEPBIBLE_DIR (STEPBible-Data checkout) and --tc / TC_RESOURCES
 * (translationCore's resources folder, e.g. ~/translationCore/resources).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookInfo, normaliseBookId } from '../../src/lib/pipeline/books';
import { readSource } from '../../src/lib/pipeline/build';
import { alignTokens } from '../../src/lib/pipeline/remap';
import type { SourceInfo, TranslationInfo } from '../../src/lib/pipeline/types';
import { sourcesFor } from '../../src/lib/pipeline/editions';
import { tagntAll, tahotAll, trTokens, wlcTokens, type RawBook } from './stepbible';
import { lexicon, translitGreek, uwTokens } from './uw';
import { refreshMaps } from '../build-maps';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CONTENT = join(ROOT, 'content');

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args.splice(k, 2)[1] : undefined;
};
const stepbible = opt('stepbible') ?? process.env.STEPBIBLE_DIR;
const tc = opt('tc') ?? process.env.TC_RESOURCES;
const noMaps = args.includes('--no-maps');
const force = args.includes('--force');
const books = args.filter((a) => !a.startsWith('--')).map(normaliseBookId);
if (!books.length || !stepbible || !tc) {
  console.error('usage: npm run sources -- <BOOK>… --stepbible <STEPBible-Data dir> --tc <translationCore resources dir>\n(or set STEPBIBLE_DIR and TC_RESOURCES)');
  process.exit(2);
}

const catalog = JSON.parse(readFileSync(join(CONTENT, 'catalog.json'), 'utf8')) as { translations: TranslationInfo[]; sources: SourceInfo[] };

const toMap = (raw: RawBook) => readSource({ name: 'raw', text: JSON.stringify(raw) }, []);

/** Fill translit/gloss/lemma gloss (and STEPBible morphology) of uW tokens from STEPBible. */
function enrich(uw: RawBook, step: RawBook, kind: 'grc' | 'hbo', gloss: (s: string) => string) {
  const U = toMap(uw), S = toMap(step);
  const { auto, stats } = alignTokens(U, S);
  const stepByKey = new Map<string, RawBook[string][number]>();
  for (const list of Object.values(step)) {
    for (const t of list) {
      const m = /(\d+)[.:](\d+)$/.exec(t.ref)!;
      stepByKey.set(`${+m[1]}:${+m[2]}#${parseInt(t.inst, 10)}`, t);
    }
  }
  const uwByKey = new Map<string, RawBook[string][number]>();
  for (const list of Object.values(uw)) {
    for (const t of list) {
      const m = /(\d+)[.:](\d+)$/.exec(t.ref)!;
      uwByKey.set(`${+m[1]}:${+m[2]}#${parseInt(t.inst, 10)}`, t);
    }
  }
  let fallback = 0;
  for (const [fk, tk, how] of auto) {
    const u = uwByKey.get(fk)!;
    const s = tk ? stepByKey.get(tk) : undefined;
    if (s && how !== 'none') {
      u.translit = s.translit;
      u.gloss = s.gloss;
      u.lemma_gloss = s.lemma_gloss;
      if (s.editions) u.editions = s.editions;
      if (how === 'exact' || how === 'spelling') u.morph = s.morph;
      u.step_match = how;
    } else {
      fallback++;
      u.gloss = gloss(u.strong);
      u.lemma_gloss = u.gloss;
      u.translit = kind === 'grc' ? translitGreek(u.word) : '';
    }
  }
  return { ...stats, fallback };
}

function write(source: string, book: string, raw: RawBook, header: Record<string, unknown>) {
  const dir = join(CONTENT, 'sources', source);
  mkdirSync(dir, { recursive: true });
  const n = Object.values(raw).reduce((s, l) => s + l.length, 0);
  // "_meta" is skipped by readSource (not a verse key)
  writeFileSync(join(dir, `${book}.json`), JSON.stringify({ ...raw, _meta: { book, source, ...header, tokens: n } }, null, 1) + '\n');
  console.log(`  ${source}/${book}.json  ${n} tokens`);
}

/** Should this source file be (re)written? */
function wants(source: string, book: string): boolean {
  const p = join(CONTENT, 'sources', source, `${book}.json`);
  if (existsSync(p) && !force) {
    console.log(`  ${source}/${book}.json exists — kept (use --force to regenerate)`);
    return false;
  }
  return true;
}

for (const book of books) {
  const info = bookInfo(book);
  if (!info) {
    console.error(`unknown book ${book}`);
    process.exitCode = 1;
    continue;
  }
  const wanted = new Set(catalog.translations.flatMap((t) => sourcesFor(t, info.testament)));
  console.log(`${book} (${info.testament}): ${[...wanted].join(', ')}`);
  const generatedAt = new Date().toISOString().slice(0, 10);
  if (info.testament === 'NT') {
    if (wanted.has('grc-tr') && wants('grc-tr', book)) write('grc-tr', book, trTokens(stepbible, book), { from: 'STEPBible TAGNT (TR readings)', generatedAt });
    if (wanted.has('grc-ugnt') && wants('grc-ugnt', book)) {
      const { version, tokens } = uwTokens(tc, 'ugnt', book);
      const st = enrich(tokens, tagntAll(stepbible, book), 'grc', lexicon(tc, 'ugl'));
      console.log(`  UGNT ${version}: glossed from TAGNT — ${st.exact} exact, ${st.spelling} spelling, ${st.lexical} lexical, ${st.fallback} from UGL`);
      write('grc-ugnt', book, tokens, { from: `unfoldingWord UGNT ${version}`, version, glosses: 'STEPBible TAGNT; UGL where unmatched', generatedAt });
    }
  } else {
    if (wanted.has('hbo-wlc') && wants('hbo-wlc', book)) write('hbo-wlc', book, wlcTokens(stepbible, book), { from: 'STEPBible TAHOT', generatedAt });
    if (wanted.has('hbo-uhb') && wants('hbo-uhb', book)) {
      const { version, tokens } = uwTokens(tc, 'uhb', book);
      const st = enrich(tokens, tahotAll(stepbible, book), 'hbo', lexicon(tc, 'uhl'));
      console.log(`  UHB ${version}: glossed from TAHOT — ${st.exact} exact, ${st.spelling} spelling, ${st.lexical} lexical, ${st.fallback} from UHL`);
      write('hbo-uhb', book, tokens, { from: `unfoldingWord UHB ${version}`, version, glosses: 'STEPBible TAHOT; UHL where unmatched', generatedAt });
    }
  }
}

if (!noMaps) refreshMaps();
