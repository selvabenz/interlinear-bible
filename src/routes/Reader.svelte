<script lang="ts">
  /**
   * Reading and Study views of one book (ports of docs/design/reading-view and study-view).
   * Everything is driven by the loaded book: passages, chapters, languages and direction.
   */
  import { onMount, tick } from 'svelte';
  import type { Catalog } from '../lib/pipeline/types';
  import { loadBook, loadCatalog, forgetBook, LoadedBook, editionsOf, pickEdition } from '../lib/data/loader';
  import { deleteLocalBook, listLocalBooks } from '../lib/data/local';
  import { bookInfo } from '../lib/pipeline/books';
  import { sourcesFor } from '../lib/pipeline/sources';
  import {
    passageVerses, passageChapters, referencedChapters, verseItems, verseNotes, detailFor, occurrences,
    passageMap, passageLabel, passageRange, passageOf, keyRef, unitAnchor, unitStatus,
    type Item, type Order, type SearchHit
  } from '../lib/data/model';
  import { LABELS, langName, statusLabel } from '../lib/i18n/labels';
  import { prefs } from '../lib/stores/prefs.svelte';
  import { flags, flagKey, setFlag, clearFlag } from '../lib/stores/flags.svelte';
  import { go, replace, type Route } from '../lib/stores/router.svelte';
  import { esvPassage } from '../lib/esv';
  import WordStack from '../lib/components/WordStack.svelte';
  import DetailCard from '../lib/components/DetailCard.svelte';
  import SearchBox from '../lib/components/SearchBox.svelte';
  import FlagEditor from '../lib/components/FlagEditor.svelte';

  type ReaderRoute = Extract<Route, { name: 'read' | 'study' }>;
  let { route }: { route: ReaderRoute } = $props();

  const L = $derived(LABELS[prefs.ui]);
  let book = $state.raw<LoadedBook | null>(null);
  let catalog = $state.raw<Catalog | null>(null);
  let error = $state('');
  let version = $state(0);
  let loadingPassage = $state(true);
  let sel = $state<string | null>(null);
  let hover = $state<Item | null>(null);
  let flagOpen = $state<string | null>(null);
  let narrow = $state(false);
  let layersOpen = $state(false);
  let esv = $state<Record<string, string> | null>(null);
  let esvErr = $state('');
  let scrollTarget: string | null = null;
  /** source texts this book is available in (default first) */
  let editions = $state.raw<string[]>([]);
  const testament = $derived(bookInfo(route.book)?.testament ?? 'NT');

  const mode = $derived(route.name);
  const meta = $derived(book?.meta);
  const passages = $derived(meta?.passages ?? []);
  const passage = $derived(passages.find((p) => p.id === route.passage) ?? passages[0]);
  const pIndex = $derived(passage ? passages.indexOf(passage) : -1);
  const translation = $derived(catalog?.translations.find((t) => t.id === route.translation));
  const sourceInfo = $derived(catalog?.sources.find((s) => s.id === meta?.source));
  const srcRtl = $derived(sourceInfo ? sourceInfo.dir === 'rtl' : meta?.testament === 'OT');
  const targetLang = $derived(langName(translation?.language ?? 'ta', prefs.ui));
  const sourceLang = $derived(langName(sourceInfo?.language ?? (meta?.testament === 'OT' ? 'hbo' : 'grc'), prefs.ui));
  const deck = $derived(
    [translation?.shortName ?? translation?.name ?? route.translation, sourceInfo?.shortName ?? sourceInfo?.name ?? ''].filter(Boolean).join(' · ')
  );
  const srcName = (id: string | undefined) => (id ? catalog?.sources.find((s) => s.id === id)?.shortName ?? id : '');
  /** a derived edition: its alignment was remapped from the source text it was made against */
  const remapNote = $derived.by(() => {
    const ed = meta?.edition;
    if (!ed || ed.primary || !ed.from) return '';
    return L.editionRemapped(srcName(ed.from), ed.dropped ?? 0) + (ed.semanticOmitted ? ' ' + L.editionStudyMarks(srcName(ed.from)) : '');
  });

  const verses = $derived.by(() => {
    void version;
    return book && passage ? passageVerses(book, passage) : [];
  });
  const rows = $derived(
    verses.map((v) => ({
      v,
      ref: `${v.c}:${v.v}`,
      label: book && book.meta.chapters.length > 1 ? `${v.c}:${v.v}` : String(v.v),
      items: verseItems(book!, v, prefs.order, prefs.ui),
      notes: prefs.layers.notes ? verseNotes(book!, v, prefs.ui, L) : []
    }))
  );
  const detail = $derived.by(() => {
    void version;
    return book && sel ? detailFor(book, sel, prefs.ui, L) : null;
  });
  const selUnits = $derived(new Set(detail?.unit ? [detail.unit.id] : []));
  const occ = $derived(book && detail ? occurrences(book, detail.strongs, detail.key.startsWith('t:') ? detail.key : '') : []);
  const occTitle = $derived(`${L.occ}${detail?.strongs.length ? ' · ' + detail.strongs.join(' ') : ''}`);
  const passageUnits = $derived.by(() => {
    void version;
    return book && passage ? book.unitsInRange(passage.start, passage.end) : [];
  });
  const findings = $derived(passageUnits.filter((u) => u.finding));
  const mapRows = $derived(book ? passageMap(book, verses, L) : []);

  // ---------------------------------------------------------------- loading
  onMount(() => {
    (async () => {
      const c = await loadCatalog().catch(() => null);
      catalog = c;
      const local = await listLocalBooks();
      editions = editionsOf(c, route.translation, route.book, testament, local);
      const tr = c?.translations.find((t) => t.id === route.translation);
      const source = pickEdition(editions, route.src, prefs.sources[testament]) ?? route.src ?? sourcesFor(tr, testament)[0];
      book = await loadBook(route.translation, route.book, source);
    })().catch((e) => (error = `${L.loadError} (${(e as Error).message})`));
    const onResize = () => (narrow = window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $effect(() => {
    const b = book;
    const p = passage;
    if (!b || !p) return;
    loadingPassage = !passageChapters(p).every((c) => b.hasChapter(c));
    (async () => {
      try {
        await b.ensureChapters(passageChapters(p));
        await b.ensureChapters(referencedChapters(passageVerses(b, p)));
        version += 1;
        loadingPassage = false;
      } catch (e) {
        error = `${L.loadError} (${(e as Error).message})`;
      }
    })();
  });

  // selection follows the URL (?w=) when the route changes
  $effect(() => {
    sel = route.w ?? null;
    scrollTarget = route.w ?? null;
    flagOpen = null;
  });

  // keep the URL in step with the passage and selected word (no history entries)
  $effect(() => {
    if (!passage) return;
    replace({ ...route, passage: passage.id, w: sel ?? undefined });
  });

  $effect(() => {
    if (meta && passage) document.title = `${meta.name.native} ${passageRange(passage)} · ${passageLabel(passage, prefs.ui, L)}`;
  });

  // scroll a word chosen elsewhere (search, occurrences, links) into view once it is drawn
  $effect(() => {
    void version;
    void rows;
    const k = scrollTarget;
    if (!k) return;
    tick().then(() => {
      const el = document.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrollTarget = null;
      }
    });
  });

  // English verse (ESV API, key supplied by the reader)
  $effect(() => {
    esv = null;
    esvErr = '';
    const key = prefs.esvKey;
    if (!prefs.layers.esv || !key || !meta || !passage) return;
    const p = passage;
    esvPassage(key, meta.id, p.start, p.end)
      .then((r) => {
        if (p === passage) esv = r;
      })
      .catch((e) => (esvErr = (e as Error).message || L.esvError));
  });

  // ---------------------------------------------------------------- actions
  function routeTo(name: 'read' | 'study', passageId?: string, w?: string) {
    go({ name, translation: route.translation, book: route.book, passage: passageId, w, src: route.src });
  }

  /** Open the same passage in another source-text edition and remember the choice. */
  function switchSource(id: string) {
    if (!meta || id === meta.source) return;
    // translation-word keys are the same in every edition; source-word keys are not
    let w = sel ?? undefined;
    if (w?.startsWith('s:') && book) {
      const sw = book.source(w.slice(2));
      w = sw?.tgt[0] ? `t:${sw.tgt[0]}` : undefined;
    }
    prefs.sources = { ...prefs.sources, [testament]: id };
    go({ name: mode, translation: route.translation, book: route.book, passage: passage?.id, w, src: id });
  }

  function selectKey(key: string, scroll = true) {
    if (!passage) return;
    const ref = keyRef(key);
    const p = passageOf(passages, ref);
    if (p && p.id !== passage.id) {
      routeTo(mode, p.id, key);
      return;
    }
    sel = key;
    if (scroll) scrollTarget = key;
  }

  function toggleSelect(key: string) {
    sel = sel === key ? null : key;
  }

  function goToVerse(ref: string) {
    const p = passageOf(passages, ref);
    if (p) routeTo(mode, p.id);
  }

  function setOrder(o: Order) {
    if (o === prefs.order) return;
    // keep the selection on the counterpart word in the new order
    if (sel && book) {
      if (o === 'source' && sel.startsWith('t:')) {
        const tw = book.target(sel.slice(2));
        sel = tw?.src[0] ? `s:${tw.src[0]}` : null;
      } else if (o === 'target' && sel.startsWith('s:')) {
        const sw = book.source(sel.slice(2));
        sel = sw?.tgt[0] ? `t:${sw.tgt[0]}` : null;
      }
    }
    prefs.order = o;
  }

  function onSearchPick(h: SearchHit) {
    const key = prefs.order === 'target' ? h.key : (() => {
      const tw = book?.target(h.key.slice(2));
      return tw?.src[0] ? `s:${tw.src[0]}` : h.key;
    })();
    if (prefs.order === 'source' && key.startsWith('t:')) prefs.order = 'target';
    selectKey(key);
  }

  function onOccPick(key: string) {
    if (prefs.order === 'source') prefs.order = 'target';
    selectKey(key);
  }

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      sel = null;
      layersOpen = false;
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !rows.length) return;
    e.preventDefault();
    const flip = prefs.order === 'source' && srcRtl;
    const key = flip ? ({ ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' } as Record<string, string>)[e.key] ?? e.key : e.key;
    let r = rows.findIndex((row) => row.items.some((i) => i.key === sel));
    let i = r >= 0 ? rows[r].items.findIndex((x) => x.key === sel) : -1;
    const next = (rr: number) => (rr + 1) % rows.length;
    const prev = (rr: number) => (rr - 1 + rows.length) % rows.length;
    if (r < 0) {
      r = 0;
      i = 0;
    } else if (key === 'ArrowRight') {
      i += 1;
      while (i >= rows[r].items.length) { r = next(r); i = 0; if (rows[r].items.length) break; }
    } else if (key === 'ArrowLeft') {
      i -= 1;
      while (i < 0) { r = prev(r); i = rows[r].items.length - 1; }
    } else if (key === 'ArrowDown') {
      r = next(r);
      i = Math.min(i, rows[r].items.length - 1);
    } else if (key === 'ArrowUp') {
      r = prev(r);
      i = Math.min(i, rows[r].items.length - 1);
    }
    const it = rows[r]?.items[Math.max(0, i)];
    if (it) selectKey(it.key);
  }

  async function removeLocal() {
    if (!meta) return;
    await deleteLocalBook(meta.translation, meta.id, meta.source);
    forgetBook(meta.translation, meta.id, meta.source);
    location.reload();
  }

  const layerList = $derived([
    ['translit', L.translit],
    ['gloss', L.gloss],
    ['strong', L.strong],
    ['morph', L.morph],
    ['esv', L.esv],
    ['notes', L.notes]
  ] as [keyof typeof prefs.layers, string][]);

  const statLines = $derived.by(() => {
    if (!meta) return [];
    const s = meta.stats;
    if (meta.hasSemantic) {
      const s7 = s.unitsByS7;
      return [
        [L.statUnits, s.units],
        [L.statPreserved, (s7.PRESERVED ?? 0) + (s7.PRESERVED_WITH_RESTRUCTURING ?? 0)],
        [L.statFlagged, (s7.MEANING_SHIFT ?? 0) + (s7.PARTIAL ?? 0) + (s7.UNDERTRANSLATED ?? 0) + (s7.OVERTRANSLATED ?? 0)],
        [L.statMissing, s.unitsByCov.POSSIBLY_MISSING ?? 0],
        [L.statCross, s.crossVerseUnits],
        [L.statUnsupported, s.supportStates.POSSIBLY_UNSUPPORTED ?? 0]
      ] as [string, number][];
    }
    return [
      [L.statWords, s.targetWords],
      [L.statSource, s.sourceWords],
      [L.statGroups, s.groups],
      [L.statUnaligned, s.sourceUnaligned]
    ] as [string, number][];
  });

  const crossTitle = $derived(prefs.order === 'target' ? L.sourceOf : L.realizedIn);
</script>

<svelte:window onkeydown={onKey} />

{#snippet langSeg()}
  <div class="seg" role="group" aria-label="Interface language">
    <button aria-pressed={prefs.ui === 'en'} onclick={() => (prefs.ui = 'en')}>EN</button>
    <button aria-pressed={prefs.ui === 'ta'} onclick={() => (prefs.ui = 'ta')}>தமிழ்</button>
  </div>
{/snippet}

{#snippet viewSeg()}
  <div class="seg" role="group" aria-label="View">
    <button aria-pressed={mode === 'read'} onclick={() => routeTo('read', passage?.id, sel ?? undefined)}>{L.reading}</button>
    <button aria-pressed={mode === 'study'} onclick={() => routeTo('study', passage?.id, sel ?? undefined)}>{L.study}</button>
  </div>
{/snippet}

{#snippet orderSeg()}
  <div class="seg" role="group" aria-label={L.orderHint} title={L.orderHint}>
    <button aria-pressed={prefs.order === 'target'} onclick={() => setOrder('target')}>{L.orderTarget(targetLang)}</button>
    <button aria-pressed={prefs.order === 'source'} onclick={() => setOrder('source')}>{L.orderSource(sourceLang)}</button>
  </div>
{/snippet}

{#snippet sourceSeg()}
  {#if editions.length > 1 && meta}
    <div class="seg" role="group" aria-label={L.sourceText} title={L.sourceText} data-testid="source-switch">
      {#each editions as s (s)}
        <button aria-pressed={meta.source === s} onclick={() => switchSource(s)}>{srcName(s)}</button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet editionNote()}
  {#if remapNote}<p class="edition-note" data-print="hide">{remapNote}</p>{/if}
{/snippet}

{#snippet libLink()}
  <a class="home" href="#/" title={L.library} aria-label={L.library} data-print="hide">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.2C3.6 2.4 5.6 2.4 8 3.6c2.4-1.2 4.4-1.2 6-.4v9.6c-1.6-.8-3.6-.8-6 .4-2.4-1.2-4.4-1.2-6-.4z M8 3.6v9.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
  </a>
{/snippet}

{#snippet passageNav()}
  {#if passages.length > 1}
    <div class="pnav" data-print="hide">
      <button class="btn ghost" disabled={pIndex <= 0} onclick={() => routeTo(mode, passages[pIndex - 1].id)}>‹ {pIndex > 0 ? passageLabel(passages[pIndex - 1], prefs.ui, L) : L.prev}</button>
      <button class="btn ghost" disabled={pIndex >= passages.length - 1} onclick={() => routeTo(mode, passages[pIndex + 1].id)}>{pIndex < passages.length - 1 ? passageLabel(passages[pIndex + 1], prefs.ui, L) : L.next} ›</button>
    </div>
  {/if}
{/snippet}

{#snippet verseBlock(row: (typeof rows)[number])}
  {@const fk = flagKey(route.translation, route.book, row.ref)}
  {@const flag = flags[fk]}
  {@const hasFinding = row.notes.some((n) => n.tone === 'flag')}
  <div class="verse {mode}" id="v{row.ref}">
    {#each row.v.h ?? [] as h, k (k)}<div class="vhead">{h}</div>{/each}
    <div class="vrow">
      <div class="vnum">
        <span class="mono num">{row.label}</span>
        {#if hasFinding}<span class="mark" title="Study mark on this verse">◆</span>{/if}
        <button class="flagbtn" class:on={!!flag} data-print="hide" title={L.flag} aria-label={L.flag}
          onclick={() => (flagOpen = flagOpen === row.ref ? null : row.ref)}>⚑</button>
      </div>
      <div class="vbody">
        <div class="words" dir={prefs.order === 'source' && srcRtl ? 'rtl' : undefined}>
          {#each row.items as item (item.key)}
            {#if item.br && prefs.order === 'target'}<span class="br"></span>{/if}
            <WordStack
              {item} {mode} order={prefs.order} layers={prefs.layers} {srcRtl}
              selected={sel === item.key}
              related={sel !== item.key && item.units.some((u) => selUnits.has(u))}
              crossTitle={item.crossTo ? crossTitle(item.crossTo) : ''}
              onselect={toggleSelect}
              onhover={(it) => (hover = it)}
              oncross={goToVerse}
            />
          {/each}
        </div>

        {#if prefs.layers.esv && esv?.[row.ref]}
          <div class="esv"><span class="mono tag">ESV</span>{esv[row.ref]}</div>
        {/if}

        {#if row.notes.length}
          <div class="notes">
            {#each row.notes as n, k (k)}
              <div class="nline"><span class="badge {n.tone}">{n.kind}</span><span class="ntext">{n.text}</span></div>
            {/each}
          </div>
        {/if}

        {#if detail && detail.ref === row.ref && (mode === 'read' || narrow)}
          <DetailCard d={detail} {L} variant={mode === 'read' ? 'read' : 'inline'} {occ} {occTitle} {srcRtl}
            englishVerse={esv?.[row.ref]} onclose={() => (sel = null)} onpick={onOccPick} />
        {/if}

        {#if flagOpen === row.ref}
          <FlagEditor {L} verseLabel={row.label} note={flag?.note ?? ''} reason={flag?.reason ?? 'meaning'}
            onsave={(note, reason) => { setFlag(fk, note, reason); flagOpen = null; }}
            oncancel={() => (flagOpen = null)} />
        {:else if flag}
          <div class="saved-flag">
            <span class="sf-tag">{L.reasons[flag.reason] ?? flag.reason}</span>
            <span class="sf-note">{flag.note}</span>
            <button data-print="hide" onclick={() => clearFlag(fk)}>{L.remove}</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

{#snippet passageBody()}
  {#if book?.local}
    <div class="local" data-print="hide">{L.localBanner} <button class="btn ghost" onclick={removeLocal}>{L.removeLocal}</button></div>
  {/if}
  {#if prefs.layers.esv && !prefs.esvKey}
    <div class="hint" data-print="hide">{L.esvNeedsKey} <a href="#/settings">{L.settings}</a></div>
  {:else if prefs.layers.esv && esvErr}
    <div class="hint">{L.esvError} {esvErr}</div>
  {/if}
  {#if loadingPassage && !rows.length}
    <p class="loading">{L.loading}</p>
  {/if}
  {#each rows as row (row.ref)}
    {@render verseBlock(row)}
  {/each}
{/snippet}

{#if error}
  <main class="state"><p>{error}</p><a href="#/">{L.backToLibrary}</a></main>
{:else if !meta || !passage}
  <main class="state"><p>{L.loading}</p></main>
{:else if mode === 'read'}
  <!-- ======================================================== READING VIEW -->
  <div class="page">
    <header class="hdr read" data-print="hide">
      <div class="bar1 w960">
        {@render libLink()}
        <div class="title">
          <span class="bname">{meta.name.native}</span>
          <span class="deck">{deck}</span>
        </div>
        <div class="grow"></div>
        <SearchBox book={book!} {L} {srcRtl} onpick={onSearchPick} />
        {@render sourceSeg()}
        {@render langSeg()}
        <div class="layers">
          <button class="btn" class:active={layersOpen} onclick={() => (layersOpen = !layersOpen)} aria-expanded={layersOpen}>{L.layers}</button>
          {#if layersOpen}
            <div class="layer-panel">
              {#each layerList as [k, label] (k)}
                <button class="layer" onclick={() => (prefs.layers[k] = !prefs.layers[k])} aria-pressed={prefs.layers[k]}>
                  <span class="dot" class:on={prefs.layers[k]}></span>{label}
                </button>
              {/each}
              <div class="layer-sep"></div>
              <div class="layer-order">{@render orderSeg()}</div>
            </div>
          {/if}
        </div>
        {@render viewSeg()}
      </div>
      <nav class="tabs w960" aria-label={L.passages}>
        {#each passages as p (p.id)}
          <button class="tab" class:on={p.id === passage.id} onclick={() => routeTo('read', p.id)}>
            <span>{passageLabel(p, prefs.ui, L)}</span>
            <span class="mono range">{passageRange(p)}</span>
          </button>
        {/each}
      </nav>
    </header>

    <main class="read-main">
      <div class="read-card">
        <div class="ptitle">
          <h1>{passageLabel(passage, prefs.ui, L)}</h1>
          <span class="mono range">{passageRange(passage)}</span>
          <span class="grow"></span>
          <span class="order-chip">{prefs.order === 'target' ? L.orderTarget(targetLang) : L.orderSource(sourceLang)}</span>
        </div>
        {@render editionNote()}
        {@render passageBody()}
        {@render passageNav()}
        <div class="foot">
          {#if meta.hasSemantic}
            <span>{meta.stats.units} {L.units}</span>
            <span>{statLines[2]?.[1]} {L.findings}</span>
            <span>{meta.stats.crossVerseUnits} {L.statCross.toLowerCase()}</span>
            <span>{L.reviewNote}</span>
          {:else}
            <span>{meta.stats.targetWords} {L.words}</span>
          {/if}
        </div>
        {#if prefs.layers.esv && esv}<div class="copy">{L.esvCopyright}</div>{/if}
      </div>
    </main>

    {#if hover}
      <div class="hoverbar" data-print="hide">
        <span class="ta">{hover.main}</span><span class="dotsep">·</span>
        <span class="gr">{hover.second}</span><span class="dotsep">·</span>
        <span class="gl">{hover.gl}</span>
        <span class="mono st">{hover.st}</span>
      </div>
    {/if}
  </div>
{:else}
  <!-- ======================================================== STUDY VIEW -->
  <div class="page">
    <header class="hdr study" data-print="hide">
      <div class="bar1 w1400">
        <button class="railbtn" class:on={prefs.railOpen} title={L.tools} aria-label={L.tools} aria-expanded={prefs.railOpen}
          onclick={() => (prefs.railOpen = !prefs.railOpen)}><span></span><span></span><span></span></button>
        {@render libLink()}
        <div class="title inline">
          <span class="bname">{meta.name.native}</span>
          <span class="deck">{deck}</span>
        </div>
        <div class="grow"></div>
        <SearchBox book={book!} {L} {srcRtl} align="right" onpick={onSearchPick} />
        <button class="btn" onclick={() => { prefs.layers.notes = true; setTimeout(() => window.print(), 260); }}>{L.print}</button>
        {@render sourceSeg()}
        {@render langSeg()}
        {@render viewSeg()}
      </div>
      <div class="bar2 w1400">
        <span class="eyebrow">{L.layers}</span>
        {#each layerList as [k, label] (k)}
          <button class="chip" aria-pressed={prefs.layers[k]} onclick={() => (prefs.layers[k] = !prefs.layers[k])}>{label}</button>
        {/each}
        <span class="grow"></span>
        {@render orderSeg()}
      </div>
    </header>

    <div class="study-wrap w1400" data-print="wrap">
      {#if prefs.railOpen}
        <aside class="rail" data-print="hide">
          <section>
            <div class="eyebrow">{L.passages}</div>
            <div class="plist">
              {#each passages as p (p.id)}
                <button class="pitem" class:on={p.id === passage.id} onclick={() => routeTo('study', p.id)}>
                  <span class="pl">{passageLabel(p, prefs.ui, L)}</span>
                  <span class="mono pr">{passageRange(p)}</span>
                </button>
              {/each}
            </div>
          </section>
          <section>
            <div class="eyebrow">{L.map}</div>
            {#each mapRows as m (m.src)}
              <div class="maprow" class:moved={m.moved}>
                <span class="mono src">{m.src}</span>
                <span class="arrow">→</span>
                <span class="mono tgt">{m.tgt}</span>
                <span class="tag">{m.tag}</span>
              </div>
            {/each}
          </section>
          {#if findings.length}
            <section>
              <div class="eyebrow">{L.marks}</div>
              {#each findings as u (u.id)}
                {@const anchor = unitAnchor(u)}
                <button class="finding" class:on={sel === anchor} onclick={() => { if (prefs.order === 'source' && anchor.startsWith('t:')) prefs.order = 'target'; selectKey(anchor); }}>
                  <span class="fsrc" dir={srcRtl ? 'rtl' : undefined}>{u.content}</span>
                  <span class="fmeta"><span class="mono">{u.src}</span><span class="fst">{statusLabel(unitStatus(u), prefs.ui)}</span></span>
                </button>
              {/each}
            </section>
          {/if}
          <section class="stats">
            {#each statLines as [label, value] (label)}
              <div class="stat"><span>{label}</span><span class="mono">{value}</span></div>
            {/each}
          </section>
        </aside>
      {/if}

      <main class="study-main" data-print="page">
        <div class="ptitle">
          <h1>{passageLabel(passage, prefs.ui, L)}</h1>
          <span class="mono range">{passageRange(passage)}</span>
          <span class="grow"></span>
          <span class="kbd" data-print="hide">{L.kbdHint}</span>
        </div>
        {@render editionNote()}
        {@render passageBody()}
        {@render passageNav()}
        <div class="foot small">
          <span>{sourceInfo?.name ?? ''} · {translation?.name ?? ''}</span>
          <span>{sourceInfo?.attribution ?? ''}</span>
        </div>
        {#if prefs.layers.esv && esv}<div class="copy">{L.esvCopyright}</div>{/if}
      </main>

      {#if !narrow}
        <section class="panel-col" data-print="hide">
          <div class="under">
            <div class="eyebrow light">{L.hover}</div>
            <div class="uw">
              <span class="ta">{hover?.main ?? '—'}</span>
              <span class="gr">{hover?.second ?? ''}</span>
            </div>
            <div class="ugl">{hover?.gl ?? ''}</div>
          </div>
          {#if detail}
            <div class="panel card">
              <DetailCard d={detail} {L} variant="panel" {occ} {occTitle} {srcRtl} englishVerse={esv?.[detail.ref]}
                onclose={() => (sel = null)} onpick={onOccPick} />
            </div>
          {:else}
            <div class="empty card">
              <div class="et">{L.emptyTitle}</div>
              <div class="eb">{L.emptyBody}</div>
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page {
    min-height: 100vh;
  }
  .state {
    max-width: 560px;
    margin: 80px auto;
    padding: 0 16px;
    text-align: center;
    color: var(--muted-2);
  }
  .w960 {
    max-width: 960px;
    margin: 0 auto;
  }
  .w1400 {
    max-width: 1400px;
    margin: 0 auto;
  }
  .grow {
    flex: 1 1 20px;
  }

  /* header */
  .hdr {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--bar);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar1 {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 22px;
  }
  .hdr.read .bar1 {
    padding: 13px 22px 6px;
  }
  .bar2 {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    padding: 0 22px 10px;
  }
  .home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--input-line);
    border-radius: 8px;
    background: var(--card);
    color: var(--muted-4);
    flex: 0 0 auto;
  }
  .home:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .title.inline {
    flex-direction: row;
    align-items: baseline;
    gap: 9px;
  }
  .bname {
    font-family: var(--f-ta-head);
    font-size: 19px;
    font-weight: 500;
    line-height: 1.2;
  }
  .study .bname {
    font-size: 17px;
  }
  .deck {
    font-size: 10.5px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted-4);
    white-space: nowrap;
  }
  .study .deck {
    font-size: 10px;
    letter-spacing: 0.14em;
  }
  .layers {
    position: relative;
  }
  .btn.active {
    border-color: var(--accent);
    background: #eaf4f2;
  }
  .layer-panel {
    position: absolute;
    top: 40px;
    right: 0;
    z-index: 50;
    min-width: 220px;
    padding: 6px 0;
    background: var(--card);
    border: 1px solid #e0d9c9;
    border-radius: 10px;
    box-shadow: 0 14px 34px -18px rgba(31, 42, 51, 0.35);
  }
  .layer {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    font-size: 12.5px;
    color: var(--ink-3);
    text-align: left;
  }
  .layer:hover {
    background: var(--accent-wash);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: 0 0 auto;
    border: 1px solid #c9d0cd;
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .layer-sep {
    height: 1px;
    background: #f0ebdf;
    margin: 6px 0;
  }
  .layer-order {
    padding: 4px 12px 6px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 0 22px;
    scrollbar-width: thin;
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 10px 14px 11px;
    border: none;
    background: transparent;
    font-size: 13px;
    white-space: nowrap;
    color: var(--muted-4);
    box-shadow: inset 0 -2px 0 transparent;
  }
  .tab.on {
    color: var(--accent-dark);
    font-weight: 600;
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .tab .range {
    font-size: 10px;
    opacity: 0.6;
    font-weight: 400;
  }
  .railbtn {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--input-line);
    border-radius: 8px;
    background: var(--card);
    color: var(--muted-4);
    padding: 0;
  }
  .railbtn span {
    display: block;
    width: 13px;
    height: 1.5px;
    background: currentColor;
    margin: 2px 0;
  }
  .railbtn.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-dark);
  }

  /* reading layout */
  .read-main {
    max-width: 820px;
    margin: 0 auto;
    padding: 40px 22px 140px;
  }
  .read-card {
    background: var(--card);
    border: 1px solid var(--card-line);
    border-radius: 14px;
    padding: 38px 34px 30px;
    box-shadow: 0 1px 2px rgba(31, 42, 51, 0.03), 0 10px 30px -22px rgba(31, 42, 51, 0.18);
  }
  .ptitle {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .ptitle h1 {
    margin: 0;
    font-family: var(--f-ta-head);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .ptitle .range {
    font-size: 11px;
    color: var(--muted-5);
  }
  .order-chip {
    font-size: 11px;
    color: var(--muted-6);
  }
  .edition-note {
    margin: 0 0 14px;
    font-size: 12px;
    color: var(--muted-3);
  }
  .study-main .ptitle {
    margin-bottom: 18px;
    padding-bottom: 12px;
  }
  .study-main .ptitle h1 {
    font-size: 18px;
  }
  .kbd {
    font-size: 11px;
    color: var(--muted-7);
  }

  /* verse */
  .verse.read {
    margin-bottom: 26px;
  }
  .verse.study {
    padding: 10px 0 12px;
    border-bottom: 1px solid var(--line-faint);
  }
  .vhead {
    font-family: var(--f-ta-head);
    font-size: 15px;
    color: var(--muted);
    margin: 6px 0 16px 48px;
    letter-spacing: 0.01em;
  }
  .study .vhead {
    font-size: 14px;
    margin: 4px 0 12px 36px;
  }
  .vrow {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .study .vrow {
    gap: 12px;
  }
  .vnum {
    flex: 0 0 34px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
    padding-top: 6px;
  }
  .study .vnum {
    flex-basis: 30px;
    gap: 4px;
    padding-top: 3px;
  }
  .num {
    font-size: 12px;
    color: var(--muted-6);
  }
  .mark {
    color: var(--mark);
    font-size: 8px;
  }
  .flagbtn {
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12px;
    color: var(--faint);
  }
  .flagbtn.on,
  .flagbtn:hover {
    color: var(--accent);
  }
  .vbody {
    flex: 1 1 0;
    min-width: 0;
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .br {
    flex-basis: 100%;
    height: 0;
  }
  .esv {
    margin-top: 10px;
    font-family: var(--f-gr);
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--muted-2);
  }
  .esv .tag {
    font-size: 9.5px;
    letter-spacing: 0.12em;
    color: #b0a88f;
    margin-right: 8px;
  }
  .notes {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--card-line);
  }
  .nline {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-top: 5px;
  }
  .ntext {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--muted-2);
  }
  .saved-flag {
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 13px;
    background: #f3faf8;
    border-left: 2px solid var(--accent);
    border-radius: 0 8px 8px 0;
  }
  .sf-tag {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #4d8a84;
  }
  .sf-note {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-4);
  }
  .saved-flag button {
    border: none;
    background: transparent;
    color: var(--muted-5);
    font-size: 11px;
    padding: 0;
  }
  .local,
  .hint {
    margin: -10px 0 22px;
    padding: 10px 13px;
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 1.5;
    background: var(--gold-soft);
    color: var(--gold);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .hint {
    background: #f1eee6;
    color: var(--muted-2);
  }
  .loading {
    color: var(--muted-5);
  }
  .pnav {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 22px;
  }
  .foot {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid var(--line-soft);
    display: flex;
    flex-wrap: wrap;
    gap: 6px 22px;
    font-size: 11.5px;
    color: var(--muted-5);
  }
  .foot.small {
    margin-top: 16px;
    padding-top: 12px;
    gap: 4px 18px;
    font-size: 11px;
    color: var(--muted-7);
  }
  .copy {
    margin-top: 8px;
    font-size: 10.5px;
    color: var(--muted-6);
  }
  .hoverbar {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 0;
    z-index: 30;
    display: flex;
    align-items: baseline;
    gap: 10px;
    max-width: 820px;
    margin: 0 auto 16px;
    padding: 11px 18px;
    background: rgba(31, 42, 51, 0.94);
    color: var(--card);
    border-radius: 10px;
    box-shadow: 0 16px 34px -20px rgba(31, 42, 51, 0.6);
    overflow: hidden;
    white-space: nowrap;
  }
  .hoverbar .ta {
    font-family: var(--f-ta);
    font-size: 15px;
  }
  .hoverbar .gr {
    font-family: var(--f-gr);
    font-size: 15px;
    color: #cfe6e2;
  }
  .hoverbar .gl {
    font-size: 13px;
    color: #e8e3d6;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hoverbar .st {
    font-size: 10.5px;
    color: #9dbdb9;
    margin-left: auto;
  }
  .dotsep {
    color: #c9cfd2;
  }

  /* study layout */
  .study-wrap {
    padding: 22px 22px 90px;
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .rail {
    flex: 1 1 190px;
    max-width: 250px;
    min-width: 180px;
    position: sticky;
    top: 112px;
    max-height: calc(100vh - 130px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .rail .eyebrow {
    margin-bottom: 8px;
  }
  .plist {
    max-height: 40vh;
    overflow-y: auto;
  }
  .pitem {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 11px;
    margin-bottom: 3px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted-3);
  }
  .pitem.on {
    background: var(--accent-soft);
    color: var(--accent-dark);
    font-weight: 600;
  }
  .pl {
    display: block;
    font-size: 13px;
    line-height: 1.35;
  }
  .pr {
    display: block;
    font-size: 10px;
    opacity: 0.65;
    margin-top: 2px;
  }
  .maprow {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 4px 7px;
    border-radius: 6px;
  }
  .maprow.moved {
    background: #f2f7f5;
  }
  .maprow .src {
    font-size: 10.5px;
    color: var(--muted-3);
    flex: 0 0 38px;
  }
  .maprow .arrow {
    color: #c9cfd2;
    font-size: 10px;
  }
  .maprow .tgt {
    font-size: 10.5px;
    color: var(--ink-3);
  }
  .maprow .tag {
    font-size: 10px;
    color: var(--mark);
    margin-left: auto;
  }
  .finding {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    margin-bottom: 3px;
    border: none;
    border-left: 2px solid #e3ece9;
    border-radius: 0 8px 8px 0;
    background: transparent;
  }
  .finding.on {
    border-left-color: var(--mark);
    background: #eef5f3;
  }
  .fsrc {
    display: block;
    font-family: var(--f-gr);
    font-size: 13.5px;
    color: var(--greek-strong);
  }
  .fmeta {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-top: 3px;
  }
  .fmeta .mono {
    font-size: 9.5px;
    color: var(--muted-6);
  }
  .fst {
    font-size: 10.5px;
    color: var(--mark);
  }
  .stats {
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 11.5px;
    color: var(--muted-4);
  }
  .stat .mono {
    color: var(--muted);
  }
  .study-main {
    flex: 4 1 460px;
    min-width: 0;
    background: var(--card);
    border: 1px solid var(--card-line);
    border-radius: 12px;
    padding: 24px 24px 20px;
  }
  .panel-col {
    flex: 2 1 290px;
    min-width: 270px;
    position: sticky;
    top: 112px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  .under {
    background: var(--dark);
    border-radius: 12px;
    padding: 13px 15px;
    color: var(--card);
  }
  .eyebrow.light {
    color: #9dbdb9;
    margin-bottom: 6px;
    font-size: 9.5px;
  }
  .uw {
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
  }
  .uw .ta {
    font-family: var(--f-ta);
    font-size: 16px;
  }
  .uw .gr {
    font-family: var(--f-gr);
    font-size: 15px;
    color: #cfe6e2;
  }
  .ugl {
    font-size: 12.5px;
    color: #e0dccf;
    margin-top: 3px;
    min-height: 18px;
  }
  .panel {
    overflow: hidden;
    max-height: calc(100vh - 220px);
    overflow-y: auto;
  }
  .empty {
    padding: 18px;
  }
  .et {
    font-family: var(--f-ta-head);
    font-size: 15px;
    color: var(--muted);
    line-height: 1.7;
  }
  .eb {
    font-size: 12.5px;
    color: var(--muted-5);
    line-height: 1.65;
    margin-top: 6px;
  }

  @media (max-width: 640px) {
    /* the full header is tall on a phone: let it scroll away with the page */
    .hdr {
      position: static;
    }
    .bar2 {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .bar2 .chip {
      flex: 0 0 auto;
    }
    .study .deck {
      display: none;
    }
    .bar1,
    .hdr.read .bar1 {
      padding: 10px 16px 6px;
      gap: 8px;
    }
    .bar2,
    .tabs {
      padding-left: 16px;
      padding-right: 16px;
    }
    .read-main {
      padding: 18px 10px 120px;
    }
    .read-card {
      padding: 22px 14px 20px;
      border-radius: 12px;
    }
    .study-wrap {
      padding: 14px 10px 80px;
    }
    .study-main {
      padding: 18px 12px;
    }
    .vrow {
      gap: 8px;
    }
    .vnum {
      flex-basis: 24px;
    }
    .vhead {
      margin-left: 32px;
    }
    .rail {
      position: static;
      max-width: none;
      max-height: none;
    }
    .kbd {
      display: none;
    }
    .hoverbar {
      display: none;
    }
    /* phones: the Layers menu becomes a bottom sheet, wherever the header wrapped the button */
    .layer-panel {
      position: fixed;
      top: auto;
      left: 12px;
      right: 12px;
      bottom: 12px;
      min-width: 0;
      padding: 10px 0;
      box-shadow: 0 -10px 40px -12px rgba(31, 42, 51, 0.45);
    }
  }
</style>
