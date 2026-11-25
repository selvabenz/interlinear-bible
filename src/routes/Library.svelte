<script lang="ts">
  import { onMount } from 'svelte';
  import type { BookMeta, Catalog, CatalogBook } from '../lib/pipeline/types';
  import { BOOKS } from '../lib/pipeline/books';
  import { loadCatalog, bookUrl, saveForOffline, isSavedOffline, editionsOf, pickEdition } from '../lib/data/loader';
  import { listLocalBooks } from '../lib/data/local';
  import { LABELS } from '../lib/i18n/labels';
  import { prefs } from '../lib/stores/prefs.svelte';
  import { href } from '../lib/stores/router.svelte';
  import AppBar from '../lib/components/AppBar.svelte';
  import AppMenu from '../lib/components/AppMenu.svelte';
  import SearchBox from '../lib/components/SearchBox.svelte';
  import Icon from '../lib/components/Icon.svelte';

  const L = $derived(LABELS[prefs.ui]);
  let catalog = $state.raw<Catalog | null>(null);
  let local = $state.raw<BookMeta[]>([]);
  let error = $state('');
  let saving = $state<Record<string, string>>({});
  let menuOpen = $state(false);

  onMount(() => {
    loadCatalog()
      .then((c) => (catalog = c))
      .catch((e) => (error = (e as Error).message));
    listLocalBooks().then((b) => (local = b));
  });

  const translations = $derived(catalog?.translations ?? []);
  const trId = $derived(
    translations.find((t) => t.id === prefs.translation)?.id ?? translations[0]?.id ?? local[0]?.translation ?? ''
  );
  const translation = $derived(translations.find((t) => t.id === trId));

  interface Entry {
    id: string;
    en: string;
    native: string;
    testament: 'OT' | 'NT';
    /** the edition the card opens: the reader's preferred source text if published, else the default */
    source?: string;
    /** every source text the book is available in, default first */
    editions: string[];
    data?: CatalogBook;
    local?: boolean;
  }

  const srcName = (id: string) => catalog?.sources.find((s) => s.id === id)?.shortName ?? id;

  const entries = $derived.by(() => {
    const pub = (catalog?.books ?? []).filter((b) => b.translation === trId);
    const loc = local.filter((b) => b.translation === trId);
    return BOOKS.map((info): Entry => {
      const editions = editionsOf(catalog, trId, info.id, info.testament, loc);
      const source = pickEdition(editions, undefined, prefs.sources[info.testament]);
      const lb = loc.find((b) => b.id === info.id && b.source === source);
      const data: CatalogBook | undefined = lb
        ? {
            id: lb.id, translation: lb.translation, source: lb.source, edition: lb.edition, name: lb.name,
            testament: lb.testament, order: lb.order, chapters: lb.chapters.length, verses: lb.stats.verses,
            hasSemantic: lb.hasSemantic, hash: lb.hash, findings: lb.stats.findings, units: lb.stats.units
          }
        : pub.find((b) => b.id === info.id && b.source === source);
      return {
        id: info.id,
        en: info.en,
        native: data?.name.native ?? (translation?.language === 'ta' ? info.ta : info.en),
        testament: info.testament,
        source,
        editions,
        data,
        local: !!lb
      };
    });
  });
  const available = $derived(entries.filter((e) => e.data));
  const groups = $derived(
    (['OT', 'NT'] as const)
      .map((t) => ({
        t,
        label: t === 'OT' ? L.oldTestament : L.newTestament,
        books: entries.filter((e) => e.testament === t && (prefs.showAllBooks || e.data)),
        count: entries.filter((e) => e.testament === t && e.data).length
      }))
      .filter((g) => g.books.length)
  );

  async function offline(e: Entry) {
    if (!e.source) return;
    const k = `${trId}/${e.id}/${e.source}`;
    try {
      saving[k] = L.offlineSaving;
      const meta = (await (await fetch(bookUrl(trId, e.id, e.source))).json()) as BookMeta;
      await saveForOffline(trId, e.id, e.source, meta.chapters.map((c) => c.c), (d, t) => (saving[k] = `${L.offlineSaving} ${d}/${t}`));
      saving[k] = L.offlineSaved;
    } catch (err) {
      saving[k] = (err as Error).message;
    }
  }
</script>

