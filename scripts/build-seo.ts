/**
 * Static pages for search engines, written into dist/ after `vite build`.
 *
 * The app uses hash routes (#/read/…), which search engines treat as the home page, and renders
 * everything with JavaScript. This script gives every published chapter a real URL with its text
 * in the HTML, plus a sitemap:
 *
 *   /<translation>/                      every book in the translation
 *   /<translation>/<book>/               the chapters of a book
 *   /<translation>/<book>/<chapter>/     the chapter: translation text with the source text under each verse
 *   /sitemap.xml
 *
 * It also writes the list of books into the home page's #app element, so the home page has
 * crawlable links; the app clears that element when it mounts.
 *
 * Each page links into the interactive reader. Only the published editions in dist/data are used.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const SITE = (process.env.SITE_URL || 'https://gospelark.in').replace(/\/$/, '');
const BASE = process.env.BASE_PATH || '/';

interface Catalog {
  translations: { id: string; name: string; shortName: string; nameNative?: string; language: string; licence: string; attribution: string; url: string }[];
  sources: { id: string; name: string; shortName: string; language: string; dir: string; licence: string; attribution: string; url: string }[];
  books: { id: string; translation: string; source: string; edition: { primary: boolean }; name: { en: string; native: string }; testament: string; order: number; chapters: number }[];
}
interface BookMeta { chapters: { c: number; verses: number }[]; passages: { id: string; start: string; end: string }[] }
interface Chapter { c: number; verses: { c: number; v: number; t: string; s: { w: string }[] }[] }

const read = <T>(p: string): T => JSON.parse(readFileSync(join(DIST, p), 'utf8')) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const url = (path: string) => `${SITE}${BASE}${path}`;
const slug = (book: string) => book.toLowerCase();
const langName: Record<string, string> = { grc: 'கிரேக்கம்', hbo: 'எபிரேயம்' };
const langNameEn: Record<string, string> = { grc: 'Greek', hbo: 'Hebrew' };

/** source words as running text; a Hebrew word ending in maqaf joins the next word */
const sourceText = (s: { w: string }[]) => s.map((x) => x.w).reduce((acc, w) => (!acc ? w : acc.endsWith('־') ? acc + w : `${acc} ${w}`), '');

const STYLE = `
:root{--bg:#f6f3ec;--fg:#23201b;--muted:#6b6459;--accent:#2c6f6b;--line:#e2dccf}
@media (prefers-color-scheme:dark){:root{--bg:#191816;--fg:#ece7dd;--muted:#a39b8e;--accent:#7cc0b9;--line:#34312c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.75 "Noto Serif Tamil","Latha","Nirmala UI",serif}
.wrap{max-width:46rem;margin:0 auto;padding:1.25rem 1rem 3rem}
a{color:var(--accent)}
nav.crumbs{font:14px/1.4 system-ui,sans-serif;color:var(--muted)}
nav.crumbs a{text-decoration:none}
h1{font-size:1.9rem;line-height:1.3;margin:.6rem 0 .2rem}
.sub{font:15px/1.5 system-ui,sans-serif;color:var(--muted);margin:0 0 1rem}
.cta{display:inline-block;margin:.4rem 0 1.4rem;padding:.55rem 1rem;border-radius:.5rem;background:var(--accent);color:var(--bg);font:600 15px/1.3 system-ui,sans-serif;text-decoration:none}
.v{margin:0 0 .15rem}
.v sup{color:var(--accent);font:600 12px system-ui,sans-serif;margin-right:.3rem}
.src{margin:0 0 1rem;color:var(--muted);font:18px/1.7 "Gentium Book Plus","SBL Hebrew","Ezra SIL","Times New Roman",serif}
ul.grid{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}
ul.grid a{display:inline-block;min-width:2.6rem;padding:.35rem .7rem;border:1px solid var(--line);border-radius:.4rem;text-align:center;text-decoration:none}
ul.books{padding-left:1.2rem}
.pager{display:flex;justify-content:space-between;gap:1rem;margin-top:2rem;font:15px system-ui,sans-serif}
footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);font:13px/1.5 system-ui,sans-serif;color:var(--muted)}
`;

