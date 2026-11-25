<script lang="ts">
  /**
   * One search box for the whole app.
   *  - In a book: words of that book (translation, source, transliteration, gloss, Strong's),
   *    then book names and references ("3:16" jumps inside the book).
   *  - On the library: book names and references first, then words in the books already on
   *    this device (imported or saved for offline).
   * On phones (compact) it is an icon that opens a field across the app bar.
   */
  import { tick } from 'svelte';
  import type { BookMeta, Catalog } from '../pipeline/types';
  import { loadBook, editionsOf, pickEdition, isSavedOffline, type LoadedBook } from '../data/loader';
  import { search, passageOf, type SearchHit } from '../data/model';
  import { matchBooks, parseLocalRef, type BookMatch } from '../data/find';
  import { BOOKS, bookInfo } from '../pipeline/books';
  import type { Labels } from '../i18n/labels';
  import { prefs } from '../stores/prefs.svelte';
  import { go } from '../stores/router.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    L: Labels;
    catalog: Catalog | null;
    translation: string;
    local: BookMeta[];
    /** the open book, when searching from the reader */
    book?: LoadedBook;
    mode?: 'read' | 'study';
    srcRtl?: boolean;
    /** also search the words of books saved on this device (library) */
    others?: boolean;
    /** on phones show an icon that opens the field */
    compact?: boolean;
    onpick?: (hit: SearchHit) => void;
  }
  let { L, catalog, translation, local, book, mode = 'read', srcRtl = false, others = false, compact = false, onpick }: Props = $props();

  interface OtherHits { id: string; source: string; name: string; rtl: boolean; hits: SearchHit[] }

  let root: HTMLElement;
  let input = $state<HTMLInputElement>();
  let query = $state('');
  let hits = $state.raw<SearchHit[]>([]);
  let books = $state.raw<BookMatch[]>([]);
  let localRef = $state<string | undefined>();
  let other = $state.raw<OtherHits[]>([]);
  let busy = $state(false);
  let open = $state(false);
  let expanded = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  const pub = $derived((catalog?.books ?? []).filter((b) => b.translation === translation));
  const loc = $derived(local.filter((b) => b.translation === translation));
  const available = $derived(new Set([...pub.map((b) => b.id), ...loc.map((b) => b.id)]));
  const nativeName = (id: string) =>
    pub.find((b) => b.id === id)?.name.native ?? loc.find((b) => b.id === id)?.name.native ?? bookInfo(id)?.ta;
  const sourceRtl = (id: string) => catalog?.sources.find((s) => s.id === id)?.dir === 'rtl';

  function edition(id: string): string | undefined {
    const t = bookInfo(id)?.testament ?? 'NT';
    return pickEdition(editionsOf(catalog, translation, id, t, loc), undefined, prefs.sources[t]);
  }

  /** books on this device: imported, or saved for offline in the edition that would open */
  function deviceBooks(): { id: string; source: string }[] {
    const out: { id: string; source: string }[] = [];
    for (const b of BOOKS) {
      if (book && b.id === book.meta.id) continue;
      const src = edition(b.id);
      if (!src) continue;
      if (loc.some((x) => x.id === b.id && x.source === src) || isSavedOffline(translation, b.id, src)) out.push({ id: b.id, source: src });
    }
    return out.slice(0, 8);
  }

  function run() {
    clearTimeout(timer);
    const q = query;
    books = q.trim() ? matchBooks(q, available, nativeName) : [];
    localRef = book ? parseLocalRef(q) : undefined;
    if (localRef && book && !book.meta.chapters.some((c) => c.c === +localRef!.split(':')[0])) localRef = undefined;
    if (!q.trim()) {
      hits = [];
      other = [];
      return;
    }
    timer = setTimeout(async () => {
      busy = true;
      try {
        if (book) {
          await book.ensureAll(); // search covers the whole book
          if (q === query) hits = search(book, q);
        }
        if (others && q.trim().length >= 2) {
          const found: OtherHits[] = [];
          for (const d of deviceBooks()) {
            const b = await loadBook(translation, d.id, d.source).catch(() => null);
            if (!b) continue;
            await b.ensureAll().catch(() => {});
            const h = search(b, q, 8);
            if (h.length) found.push({ id: d.id, source: d.source, name: b.meta.name.native, rtl: sourceRtl(d.source), hits: h });
            if (q !== query) return;
          }
          if (q === query) other = found;
        }
      } finally {
        busy = false;
      }
    }, 180);
  }

  function reset() {
    query = '';
    hits = [];
    books = [];
    other = [];
    localRef = undefined;
    open = false;
    expanded = false;
  }

  function pickHit(h: SearchHit) {
    reset();
    onpick?.(h);
  }

  async function openBook(id: string, ref?: string) {
    const src = book?.meta.id === id ? book.meta.source : edition(id);
    reset();
    let passage: string | undefined;
    if (ref && src) {
      const b = book?.meta.id === id ? book : await loadBook(translation, id, src).catch(() => null);
      passage = b ? passageOf(b.meta.passages, ref)?.id : undefined;
    }
    if (ref) ui.scrollVerse = ref;
    go({ name: mode, translation, book: id, passage, src: book?.meta.id === id ? src : undefined });
  }

  async function openOther(o: OtherHits, h: SearchHit) {
    reset();
    const b = await loadBook(translation, o.id, o.source).catch(() => null);
    go({ name: 'read', translation, book: o.id, passage: b ? passageOf(b.meta.passages, h.ref)?.id : undefined, w: h.key });
  }

  function first() {
    if (localRef) return openBook(book!.meta.id, localRef);
    if (book && hits[0]) return pickHit(hits[0]);
    if (books[0]) return openBook(books[0].id, books[0].ref);
    if (other[0]) return openOther(other[0], other[0].hits[0]);
  }

  async function expand() {
    expanded = true;
    open = true;
    await tick();
    input?.focus();
  }

  const empty = $derived(!hits.length && !books.length && !other.length && !localRef);
  const bookLabel = (m: BookMatch) => `${nativeName(m.id) ?? m.id}${m.ref ? ' ' + m.ref : ''}`;
