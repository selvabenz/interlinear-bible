<script lang="ts">
  import { onMount } from 'svelte';
  import type { BookMeta, Catalog, CatalogBook } from '../lib/pipeline/types';
  import { BOOKS } from '../lib/pipeline/books';
  import { loadCatalog, bookUrl, saveForOffline, isSavedOffline } from '../lib/data/loader';
  import { listLocalBooks } from '../lib/data/local';
  import { LABELS } from '../lib/i18n/labels';
  import { prefs } from '../lib/stores/prefs.svelte';
  import { href } from '../lib/stores/router.svelte';

  const L = $derived(LABELS[prefs.ui]);
  let catalog = $state.raw<Catalog | null>(null);
  let local = $state.raw<BookMeta[]>([]);
  let error = $state('');
  let saving = $state<Record<string, string>>({});

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
    data?: CatalogBook;
    local?: boolean;
  }

  const entries = $derived.by(() => {
    const pub = new Map((catalog?.books ?? []).filter((b) => b.translation === trId).map((b) => [b.id, b]));
    const loc = new Map(local.filter((b) => b.translation === trId).map((b) => [b.id, b]));
    return BOOKS.map((info): Entry => {
      const lb = loc.get(info.id);
      const data: CatalogBook | undefined = lb
        ? {
            id: lb.id, translation: lb.translation, name: lb.name, testament: lb.testament, order: lb.order,
            chapters: lb.chapters.length, verses: lb.stats.verses, hasSemantic: lb.hasSemantic, hash: lb.hash,
            findings: lb.stats.findings, units: lb.stats.units
          }
        : pub.get(info.id);
      return {
        id: info.id,
        en: info.en,
        native: data?.name.native ?? (translation?.language === 'ta' ? info.ta : info.en),
        testament: info.testament,
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
    const k = `${trId}/${e.id}`;
    try {
      saving[k] = L.offlineSaving;
      const meta = (await (await fetch(bookUrl(trId, e.id))).json()) as BookMeta;
      await saveForOffline(trId, e.id, meta.chapters.map((c) => c.c), (d, t) => (saving[k] = `${L.offlineSaving} ${d}/${t}`));
      saving[k] = L.offlineSaved;
    } catch (err) {
      saving[k] = (err as Error).message;
    }
  }
</script>

<div class="page">
  <header class="hdr">
    <div class="bar">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16"><path d="M2 3.2C3.6 2.4 5.6 2.4 8 3.6c2.4-1.2 4.4-1.2 6-.4v9.6c-1.6-.8-3.6-.8-6 .4-2.4-1.2-4.4-1.2-6-.4z M8 3.6v9.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
        </span>
        <div>
          <div class="name">{L.appName}</div>
          <div class="deck">{translation?.shortName ?? translation?.name ?? ''}</div>
        </div>
      </div>
      <div class="grow"></div>
      <a class="btn" href={href({ name: 'import' })}>{L.import}</a>
      <a class="btn" href={href({ name: 'settings' })}>{L.settings}</a>
      <div class="seg" role="group" aria-label="Interface language">
        <button aria-pressed={prefs.ui === 'en'} onclick={() => (prefs.ui = 'en')}>EN</button>
        <button aria-pressed={prefs.ui === 'ta'} onclick={() => (prefs.ui = 'ta')}>தமிழ்</button>
      </div>
    </div>
  </header>

  <main class="main">
    <section class="hero">
      <h1>{L.heroTitle}</h1>
      <p>{L.heroBody}</p>
      <div class="hero-meta">
        <span class="pill ok">{L.booksAvailable(available.length)}</span>
        {#if translations.length > 1}
          <label class="trsel">
            <span class="eyebrow">{L.translation}</span>
            <select class="input" value={trId} onchange={(e) => (prefs.translation = (e.target as HTMLSelectElement).value)}>
              {#each translations as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
    </section>

    {#if error}
      <p class="err">{L.loadError} ({error})</p>
    {/if}

    {#each groups as g (g.t)}
      <section class="testament">
        <div class="thead">
          <h2>{g.label}</h2>
          <span class="mono count">{g.count} / {g.t === 'OT' ? 39 : 27} {L.available}</span>
        </div>
        <div class="grid">
          {#each g.books as e (e.id)}
            {#if e.data}
              {@const k = `${trId}/${e.id}`}
              <article class="book card">
                <div class="btop">
                  <div>
                    <div class="bnative">{e.native}</div>
                    <div class="ben">{e.en}</div>
                  </div>
                  {#if e.local}<span class="pill flag">{L.local}</span>{/if}
                </div>
                <div class="bstats mono">
                  <span>{e.data.chapters} {L.chapter.toLowerCase()}{e.data.chapters === 1 ? '' : 's'}</span>
                  <span>{e.data.verses} {L.verses}</span>
                  {#if e.data.hasSemantic}<span>{e.data.units} {L.units}</span>{/if}
                  {#if e.data.findings}<span class="fl">◆ {e.data.findings}</span>{/if}
                </div>
                <div class="bactions">
                  <a class="btn primary" href={href({ name: 'read', translation: trId, book: e.id })}>{L.openReading}</a>
                  <a class="btn" href={href({ name: 'study', translation: trId, book: e.id })}>{L.openStudy}</a>
                  <span class="grow"></span>
                  {#if !e.local}
                    <button class="btn ghost off" title={L.offline} onclick={() => offline(e)}>
                      {saving[k] ?? (isSavedOffline(trId, e.id) ? '✓ ' + L.offlineSaved : '↓ ' + L.offline)}
                    </button>
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

<style>
  .hdr {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--bar);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px 22px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo {
    display: inline-flex;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--accent);
    color: var(--card);
  }
  .name {
    font-size: 15px;
    font-weight: 600;
  }
  .deck {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted-4);
  }
  .grow {
    flex: 1 1 10px;
  }
  .main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 34px 22px 80px;
  }
  .hero {
    max-width: 720px;
    margin-bottom: 34px;
  }
  .hero h1 {
    font-family: var(--f-gr);
    font-weight: 400;
    font-size: clamp(26px, 4vw, 36px);
    line-height: 1.2;
    margin: 0 0 12px;
    color: var(--ink);
  }
  :global(html[lang='ta']) .hero h1 {
    font-family: var(--f-ta-head);
    font-size: clamp(22px, 3.4vw, 30px);
  }
  .hero p {
    font-size: 15px;
    line-height: 1.65;
    color: var(--muted);
    margin: 0 0 16px;
  }
  .hero-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .trsel {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .err {
    color: var(--danger);
  }
  .testament {
    margin-bottom: 30px;
  }
  .thead {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
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
    padding: 16px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 1px 2px rgba(31, 42, 51, 0.03), 0 10px 30px -24px rgba(31, 42, 51, 0.18);
  }
  .btop {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .bnative {
    font-family: var(--f-ta-head);
    font-size: 19px;
    font-weight: 500;
    line-height: 1.3;
  }
  .ben {
    font-size: 12px;
    color: var(--muted-4);
  }
  .bstats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 10.5px;
    color: var(--muted-3);
  }
  .bstats .fl {
    color: var(--mark);
  }
  .bactions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .bactions a.btn {
    border-bottom-width: 1px;
  }
  .off {
    font-size: 11.5px;
    padding: 6px 6px;
  }
  .book.missing {
    padding: 12px 14px;
    border: 1px dashed var(--input-line);
    border-radius: 12px;
    opacity: 0.6;
  }
  .book.missing .bnative {
    font-size: 15px;
  }
  .toggle {
    margin: 10px 0 30px;
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
  @media (max-width: 640px) {
    .bar {
      padding: 10px 16px;
    }
    .main {
      padding: 24px 16px 60px;
    }
  }
</style>
