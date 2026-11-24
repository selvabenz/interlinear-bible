/**
 * English verse layer from the ESV API (https://api.esv.org). The ESV text is © Crossway and is
 * not published with this site; each reader supplies their own API key in Settings, which is
 * stored only in their browser. Responses are kept for the session only.
 */
import { refParts } from './data/loader';

const ENDPOINT = 'https://api.esv.org/v3/passage/text/';

const PARAMS = {
  'include-passage-references': 'false',
  'include-verse-numbers': 'true',
  'include-first-verse-numbers': 'true',
  'include-footnotes': 'false',
  'include-footnote-body': 'false',
  'include-headings': 'false',
  'include-short-copyright': 'false',
  'include-copyright': 'false',
  'include-selahs': 'true',
  'indent-paragraphs': '0',
  'indent-poetry': 'false',
  'indent-declares': '0',
  'indent-psalm-doxology': '0'
};

/** ESV API book names for USFM codes. */
const NAMES: Record<string, string> = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy', JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
  '1SA': '1 Samuel', '2SA': '2 Samuel', '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Solomon',
  ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos',
  OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah',
  MAL: 'Malachi', MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians',
  '2CO': '2 Corinthians', GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians',
  '2TH': '2 Thessalonians', '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
  '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation'
};

const cache = new Map<string, Promise<Record<string, string>>>();

/** Split "[1] Paul, a prisoner… [2] and Apphia…" into verse texts. */
export function splitVerses(text: string, chapter: number): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[(\d+)\]\s*([\s\S]*?)(?=\s*\[\d+\]|$)/g;
  for (const m of text.matchAll(re)) {
    out[`${chapter}:${+m[1]}`] = m[2].replace(/\s+/g, ' ').trim();
  }
  return out;
}

async function fetchRange(key: string, book: string, c: number, v1: number, v2: number): Promise<Record<string, string>> {
  const q = `${NAMES[book] ?? book} ${c}:${v1}-${v2}`;
  const url = `${ENDPOINT}?${new URLSearchParams({ q, ...PARAMS })}`;
  const r = await fetch(url, { headers: { Authorization: `Token ${key}` } });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The ESV API key was not accepted.' : `ESV API error ${r.status}`);
  const j = (await r.json()) as { passages?: string[] };
  return splitVerses((j.passages ?? []).join(' '), c);
}

/** English verse text for a passage, keyed "c:v". One request per chapter in the range. */
export function esvPassage(key: string, book: string, start: string, end: string): Promise<Record<string, string>> {
  const ck = `${book} ${start}-${end}`;
  let p = cache.get(ck);
  if (!p) {
    const [sc, sv] = refParts(start), [ec, ev] = refParts(end);
    const parts: Promise<Record<string, string>>[] = [];
    for (let c = sc; c <= ec; c++) parts.push(fetchRange(key, book, c, c === sc ? sv : 1, c === ec ? ev : 200));
    p = Promise.all(parts).then((xs) => Object.assign({}, ...xs));
    p.catch(() => cache.delete(ck));
    cache.set(ck, p);
  }
  return p;
}

/** Check a key with a one-verse request. */
export async function testEsvKey(key: string): Promise<string> {
  const r = await fetchRange(key, 'JHN', 3, 16, 16);
  return r['3:16'] ?? '';
}