</script>

{#snippet bookGroup()}
  {#if books.length}
    <div class="group">{L.books}</div>
    {#each books as m (m.id + (m.ref ?? ''))}
      <button class="hit bookhit" role="option" aria-selected="false" onclick={() => openBook(m.id, m.ref)}>
        <Icon name="book" size={16} />
        <span class="ta">{bookLabel(m)}</span>
        <span class="en">{bookInfo(m.id)?.en}</span>
      </button>
    {/each}
  {/if}
{/snippet}

<div class="search" class:compact class:expanded class:fill={!compact} bind:this={root} data-print="hide">
  {#if compact}
    <button class="icon-btn sopen" onclick={expand} aria-label={L.searchShort} title={L.searchShort}><Icon name="search" /></button>
  {/if}
  <div class="field">
    <span class="lens"><Icon name="search" size={17} /></span>
    <input
      bind:this={input}
      class="input"
      type="search"
      bind:value={query}
      oninput={() => ((open = true), run())}
      onfocus={() => (open = true)}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          reset();
          input?.blur();
        }
        if (e.key === 'Enter') first();
      }}
      placeholder={book ? L.searchBook : L.searchHome}
      aria-label={L.searchShort}
      enterkeyhint="search"
      autocomplete="off"
    />
  </div>
  {#if compact}
    <button class="icon-btn sclose" onclick={reset} aria-label={L.close} title={L.close}><Icon name="close" /></button>
  {/if}
  {#if open && query.trim()}
    <div class="results" role="listbox" aria-label={L.searchShort}>
      {#if localRef}
        <button class="hit bookhit" role="option" aria-selected="false" onclick={() => openBook(book!.meta.id, localRef)}>
          <Icon name="chevron" size={16} /><span class="ta">{book!.meta.name.native} {localRef}</span>
        </button>
      {/if}
      {#if book}
        {#if hits.length}<div class="group">{L.inThisBook}</div>{/if}
        {#each hits as h (h.key)}
          <button class="hit" role="option" aria-selected="false" onclick={() => pickHit(h)}>
            <span class="mono ref">{h.ref}</span>
            <span class="ta">{h.ta}</span>
            <span class="gr" dir={srcRtl ? 'rtl' : undefined}>{h.gr}</span>
          </button>
        {/each}
        {@render bookGroup()}
      {:else}
        {@render bookGroup()}
      {/if}
      {#each other as o (o.id)}
        <div class="group">{L.inDownloaded} · {o.name}</div>
        {#each o.hits as h (h.key)}
          <button class="hit" role="option" aria-selected="false" onclick={() => openOther(o, h)}>
            <span class="mono ref">{h.ref}</span>
            <span class="ta">{h.ta}</span>
            <span class="gr" dir={o.rtl ? 'rtl' : undefined}>{h.gr}</span>
          </button>
        {/each}
      {/each}
      {#if empty || busy}
        <div class="none">{busy ? L.searching : L.noResults}</div>
      {/if}
    </div>
  {/if}
</div>
<svelte:window
  onclick={(e) => {
    if (root && !root.contains(e.target as Node)) {
      open = false;
      if (!query) expanded = false;
    }
  }}
/>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .search.fill {
    flex: 1 1 auto;
  }
  .field {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }
  .lens {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-4);
    pointer-events: none;
  }
  .input {
    width: clamp(200px, 28vw, 340px);
    max-width: 100%;
    height: 38px;
    padding-left: 34px;
    border-radius: 999px;
    background: var(--card);
  }
  .fill .input {
    width: 100%;
  }
  .sopen,
  .sclose {
    display: none;
  }
  .results {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    width: min(420px, calc(100vw - 24px));
    max-height: min(60vh, 460px);
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-pop);
    padding: 4px 0;
  }
  .fill .results {
    left: 0;
    right: auto;
    width: min(520px, calc(100vw - 24px));
  }
  .group {
    padding: 9px 12px 4px;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted-5);
    overflow-wrap: anywhere;
  }
  .hit {
    display: flex;
    gap: 9px;
    align-items: baseline;
    flex-wrap: wrap;
    width: 100%;
    min-height: 40px;
    text-align: start;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--ink);
  }
  .bookhit {
    align-items: center;
    color: var(--accent);
  }
  .hit:hover,
  .hit:focus-visible {
    background: var(--accent-wash);
  }
  .ref {
    font-size: 11px;
    color: var(--accent);
    flex: 0 0 auto;
  }
  .ta {
    font-family: var(--f-ta);
    font-size: 15px;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .gr {
    font-family: var(--f-gr);
    font-size: 14px;
    color: var(--muted-3);
    overflow-wrap: anywhere;
  }
  .gr[dir='rtl'] {
    font-family: var(--f-he);
  }
  .en {
    font-size: 12px;
    color: var(--muted-4);
  }
  .none {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--muted-5);
  }

  @media (max-width: 699px) {
    .compact:not(.expanded) .field {
      display: none;
    }
    .compact:not(.expanded) .sopen {
      display: inline-flex;
    }
    .compact.expanded {
      position: absolute;
      inset: 0;
      z-index: 3;
      gap: 4px;
      padding: 0 6px 0 10px;
      background: var(--bg);
    }
    .compact.expanded .sclose {
      display: inline-flex;
    }
    .compact.expanded .input {
      width: 100%;
    }
    .results,
    .fill .results {
      position: fixed;
      top: calc(var(--bar-h) + env(safe-area-inset-top) + 4px);
      left: 8px;
      right: 8px;
      width: auto;
      max-height: calc(100dvh - var(--bar-h) - 24px);
    }
  }
</style>
