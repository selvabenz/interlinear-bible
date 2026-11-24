/**
 * Main-thread side of the importer: read files (and .zip archives), fill in source tokens from
 * the published data when only USFM is supplied, run the worker, export a content bundle.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { InputFile } from '../pipeline/build';
import type { Chapter, RawSource, RawSourceToken } from '../pipeline/types';
import { classifyFile } from '../pipeline/classify';
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
        out.push({ name: name.split('/').pop()!, text: strFromU8(data) });
      }
    } else if (TEXT.test(f.name)) {
      out.push({ name: f.name, text: await f.text() });
    }
  }
  return out;
}

/** Rebuild a book's source-token file from its published chapters (for USFM-only updates). */
export async function publishedSource(translation: string, book: string): Promise<InputFile | null> {
  try {
    const meta = await (await fetch(bookUrl(translation, book))).json();
    const raw: RawSource = {};
    for (const { c } of meta.chapters as { c: number }[]) {
      const ch = (await (await fetch(chapterUrl(translation, book, c))).json()) as Chapter;
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
    return { name: `${book}.json (from the published data)`, text: JSON.stringify(raw) };
  } catch {
    return null;
  }
}

export async function runImport(files: InputFile[], translation: string): Promise<WorkerResponse> {
  const catalog = await loadCatalog().catch(() => null);
  const sources = catalog?.translations.find((t) => t.id === translation)?.sources ?? { NT: 'grc-tr', OT: 'hbo-wlc' };
  // books given as USFM without source tokens: reuse the published source text when there is one
  const roles = files.map((f) => classifyFile(f.name, f.text));
  const usfmBooks = new Set(roles.filter((r) => r.role === 'aligned' && r.book).map((r) => r.book!));
  const srcBooks = new Set(roles.filter((r) => r.role === 'source' && r.book).map((r) => r.book!));
  const extra: InputFile[] = [];
  for (const b of usfmBooks) {
    if (srcBooks.has(b)) continue;
    if (!catalog?.books.some((x) => x.translation === translation && x.id === b)) continue;
    const src = await publishedSource(translation, b);
    if (src) extra.push(src);
  }
  const worker = new Worker(new URL('../import.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data as WorkerResponse);
      worker.onerror = (e) => reject(new Error(e.message || 'import worker failed'));
      const req: WorkerRequest = { files: [...files, ...extra], translation, sources };
      worker.postMessage(req);
    });
  } finally {
    worker.terminate();
  }
}

/** A zip laid out like the repository's content/ folder, ready to commit. */
export function contentBundle(translation: string, r: WorkerBookResult): Blob {
  const files: Record<string, Uint8Array> = {};
  for (const f of r.files) {
    if (f.role === 'source') {
      if (f.name.includes('(from the published data)')) continue; // already in the repo
      files[`content/sources/${r.sourceId}/${r.book}.json`] = strToU8(f.text);
    } else if (f.role === 'aligned') files[`content/translations/${translation}/${r.book}.aligned.usfm`] = strToU8(f.text);
    else if (f.role === 'semantic') files[`content/translations/${translation}/${r.book}.semantic.usfm`] = strToU8(f.text);
    else if (f.role === 'meta') files[`content/translations/${translation}/${r.book}.meta.json`] = strToU8(f.text);
  }
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
