/**
 * USFM 3 tokenizer for aligned scripture files.
 *
 * Generalises the token grammar of the original build.py (`TOKEN_RE`) so whole books can be
 * read, not only Philemon: chapters, verse ranges, poetry/paragraph markers, character styles
 * (\nd, \wj, \add …, ignored for layout), footnotes and cross references, other milestones,
 * and headings. Everything before the first \c is book header/introduction.
 */
import type { Issue } from './types';

export type Tok =
  | { k: 'c'; n: number; at: number }
  | { k: 'v'; n: number; label: string; at: number }
  | { k: 'ms'; name: 'zaln-s' | 'zsem-s' | 'zsem-i' | 'zsem-nl'; attrs: Record<string, string>; at: number }
  | { k: 'me'; name: 'zaln-e' | 'zsem-e'; at: number }
  | { k: 'w'; text: string; attrs: Record<string, string>; at: number }
  | { k: 'note'; kind: 'f' | 'x'; text: string; at: number }
  | { k: 'head'; text: string; at: number }
  | { k: 'para'; at: number }
  | { k: 'text'; text: string; at: number };

const LINE_MARKERS =
  'rem|cl|cd|sts|restore|toc\\d|toca\\d|h|mt\\d?|mte\\d?|ms\\d?|mr|r|sr|s\\d?|sp|qa|is\\d?|ip|ipi|ipq|ipr|im|imi|imq|io\\d?|iot|imt\\d?|ie|ili\\d?|iq\\d?|ib|iex|ide|usfm';
const HEADING = /^(ms\d?|s\d?|sp|qa|d)$/;

const RE = new RegExp(
  [
    String.raw`(?<c>\\c\s+(?<cnum>\d+)[^\S\n]*)`,
    String.raw`(?<v>\\v\s+(?<vnum>\d+)(?<vrest>[a-z]?(?:-\d+[a-z]?)?)[^\S\n]?)`,
    String.raw`(?<ms>\\(?<msname>zaln-s|zsem-s|zsem-i|zsem-nl)\s*\|(?<msattrs>.*?)\\\*)`,
    String.raw`(?<me>\\(?<mename>zaln-e|zsem-e)\\\*)`,
    String.raw`(?<oms>\\[a-z]+\d*-[se]\b(?:\s*\|.*?)?\\\*)`,
    String.raw`(?<w>\\\+?w\s(?<wbody>.*?)\\\+?w\*)`,
    String.raw`(?<note>\\(?<nk>fe|f|ef|ex|x)\s(?<nbody>.*?)\\\k<nk>\*)`,
    String.raw`(?<skip>\\(?<sk>fig|ca|va|vp|cat|rq)\s.*?\\\k<sk>\*)`,
    String.raw`(?<dline>\\d(?![^\n]*\\\+?w\s)[^\S\n](?<dtext>[^\n]*))`,
    String.raw`(?<line>\\(?<lname>${LINE_MARKERS})(?=[\s\\]|$)(?:[^\S\n](?<ltext>[^\n]*))?)`,
    String.raw`(?<id>\\id\s[^\n]*)`,
    String.raw`(?<cclose>\\\+?[a-z]+\d*\*)`,
    String.raw`(?<mark>\\\+?(?<pname>[a-z]+\d*)(?=[\s\\]|$)[^\S\n]?)`,
    String.raw`(?<text>[^\\]+)`,
    String.raw`(?<bad>\\)`
  ].join('|'),
  'gsy'
);

/** Paragraph-level markers: they start a new paragraph in the running text. */
const PARA = /^(p|m|po|pr|cls|pmo|pm|pmc|pmr|pi\d?|mi|nb|pc|ph\d?|b|q\d?|qr|qc|qm\d?|qd|lh|li\d?|lf|lim\d?|d|tr|pb)$/;

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1]] = m[2];
  return out;
}

