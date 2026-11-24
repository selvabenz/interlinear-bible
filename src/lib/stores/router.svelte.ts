/**
 * Hash router — deep links work on static hosting (GitHub Pages) without server rewrites.
 *   #/                                 library
 *   #/read/<translation>/<BOOK>/<passage>?src=<source>&w=<word>
 *   #/study/<translation>/<BOOK>/<passage>?src=<source>&w=<word>
 *   (src picks the source-text edition, e.g. grc-tr / grc-ugnt; without it the reader's
 *   preferred or the default edition opens)
 *   #/import   #/settings
 */
export type Route =
  | { name: 'library' }
  | { name: 'read' | 'study'; translation: string; book: string; passage?: string; w?: string; src?: string }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'notfound'; path: string };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(query);
  if (!parts.length) return { name: 'library' };
  if ((parts[0] === 'read' || parts[0] === 'study') && parts.length >= 3) {
    return {
      name: parts[0], translation: parts[1], book: parts[2].toUpperCase(), passage: parts[3],
      w: q.get('w') ?? undefined, src: q.get('src') ?? undefined
    };
  }
  if (parts[0] === 'import') return { name: 'import' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'notfound', path };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'library':
      return '#/';
    case 'read':
    case 'study': {
      const p = [r.name, r.translation, r.book, r.passage].filter(Boolean).map((x) => encodeURIComponent(x!)).join('/');
      const q = new URLSearchParams();
      if (r.src) q.set('src', r.src);
      if (r.w) q.set('w', r.w);
      const qs = q.toString();
      return `#/${p}${qs ? `?${qs}` : ''}`;
    }
    case 'import':
      return '#/import';
    case 'settings':
      return '#/settings';
    default:
      return '#/';
  }
}

export const router = $state<{ route: Route }>({ route: parseHash(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parseHash(location.hash);
});

export function go(r: Route): void {
  location.hash = href(r);
}

/** Update the URL without adding history or re-rendering (e.g. the selected word). */
export function replace(r: Route): void {
  const url = `${location.pathname}${location.search}${href(r)}`;
  history.replaceState(history.state, '', url);
}