function page(o: { path: string; title: string; description: string; lang: string; crumbs: [string, string][]; body: string; footer: string; jsonLd?: object }): string {
  const crumbs = o.crumbs.map(([label, href]) => (href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label))).join(' › ');
  const ld = o.jsonLd ? `\n<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url(o.path))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="இணைவரி வேதாகமம் — Interlinear Bible">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url(o.path))}">
<meta property="og:image" content="${esc(url('icons/icon-512.png'))}">
<meta name="theme-color" content="#f6f3ec">
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>${ld}
</head>
<body>
<div class="wrap">
<nav class="crumbs">${crumbs}</nav>
${o.body}
<footer>${o.footer}</footer>
</div>
</body>
</html>
`;
}

function write(path: string, html: string) {
  const dir = join(DIST, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

function breadcrumbLd(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url(path) }))
  };
}

function main() {
  if (!existsSync(join(DIST, 'data/catalog.json'))) throw new Error('dist/data/catalog.json not found: run `vite build` first');
  const cat = read<Catalog>('data/catalog.json');
  const urls: string[] = [url('')];
  const homeLinks: string[] = [];
  let chapterPages = 0;

  for (const tr of cat.translations) {
    // one edition per book: the primary one
    const books = cat.books.filter((b) => b.translation === tr.id && b.edition.primary).sort((a, b) => a.order - b.order);
    if (!books.length) continue;
    const trPath = `${tr.id}/`;
    const trName = tr.nameNative || tr.name;
    const trFooter = `${esc(tr.name)} — ${esc(tr.attribution)}, <a href="${esc(tr.url)}" rel="license">${esc(tr.licence)}</a>.`;
    const home = 'இணைவரி வேதாகமம்';

    for (const b of books) {
      const src = cat.sources.find((s) => s.id === b.source)!;
      const meta = read<BookMeta>(`data/${tr.id}/${b.id}/${b.source}/book.json`);
      const bookPath = `${trPath}${slug(b.id)}/`;
      const srcLang = langName[src.language] ?? src.shortName;
      const srcLangEn = langNameEn[src.language] ?? src.shortName;
      const footer = `${trFooter}<br>${esc(src.name)} — ${esc(src.attribution)}, <a href="${esc(src.url)}" rel="license">${esc(src.licence)}</a>.`;
      const readerLink = (c: number) => {
        // the passage that starts in this chapter (or contains its first verse)
        const p = meta.passages.find((x) => x.start.split(':')[0] === String(c)) ?? meta.passages.find((x) => +x.start.split(':')[0] <= c && +x.end.split(':')[0] >= c);
        return `${BASE}#/read/${tr.id}/${b.id}${p ? `/${encodeURIComponent(p.id)}` : ''}?src=${encodeURIComponent(b.source)}`;
      };

      // book page
      write(bookPath, page({
        path: bookPath,
        title: `${b.name.native} — இணைவரி வேதாகமம் (${tr.shortName} · ${srcLang}) | ${b.name.en} Interlinear`,
        description: `${b.name.native} புத்தகம் — ${trName}, ${srcLang} மூலபாடத்துடன் வார்த்தைக்கு வார்த்தை இணைக்கப்பட்டது. ${b.name.en}: Tamil–${srcLangEn} interlinear Bible with Strong's numbers and morphology.`,
        lang: tr.language,
        crumbs: [[home, BASE], [tr.shortName, `${BASE}${trPath}`], [b.name.native, '']],
        body: `<h1>${esc(b.name.native)}</h1>
<p class="sub">${esc(b.name.en)} · ${esc(tr.shortName)} · ${esc(src.shortName)}</p>
<a class="cta" href="${esc(readerLink(1))}">இணைவரி வடிவில் படிக்க · Open in the interlinear reader</a>
<h2>அதிகாரங்கள்</h2>
<ul class="grid">${meta.chapters.map((c) => `<li><a href="${BASE}${bookPath}${c.c}/">${c.c}</a></li>`).join('')}</ul>`,
        footer,
        jsonLd: breadcrumbLd([[home, ''], [tr.shortName, trPath], [b.name.native, bookPath]])
      }));
      urls.push(url(bookPath));

      // chapter pages
      for (const { c } of meta.chapters) {
        const ch = read<Chapter>(`data/${tr.id}/${b.id}/${b.source}/${c}.json`);
        const chPath = `${bookPath}${c}/`;
        const first = ch.verses[0]?.t ?? '';
        const desc = `${b.name.native} ${c}:1 ${first}`.slice(0, 155).replace(/\s+\S*$/, '') + '…';
        const verses = ch.verses
          .map((v) => `<p class="v"><sup>${v.c !== c ? `${v.c}:` : ''}${v.v}</sup>${esc(v.t)}</p>\n<p class="src" lang="${src.language}" dir="${src.dir}">${esc(sourceText(v.s))}</p>`)
          .join('\n');
        const prev = c > 1 ? `<a href="${BASE}${bookPath}${c - 1}/">← ${esc(b.name.native)} ${c - 1}</a>` : '<span></span>';
        const next = c < meta.chapters.length ? `<a href="${BASE}${bookPath}${c + 1}/">${esc(b.name.native)} ${c + 1} →</a>` : '<span></span>';
        write(chPath, page({
          path: chPath,
          title: `${b.name.native} ${c} — இணைவரி வேதாகமம் (${tr.shortName} · ${srcLang}) | ${b.name.en} ${c}`,
          description: desc,
          lang: tr.language,
          crumbs: [[home, BASE], [tr.shortName, `${BASE}${trPath}`], [b.name.native, `${BASE}${bookPath}`], [`${c}`, '']],
          body: `<h1>${esc(b.name.native)} ${c}</h1>
<p class="sub">${esc(b.name.en)} ${c} · ${esc(tr.shortName)} · ${esc(src.shortName)} (${esc(srcLangEn)})</p>
<a class="cta" href="${esc(readerLink(c))}">இணைவரி வடிவில் படிக்க · Open in the interlinear reader</a>
${verses}
<div class="pager">${prev}${next}</div>`,
          footer,
          jsonLd: breadcrumbLd([[home, ''], [tr.shortName, trPath], [b.name.native, bookPath], [`${b.name.native} ${c}`, chPath]])
        }));
        urls.push(url(chPath));
        chapterPages++;
      }
    }

    // translation page: every book
    const list = (t: string, heading: string) => {
      const bs = books.filter((b) => b.testament === t);
      return bs.length ? `<h2>${heading}</h2>\n<ul class="books">${bs.map((b) => `<li><a href="${BASE}${trPath}${slug(b.id)}/">${esc(b.name.native)}</a> <span class="sub">(${esc(b.name.en)})</span></li>`).join('')}</ul>` : '';
    };
    write(trPath, page({
      path: trPath,
      title: `${trName} — இணைவரி வேதாகமம் | ${tr.name} Interlinear Bible`,
      description: `${trName}: எபிரேய, கிரேக்க மூலபாடங்களுடன் வார்த்தைக்கு வார்த்தை இணைக்கப்பட்ட வேதாகமப் புத்தகங்கள். ${tr.name} aligned word by word to the Hebrew and Greek.`,
      lang: tr.language,
      crumbs: [[home, BASE], [tr.shortName, '']],
      body: `<h1>${esc(trName)}</h1>
<p class="sub">${esc(tr.name)}</p>
${list('OT', 'பழைய ஏற்பாடு')}
${list('NT', 'புதிய ஏற்பாடு')}`,
      footer: trFooter,
      jsonLd: breadcrumbLd([[home, ''], [tr.shortName, trPath]])
    }));
    urls.push(url(trPath));
    homeLinks.push(`<h2><a href="${BASE}${trPath}">${esc(trName)}</a></h2>\n<ul>${books.map((b) => `<li><a href="${BASE}${trPath}${slug(b.id)}/">${esc(b.name.native)} (${esc(b.name.en)})</a></li>`).join('')}</ul>`);
  }

  // sitemap
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);

  // home page: crawlable book links inside #app (the app replaces them when it mounts)
  const indexPath = join(DIST, 'index.html');
  const index = readFileSync(indexPath, 'utf8');
  const marker = '<!--seo-home-->';
  if (!index.includes(marker)) throw new Error(`${marker} not found in dist/index.html`);
  writeFileSync(indexPath, index.replace(marker, homeLinks.join('\n')));

  console.log(`SEO: ${chapterPages} chapter page(s), ${urls.length} URL(s) in sitemap.xml`);
}

main();
