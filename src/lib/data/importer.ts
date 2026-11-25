/**
 * Main-thread side of the importer: read files (and .zip archives), fill in source tokens from
 * the published data when only USFM is supplied, run the worker, export a content bundle.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { InputFile } from '../pipeline/build';
import type { Chapter, RawSource, RawSourceToken } from '../pipeline/types';
import { classifyFile } from '../pipeline/classify';
import { bookInfo } from '../pipeline/books';
import { sourcesFor, sourceIdOfTokens } from '../pipeline/sources';
import { formatMapFile, type MapFile } from '../pipeline/remap';
import { loadCatalog, chapterUrl, bookUrl } from './loader';
import type { WorkerRequest, WorkerResponse, WorkerBookResult } from '../import.worker';

const TEXT = /\.(usfm|sfm|json|txt)$/i;

export async function readFiles(list: FileList | File[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const f of Array.from(list)) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [name, data] of Object.entries(entries)) {
        if (!TEXT.test(name) || name.startsWith('__MACOSX')) continue;
        // keep folders in the name: grc-tr/JAS.json and grc-ugnt/JAS.json are different files
        out.push({ name: name.replace(/^content\/sources\//, ''), text: strFromU8(data) });
      }
    } else if (TEXT.test(f.name)) {
      out.push({ name: f.name, text: await f.text() });
    }
  }
  return out;
}

/** Rebuild one edition's source-token file from its published chapters (for USFM-only updates). */
export async function publishedSource(translation: string, book: string, source: string): Promise<InputFile | null> {
  try {
    const meta = await (await fetch(bookUrl(translation, book, source))).json();
    const raw: RawSource & { _meta?: unknown } = {};
    for (const { c } of meta.chapters as { c: number }[]) {
      const ch = (await (await fetch(chapterUrl(translation, book, source, c))).json()) as Chapter;
      for (const v of ch.verses) {
        raw[`${book}.${v.c}.${v.v}`] = v.s.map(
          (s): RawSourceToken => ({
            inst: String(s.i).padStart(2, '0'),
            word: s.w,
            translit: s.tr,
            gloss: s.gl,
            strong: s.ds ?? s.st,
            morph: s.mo,
            lemma: s.lm,
            lemma_gloss: s.lg,
            editions: s.ed,
            tr_only: s.trOnly ?? false,
            differs_from_na: s.vNA ?? false
          })
        );
      }
    }
    raw._meta = { book, source, from: 'published data' };
    return { name: `${book}.${source}.json ${PUBLISHED}`, text: JSON.stringify(raw) };
  } catch {
    return null;
  }
}

const PUBLISHED = '(from the published data)';
const BUNDLED = '(bundled with the app)';

/** The app's bundled word list of a book in a source text (data/library/<source>/<BOOK>.json). */
export async function bundledSource(book: string, source: string): Promise<InputFile | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/library/${source}/${book}.json`);
    if (!r.ok) return null;
    return { name: `${source}/${book}.json ${BUNDLED}`, text: await r.text() };
  } catch {
    return null;
  }
}

export async function runImport(files: InputFile[], translation: string): Promise<WorkerResponse> {
  const catalog = await loadCatalog().catch(() => null);
  const sources = catalog?.translations.find((t) => t.id === translation)?.sources ?? { NT: 'grc-tr', OT: 'hbo-wlc' };
  const sourceInfo = catalog?.sources ?? [];
  // source texts not supplied with the USFM: the published edition's tokens if the book is
  // published in that text, else the word list bundled with the app — so a USFM file is enough
  const roles = files.map((f) => classifyFile(f.name, f.text));
  const usfmBooks = new Set(roles.filter((r) => r.role === 'aligned' && r.book).map((r) => r.book!));
  const extra: InputFile[] = [];
  for (const b of usfmBooks) {
    const info = bookInfo(b);
    if (!info) continue;
    const ids = sourcesFor({ sources }, info.testament);
    const supplied = new Set(
      files.filter((_f, k) => roles[k].role === 'source' && roles[k].book === b).map((f) => sourceIdOfTokens(f.text, ids, sourceInfo))
    );
    for (const id of ids) {
      if (supplied.has(id)) continue;
      const published = catalog?.books.some((x) => x.translation === translation && x.id === b && x.source === id);
      const src = (published ? await publishedSource(translation, b, id) : null) ?? (await bundledSource(b, id));
      if (src) extra.push(src);
    }
  }
  const worker = new Worker(new URL('../import.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data as WorkerResponse);
      worker.onerror = (e) => reject(new Error(e.message || 'import worker failed'));
      const req: WorkerRequest = { files: [...files, ...extra], translation, sources, sourceInfo };
      worker.postMessage(req);
    });
  } finally {
    worker.terminate();
  }
}

/**
 * The repository files of an imported book (all editions): its USFM/meta under content/translations,
 * word lists the user supplied (bundled or published ones are already in the repository), and the
 * token maps (path → map, so a publisher can merge them with the repository's hand overrides).
 */
export function contentFiles(translation: string, r: WorkerBookResult): { files: Record<string, string>; maps: Record<string, MapFile> } {
  const files: Record<string, string> = {};
  for (const f of r.files) {
    if (f.role === 'source') {
      if (f.name.includes(PUBLISHED) || f.name.includes(BUNDLED)) continue; // already in the repo
      files[`content/sources/${f.source ?? r.sourceId}/${r.book}.json`] = f.text;
    } else if (f.role === 'aligned') files[`content/translations/${translation}/${r.book}.aligned.usfm`] = f.text;
    else if (f.role === 'semantic') files[`content/translations/${translation}/${r.book}.semantic.usfm`] = f.text;
    else if (f.role === 'meta') files[`content/translations/${translation}/${r.book}.meta.json`] = f.text;
  }
  const maps: Record<string, MapFile> = {};
  for (const [key, map] of Object.entries(r.maps ?? {})) maps[`content/maps/${key}/${r.book}.json`] = map;
  return { files, maps };
}

/** A zip laid out like the repository's content/ folder, ready to commit (all editions of the book). */
export function contentBundle(translation: string, r: WorkerBookResult): Blob {
  const c = contentFiles(translation, r);
  const files: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(c.files)) files[path] = strToU8(text);
  // token maps between the editions; hashes refer to the token files in the repo
  for (const [path, map] of Object.entries(c.maps)) files[path] = strToU8(formatMapFile(map));
  files['PUBLISHING.txt'] = strToU8(
    [
      `Content bundle for ${translation}/${r.book}, prepared by the Interlinear Bible importer on ${new Date().toISOString()}.`,
      '',
      'To publish for everyone:',
      '1. Copy the content/ folder of this zip over the content/ folder of the repository.',
      '2. Run `npm run content:check` (it must report 0 errors).',
      '3. Commit and push to main. GitHub Actions rebuilds and redeploys the site.',
      '',
      'See docs/CONTENT_GUIDE.md in the repository for details.'
    ].join('\n')
  );
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
