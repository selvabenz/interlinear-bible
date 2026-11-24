/**
 * unfoldingWord UGNT / UHB from translationCore's resource folder → source-token JSON.
 *
 *   <tc>/el-x-koine/bibles/ugnt/v<ver>_<owner>/<book>/<chapter>.json   (verseObjects)
 *   <tc>/hbo/bibles/uhb/v<ver>_<owner>/<book>/<chapter>.json
 *   <tc>/en/lexicons/ugl|uhl/v<ver>_<owner>/content/<strong number>.json  ({ brief, long })
 *
 * The newest version folder is used (unfoldingWord preferred over Door43-Catalog on a tie).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { uwGreekToRobinson, uwHebrewToOshb } from '../../src/lib/morph';
import { normStrong } from '../../src/lib/pipeline/strong';
import type { RawBook, RawTok } from './stepbible';

const cmpVer = (a: string, b: string) => {
  const pa = /^v([\d.]+)_(.*)$/.exec(a), pb = /^v([\d.]+)_(.*)$/.exec(b);
  const na = (pa?.[1] ?? '0').split('.').map(Number), nb = (pb?.[1] ?? '0').split('.').map(Number);
  for (let k = 0; k < Math.max(na.length, nb.length); k++) {
    const d = (na[k] ?? 0) - (nb[k] ?? 0);
    if (d) return d;
  }
  return (pa?.[2] === 'unfoldingWord' ? 1 : 0) - (pb?.[2] === 'unfoldingWord' ? 1 : 0);
};

export function newestVersion(dir: string, book?: string): string {
  const vs = readdirSync(dir).filter((d) => /^v[\d.]+_/.test(d) && (!book || existsSync(join(dir, d, book.toLowerCase()))));
  if (!vs.length) throw new Error(`no version folder${book ? ` with ${book}` : ''} in ${dir}`);
  return vs.sort(cmpVer).pop()!;
}

interface VO { type?: string; tag?: string; text?: string; lemma?: string; strong?: string; morph?: string; children?: VO[] }

export interface UwBook { version: string; tokens: RawBook }

export function uwTokens(tc: string, kind: 'ugnt' | 'uhb', book: string): UwBook {
  const base = kind === 'ugnt' ? join(tc, 'el-x-koine', 'bibles', 'ugnt') : join(tc, 'hbo', 'bibles', 'uhb');
  const version = newestVersion(base, book);
  const dir = join(base, version, book.toLowerCase());
  const tokens: RawBook = {};
  const chapters = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => +f.slice(0, -5)).sort((a, b) => a - b);
  for (const c of chapters) {
    const data = JSON.parse(readFileSync(join(dir, `${c}.json`), 'utf8')) as Record<string, { verseObjects: VO[] }>;
    for (const [vk, vo] of Object.entries(data)) {
      if (!/^\d+$/.test(vk)) continue;
      const ref = `${book} ${c}:${vk}`;
      const list: RawTok[] = [];
      const walk = (os: VO[]) => {
        for (const o of os) {
          if (o.type === 'word' && o.text) {
            const uwMorph = o.morph ?? '';
            list.push({
              ref, inst: String(list.length + 1).padStart(2, '0'), type: kind.toUpperCase(),
              word: o.text, translit: '', gloss: '',
              strong: normStrong(o.strong), morph: kind === 'ugnt' ? uwGreekToRobinson(uwMorph) : uwHebrewToOshb(uwMorph),
              lemma: o.lemma ?? '', lemma_gloss: '',
              uw_strong: o.strong ?? '', uw_morph: uwMorph,
              lang: kind === 'ugnt' ? 'grc' : uwMorph.startsWith('Ar,') ? 'arc' : 'hbo'
            });
          }
          if (o.children) walk(o.children);
        }
      };
      walk(vo.verseObjects ?? []);
      if (list.length) tokens[ref] = list;
    }
  }
  return { version, tokens };
}

/** Brief English gloss from UGL / UHL by Strong's number. */
export function lexicon(tc: string, kind: 'ugl' | 'uhl'): (strong: string) => string {
  const base = join(tc, 'en', 'lexicons', kind);
  let dir = '';
  try {
    dir = join(base, newestVersion(base), 'content');
  } catch {
    return () => '';
  }
  const memo = new Map<string, string>();
  return (strong) => {
    const n = String(parseInt(normStrong(strong).slice(1), 10));
    if (memo.has(n)) return memo.get(n)!;
    let g = '';
    try {
      g = (JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8')) as { brief?: string }).brief ?? '';
    } catch {
      /* no entry */
    }
    memo.set(n, g);
    return g;
  };
}

// ------------------------------------------------------------------ transliteration fallback
const GR: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'u', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō'
};
export function translitGreek(w: string): string {
  const d = w.normalize('NFD');
  let out = '';
  let rough = false;
  for (const ch of d) {
    if (ch === '̔') { rough = true; continue; }
    if (/\p{Mn}/u.test(ch)) continue;
    const lower = ch.toLowerCase();
    const t = GR[lower];
    if (!t) continue;
    out += ch !== lower ? t[0].toUpperCase() + t.slice(1) : t;
  }
  out = out.replace(/gg/g, 'ng').replace(/gk/g, 'nk').replace(/gx/g, 'nx').replace(/gch/g, 'nch');
  if (rough) out = /^[A-Z]/.test(out) ? 'H' + out[0].toLowerCase() + out.slice(1) : 'h' + out;
  return out;
}
