<script lang="ts">
  import type { LoadedBook } from '../data/loader';
  import { search, type SearchHit } from '../data/model';
  import type { Labels } from '../i18n/labels';

  interface Props {
    book: LoadedBook;
    L: Labels;
    srcRtl: boolean;
    align?: 'left' | 'right';
    onpick: (hit: SearchHit) => void;
  }
  let { book, L, srcRtl, align = 'left', onpick }: Props = $props();

  let query = $state('');
  let hits = $state<SearchHit[]>([]);
  let busy = $state(false);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  function run() {
    clearTimeout(timer);
    const q = query;
    if (!q.trim()) {
      hits = [];
      return;
    }
    timer = setTimeout(async () => {
      busy = true;
      await book.ensureAll(); // search covers the whole book
      if (q === query) hits = search(book, q);
      busy = false;
    }, 160);
  }

  function pick(h: SearchHit) {
    query = '';
    hits = [];
    open = false;
    onpick(h);
  }
</script>

<div class="search" data-print="hide">
  <input
    class="input"
    type="search"
    bind:value={query}
    oninput={() => ((open = true), run())}
    onfocus={() => (open = true)}
    onkeydown={(e) => {
      if (e.key === 'Escape') ((query = ''), (hits = []), (open = false));
      if (e.key === 'Enter' && hits[0]) pick(hits[0]);
    }}
    placeholder={L.search}
    aria-label={L.search}
  />
  {#if open && query.trim()}
    <div class="results" class:right={align === 'right'} role="listbox">
      {#each hits as h (h.key)}
        <button class="hit" role="option" aria-selected="false" onclick={() => pick(h)}>
          <span class="mono ref">{h.ref}</span>
          <span class="ta">{h.ta}</span>
          <span class="gr" dir={srcRtl ? 'rtl' : undefined}>{h.gr}</span>
        </button>
      {/each}
      {#if !hits.length}
        <div class="none">{busy ? L.searching : L.noResults}</div>
      {/if}
    </div>
  {/if}
</div>
<svelte:window onclick={(e) => { if (!(e.target as HTMLElement).closest('.search')) open = false; }} />

<style>
  .search {
    position: relative;
  }
  .input {
    width: 230px;
    max-width: 44vw;
  }
  .results {
    position: absolute;
    top: 38px;
    left: 0;
    z-index: 50;
    width: 340px;
    max-width: 86vw;
    max-height: 340px;
    overflow: auto;
    background: var(--card);
    border: 1px solid #e0d9c9;
    border-radius: 10px;
    box-shadow: 0 14px 34px -18px rgba(31, 42, 51, 0.35);
  }
  .results.right {
    left: auto;
    right: 0;
  }
  .hit {
    display: flex;
    gap: 9px;
    align-items: baseline;
    width: 100%;
    text-align: left;
    padding: 7px 11px;
    border: none;
    border-bottom: 1px solid #f0ebdf;
    background: transparent;
  }
  .hit:hover {
    background: var(--accent-wash);
  }
  .ref {
    font-size: 10.5px;
    color: var(--accent);
    flex: 0 0 auto;
  }
  .ta {
    font-family: var(--f-ta);
    font-size: 14px;
  }
  .gr {
    font-family: var(--f-gr);
    font-size: 13px;
    color: var(--muted-3);
  }
  .none {
    padding: 10px 12px;
    font-size: 12.5px;
    color: var(--muted-5);
  }
</style>