<div class="page">
  <AppBar menuLabel={L.menu} onmenu={() => (menuOpen = true)} width="1100px">
    <SearchBox {L} {catalog} translation={trId} {local} others />
  </AppBar>

  <main class="main">
    <section class="hero">
      <span class="logo" aria-hidden="true"><Icon name="book" size={22} /></span>
      <div>
        <h1>{L.heroTitle}</h1>
        <p>
          {L.heroShort}
          <span class="pill ok">{L.booksAvailable(available.length)}</span>
          {#if translation}<span class="trname">{translation.shortName ?? translation.name}</span>{/if}
        </p>
      </div>
    </section>

    {#if error}
      <p class="err">{L.loadError} ({error})</p>
    {/if}

    {#each groups as g (g.t)}
      <section class="testament">
        <div class="thead">
          <h2>{g.label}</h2>
          <span class="mono count">{g.count} / {g.t === 'OT' ? 39 : 27}</span>
        </div>
        <div class="grid">
          {#each g.books as e (e.id)}
            {#if e.data}
              {@const k = `${trId}/${e.id}/${e.source}`}
              {@const saved = !!e.source && isSavedOffline(trId, e.id, e.source)}
              <article class="book card">
                <div class="btop">
                  <div class="names">
                    <div class="bnative">{e.native}</div>
                    <div class="ben">{e.en}</div>
                  </div>
                  {#if e.local}<span class="pill flag">{L.local}</span>{/if}
                </div>
                <div class="bstats mono">
                  <span>{e.data.chapters} {L.chapter.toLowerCase()}{e.data.chapters === 1 || prefs.ui === 'ta' ? '' : 's'}</span>
                  <span>{e.data.verses} {L.verses}</span>
                  {#if e.data.findings}<span class="fl">◆ {e.data.findings}</span>{/if}
                  {#if e.editions.length > 1}
                    {#each e.editions as s (s)}<span class="ed" class:on={s === e.source}>{srcName(s)}</span>{/each}
                  {/if}
                </div>
                <div class="bactions">
                  <a class="btn primary open" href={href({ name: 'read', translation: trId, book: e.id })}>{L.openReading}</a>
                  <a class="btn ghost" href={href({ name: 'study', translation: trId, book: e.id })}><Icon name="study" size={17} />{L.openStudy}</a>
                  <span class="grow"></span>
                  {#if !e.local}
                    {#if saving[k] && saving[k] !== L.offlineSaved}
                      <span class="saving mono">{saving[k]}</span>
                    {:else}
                      <button class="icon-btn off" class:done={saved || saving[k] === L.offlineSaved}
                        title={saved || saving[k] === L.offlineSaved ? L.offlineSaved : L.offline}
                        aria-label={saved || saving[k] === L.offlineSaved ? L.offlineSaved : L.offline}
                        onclick={() => offline(e)}>
                        <Icon name={saved || saving[k] === L.offlineSaved ? 'check' : 'download'} size={18} />
                      </button>
                    {/if}
                  {/if}
                </div>
              </article>
            {:else}
              <div class="book missing" title={L.comingSoon}>
                <div class="bnative">{e.native}</div>
                <div class="ben">{e.en}</div>
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}

    <div class="toggle">
      <button class="btn ghost" onclick={() => (prefs.showAllBooks = !prefs.showAllBooks)}>
        {prefs.showAllBooks ? L.hideMissing : L.showAll}
      </button>
    </div>

    <footer class="credits">
      {#if translation}<p>{translation.name} — {translation.attribution}, {translation.licence}.</p>{/if}
      {#each catalog?.sources ?? [] as s (s.id)}<p>{s.name} — {s.attribution}, {s.licence}.</p>{/each}
    </footer>
  </main>
</div>

<AppMenu bind:open={menuOpen} />

<style>
  .main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 22px var(--gutter) 80px;
  }
  .hero {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    max-width: 760px;
    margin-bottom: 22px;
  }
  .logo {
    display: inline-flex;
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
  }
  .hero h1 {
    font-family: var(--f-gr);
    font-weight: 400;
    font-size: clamp(22px, 3.4vw, 30px);
    line-height: 1.2;
    margin: 2px 0 6px;
    color: var(--ink);
  }
  :global(html[lang='ta']) .hero h1 {
    font-family: var(--f-ta-head);
    font-size: clamp(20px, 3vw, 26px);
  }
  .hero p {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--muted);
    margin: 0;
  }
  .trname {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted-4);
  }
  .err {
    color: var(--danger);
  }
  .testament {
    margin-bottom: 26px;
  }
  /* the testament heading stays in view while its books scroll under it */
  .thead {
    position: sticky;
    top: var(--bar-offset);
    z-index: 5;
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin: 0 calc(-1 * var(--gutter)) 12px;
    padding: 12px var(--gutter) 8px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    transition: top 0.22s ease;
  }
  .thead h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--muted);
  }
  .count {
    font-size: 11px;
    color: var(--muted-6);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    gap: 12px;
  }
  .book.card {
    position: relative;
    padding: 14px 14px 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: var(--shadow-1);
    transition: border-color 0.15s ease, transform 0.15s ease;
  }
  .book.card:hover {
    border-color: var(--accent-line);
  }
  .btop {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .names {
    min-width: 0;
  }
  .bnative {
    font-family: var(--f-ta-head);
    font-size: 19px;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .ben {
    font-size: 12.5px;
    color: var(--muted-4);
  }
  .bstats {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 12px;
    font-size: 10.5px;
    color: var(--muted-4);
  }
  .bstats .fl {
    color: var(--mark);
  }
  .ed.on {
    color: var(--ink-3);
    font-weight: 600;
  }
  .bactions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  /* the whole card opens the reading view; Study and offline sit above that link */
  .open::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .bactions > :not(.open) {
    position: relative;
    z-index: 1;
  }
  .grow {
    flex: 1 1 auto;
  }
  .off {
    width: 36px;
    height: 36px;
    color: var(--muted-3);
  }
  .off.done {
    color: var(--accent);
  }
  .saving {
    font-size: 11px;
    color: var(--muted-3);
  }
  .book.missing {
    padding: 12px 14px;
    border: 1px dashed var(--input-line);
    border-radius: var(--r-md);
    opacity: 0.6;
  }
  .book.missing .bnative {
    font-size: 15px;
  }
  .toggle {
    margin: 6px 0 30px;
  }
  .credits {
    border-top: 1px solid var(--line);
    padding-top: 16px;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--muted-5);
  }
  .credits p {
    margin: 0 0 4px;
  }
  @media (max-width: 599px) {
    .logo {
      display: none;
    }
  }
</style>
