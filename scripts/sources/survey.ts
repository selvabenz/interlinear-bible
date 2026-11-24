/**
 * npm run sources:survey -- [--stepbible <dir>] [--tc <dir>] [BOOK …]
 * Dry run over the whole Bible (writes nothing): builds every book's token lists for both
 * source texts and the token map between them, and reports sizes, match rates, chapter/verse
 * coverage differences (versification) and timings.
 */
import { BOOKS } from '../../src/lib/pipeline/books';
import { readSource } from '../../src/lib/pipeline/build';
import { alignTokens } from '../../src/lib/pipeline/remap';
import { tagntAll, trTokens, wlcTokens, type RawBook } from './stepbible';
import { uwTokens } from './uw';

const args = process.argv.slice(2);
const opt = (n: string) => {
  const k = args.indexOf(`--${n}`);
  return k >= 0 ? args.splice(k, 2)[1] : undefined;
};
const stepbible = opt('stepbible') ?? process.env.STEPBIBLE_DIR!;
const tc = opt('tc') ?? process.env.TC_RESOURCES!;
const only = new Set(args.map((a) => a.toUpperCase()));
const toMap = (raw: RawBook) => readSource({ name: 'raw', text: JSON.stringify(raw) }, []);
const n = (m: Map<string, unknown[]>) => [...m.values()].reduce((s, l) => s + l.length, 0);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '—');

console.log('book\tuw\tstep\texact%\tmatched%\tuwOnly\tstepOnly\tversesOnlyUw\tversesOnlyStep\tms\tnote');
for (const b of BOOKS) {
  if (only.size && !only.has(b.id)) continue;
  const t0 = Date.now();
  try {
    const uw = toMap(uwTokens(tc, b.testament === 'NT' ? 'ugnt' : 'uhb', b.id).tokens);
    const step = toMap(b.testament === 'NT' ? trTokens(stepbible, b.id) : wlcTokens(stepbible, b.id));
    if (b.testament === 'NT') void tagntAll;
    const { stats } = alignTokens(uw, step);
    const total = n(uw);
    const onlyUw = [...uw.keys()].filter((k) => !step.has(k));
    const onlyStep = [...step.keys()].filter((k) => !uw.has(k));
    const show = (xs: string[]) => (xs.length ? `${xs.length} (${xs.slice(0, 4).join(' ')}${xs.length > 4 ? ' …' : ''})` : '0');
    console.log([
      b.id, total, n(step), pct(stats.exact, total), pct(stats.exact + stats.spelling + stats.lexical, total),
      stats.unmatchedFrom, stats.unmatchedTo, show(onlyUw), show(onlyStep), Date.now() - t0, ''
    ].join('\t'));
  } catch (e) {
    console.log([b.id, '', '', '', '', '', '', '', '', Date.now() - t0, `ERROR ${(e as Error).message}`].join('\t'));
  }
}