/** Strip USFM markers from a short text (headings, note bodies). */
export function stripMarkers(s: string): string {
  return s
    .replace(/\\\+?w\s([^|\\]*)(\|[^\\]*)?\\\+?w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d*\*?\s?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface UsfmHeader {
  id: string;
  h?: string;
  toc1?: string;
  toc2?: string;
  toc3?: string;
  mt?: string;
}

export function readHeader(text: string): UsfmHeader {
  const first = text.search(/\\c\s+\d/);
  const head = first >= 0 ? text.slice(0, first) : text;
  const get = (m: string) => {
    const r = new RegExp(String.raw`\\${m}\s+([^\n\\]*)`).exec(head);
    return r ? r[1].trim() : undefined;
  };
  const id = (get('id') ?? '').split(/\s+/)[0] ?? '';
  return { id, h: get('h'), toc1: get('toc1'), toc2: get('toc2'), toc3: get('toc3'), mt: get('mt1') ?? get('mt') };
}

/** Line number (1-based) of a character offset — used in issue messages. */
export function lineOf(text: string, at: number): number {
  let n = 1;
  for (let i = 0; i < at && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Tokenize the body of a USFM file (from the first \c). Offsets in `at` refer to the whole text.
 */
export function tokenize(text: string, file: string, issues: Issue[]): Tok[] {
  const start = text.search(/\\c\s+\d/);
  if (start < 0) {
    issues.push({ level: 'error', code: 'usfm.no-chapter', message: 'No \\c chapter marker found.', file });
    return [];
  }
  const toks: Tok[] = [];
  RE.lastIndex = start;
  let bad = 0;
  while (RE.lastIndex < text.length) {
    const at = RE.lastIndex;
    const m = RE.exec(text);
    if (!m || m.index !== at) {
      issues.push({ level: 'error', code: 'usfm.untokenized', message: `Cannot read text at line ${lineOf(text, at)}.`, file });
      break;
    }
    const g = m.groups!;
    if (g.c !== undefined) toks.push({ k: 'c', n: +g.cnum, at });
    else if (g.v !== undefined) toks.push({ k: 'v', n: +g.vnum, label: g.vnum + (g.vrest || ''), at });
    else if (g.ms !== undefined) toks.push({ k: 'ms', name: g.msname as 'zaln-s', attrs: parseAttrs(g.msattrs), at });
    else if (g.me !== undefined) toks.push({ k: 'me', name: g.mename as 'zaln-e', at });
    else if (g.w !== undefined) {
      const bar = g.wbody.indexOf('|');
      const word = (bar >= 0 ? g.wbody.slice(0, bar) : g.wbody).trim();
      toks.push({ k: 'w', text: word, attrs: bar >= 0 ? parseAttrs(g.wbody.slice(bar + 1)) : {}, at });
    } else if (g.note !== undefined) {
      toks.push({ k: 'note', kind: g.nk.endsWith('x') ? 'x' : 'f', text: noteText(g.nk, g.nbody), at });
    } else if (g.dline !== undefined) {
      const t = stripMarkers(g.dtext ?? '');
      if (t) toks.push({ k: 'head', text: t, at });
    } else if (g.line !== undefined) {
      if (HEADING.test(g.lname)) {
        const t = stripMarkers(g.ltext ?? '');
        if (t) toks.push({ k: 'head', text: t, at });
      }
      // other line markers (\rem, \cl, \toc …) carry no verse text
    } else if (g.mark !== undefined) {
      if (PARA.test(g.pname)) toks.push({ k: 'para', at });
    } else if (g.text !== undefined) {
      toks.push({ k: 'text', text: g.text, at });
    } else if (g.bad !== undefined) {
      if (bad++ < 20) issues.push({ level: 'warning', code: 'usfm.stray-backslash', message: `Stray backslash at line ${lineOf(text, at)} ignored.`, file });
    }
    // oms, skip, cclose, id: ignored
  }
  return toks;
}

function noteText(kind: string, body: string): string {
  if (kind.endsWith('x')) {
    // \x - \xo 1:2 \xt கொலோ 4:17\x*  ->  "கொலோ 4:17"
    const xt = [...body.matchAll(/\\xt\s([^\\]*)/g)].map((m) => m[1].trim()).join(' ');
    return (xt || stripMarkers(body.replace(/^\S\s/, ''))).replace(/\s+/g, ' ').trim();
  }
  // \f + \fr 1:8 \fq word \ft text\f*  ->  "word text"
  let t = body.replace(/^\S\s/, '').replace(/\\fr\s[^\\]*/g, '');
  t = t.replace(/\\f[a-z]\s/g, ' ');
  return stripMarkers(t);
}
