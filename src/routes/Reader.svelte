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
  import type { Passage } from '../lib/pipeline/types';
  import { LABELS, langName, statusLabel } from '../lib/i18n/labels';
  import { prefs } from '../lib/stores/prefs.svelte';
  import { flags, flagKey, setFlag, clearFlag } from '../lib/stores/flags.svelte';
  import { go, replace, type Route } from '../lib/stores/router.svelte';
  import { esvPassage } from '../lib/esv';
  import WordStack from '../lib/components/WordStack.svelte';
  import DetailCard from '../lib/components/DetailCard.svelte';
  import SearchBox from '../lib/components/SearchBox.svelte';
  import FlagEditor from '../lib/components/FlagEditor.svelte';
  import AppBar from '../lib/components/AppBar.svelte';
  import AppMenu from '../lib/components/AppMenu.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import { ui, type ReaderCtx } from '../lib/stores/ui.svelte';
  import type { BookMeta } from '../lib/pipeline/types';

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
  /** below 900px: no side panel in study, the word detail opens under the verse */
  let narrow = $state(false);
  /** 1200px and up: the study tools can sit beside the text */
  let wide = $state(false);
  let menuOpen = $state(false);
  /** index of the section being read (the section map under the app bar follows it) */
  let activeSec = $state(0);
  let secnav = $state<HTMLElement>();
  let toolsOpen = $state(false);
  let localBooks = $state.raw<BookMeta[]>([]);
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
  /** passage name; chapters are named in the Bible's language */
  const plabel = (p: Passage) => passageLabel(p, prefs.ui, L, translation?.language);
  /** where a passage starts, as a number: "8" in a one-chapter book, "2:1" otherwise */
  const startNum = (p: Passage) => {
    const [c, v] = p.start.split(':');
    return book && book.meta.chapters.length > 1 ? `${c}:${v}` : v;
  };
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
  /**
   * Verses grouped under their section headings. A heading that only repeats the passage name
   * ("அத்தியாயம் 2" over chapter 2) is left out; the passage title already says it.
   */
  const sections = $derived.by(() => {
    const title = passage ? plabel(passage).trim() : '';
    const out: { heads: string[]; rows: typeof rows }[] = [];
    for (const row of rows) {
      const heads = (row.v.h ?? []).filter((h) => h.trim() !== title);
      if (!out.length || heads.length) out.push({ heads, rows: [] });
      out[out.length - 1].rows.push(row);
    }
    return out;
  });
  /** the section map: one chip per section, named by its heading (or the passage) and first verse */
  const secChips = $derived(
    sections.map((s) => ({ label: s.heads[s.heads.length - 1] ?? (passage ? plabel(passage) : ''), num: s.rows[0]?.label ?? '' }))
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
      localBooks = local;
      editions = editionsOf(c, route.translation, route.book, testament, local);
      const tr = c?.translations.find((t) => t.id === route.translation);
      const source = pickEdition(editions, route.src, prefs.sources[testament]) ?? route.src ?? sourcesFor(tr, testament)[0];
      book = await loadBook(route.translation, route.book, source);
    })().catch((e) => (error = `${L.loadError} (${(e as Error).message})`));
    const onResize = () => {
      narrow = window.innerWidth < 900;
      wide = window.innerWidth >= 1200;
    };
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
    if (meta && passage) document.title = `${meta.name.native} ${passageRange(passage)} · ${plabel(passage)}`;
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

  // a verse asked for from search ("3:16", "Rom 8:1"): scroll to it once drawn
  $effect(() => {
    void rows;
    const ref = ui.scrollVerse;
    if (!ref) return;
    tick().then(() => {
      const el = document.getElementById(`v${ref}`);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        ui.scrollVerse = null;
      }
    });
  });

  // the section being read: the last one whose top has passed under the app bar and section map
  $effect(() => {
    void sections;
    let raf = 0;
    const spy = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const els = [...document.querySelectorAll<HTMLElement>('.sec[data-sec]')];
        const line = (secnav?.getBoundingClientRect().bottom ?? 100) + 12;
        let k = 0;
        for (const [i, el] of els.entries()) if (el.getBoundingClientRect().top <= line) k = i;
        // at the very end of the page the last section counts as read
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && els.length) k = els.length - 1;
        activeSec = k;
      });
    };
    spy();
    addEventListener('scroll', spy, { passive: true });
    addEventListener('resize', spy);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', spy);
      removeEventListener('resize', spy);
    };
  });

  // keep the active section's chip in view in the section map
  $effect(() => {
    const k = activeSec;
    const nav = secnav;
    if (!nav) return;
    const chip = nav.querySelector<HTMLElement>(`[data-chip="${k}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  });

  function goToSection(k: number) {
    document.querySelector(`.sec[data-sec="${k}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

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
    if (document.querySelector('dialog[open]')) return; // an open sheet handles its own keys
    if (e.key === 'Escape') {
      sel = null;
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

  const readerCtx = $derived<ReaderCtx>({
    editions,
    source: meta?.source ?? '',
    srcName,
    onsource: switchSource,
    onorder: setOrder,
    targetLang,
    sourceLang,
    note: remapNote
  });

  /** Study tools: beside the text on wide screens, otherwise in a sheet. */
  function openTools() {
    menuOpen = false;
    if (wide) prefs.railOpen = !prefs.railOpen;
    else toolsOpen = true;
  }

  function printPassage() {
    menuOpen = false;
    prefs.layers.notes = true;
    setTimeout(() => window.print(), 260);
  }

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


{#snippet passageNav()}
  {#if passages.length > 1}
    <div class="pnav" data-print="hide">
      <button class="btn ghost" disabled={pIndex <= 0} onclick={() => routeTo(mode, passages[pIndex - 1].id)}>
        <Icon name="back" size={16} /><span>{pIndex > 0 ? plabel(passages[pIndex - 1]) : L.prev}</span>
      </button>
      <button class="btn ghost next" disabled={pIndex >= passages.length - 1} onclick={() => routeTo(mode, passages[pIndex + 1].id)}>
        <span>{pIndex < passages.length - 1 ? plabel(passages[pIndex + 1]) : L.next}</span><Icon name="chevron" size={16} />
      </button>
    </div>
  {/if}
{/snippet}

{#snippet verseBlock(row: (typeof rows)[number])}
  {@const fk = flagKey(route.translation, route.book, row.ref)}
  {@const flag = flags[fk]}
  {@const hasFinding = row.notes.some((n) => n.tone === 'flag')}
  <div class="verse {mode}" id="v{row.ref}">
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

{#snippet passageTitle()}
  <div class="ptitle">
    <h1>{plabel(passage!)}</h1>
    <span class="mono range">{passageRange(passage!)}</span>
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
  {#each sections as s, k (k)}
    <section class="sec" data-sec={k}>
      {#if s.heads.length}
        <div class="vhead">{#each s.heads as h, j (j)}<div>{h}</div>{/each}</div>
      {/if}
      {#each s.rows as row (row.ref)}
        {@render verseBlock(row)}
      {/each}
    </section>
  {/each}
{/snippet}

{#snippet sectionMap()}
  <!-- the book as a map of its sections, under the app bar; it follows the reading -->
  <nav class="secnav" aria-label={L.passages} data-print="hide">
    <div class="sn-track" bind:this={secnav} style:max-width={mode === 'study' ? '1400px' : 'calc(var(--read-w) + 2 * var(--gutter))'}>
      {#each passages as p (p.id)}
        {#if p.id === passage?.id}
          {#each secChips as c, k (k)}
            <button class="chip-sec here" class:first={k === 0} class:last={k === secChips.length - 1} data-chip={k}
              aria-current={activeSec === k ? 'location' : undefined} onclick={() => goToSection(k)}>
              <span class="mono n">{c.num}</span><span class="t">{c.label}</span>
            </button>
          {/each}
        {:else}
          <button class="chip-sec" onclick={() => routeTo(mode, p.id)}>
            <span class="mono n">{startNum(p)}</span><span class="t">{plabel(p)}</span>
          </button>
        {/if}
      {/each}
    </div>
  </nav>
{/snippet}

{#snippet railContent()}
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
        <button class="finding" class:on={sel === anchor} onclick={() => {
          if (prefs.order === 'source' && anchor.startsWith('t:')) prefs.order = 'target';
          toolsOpen = false;
          selectKey(anchor);
        }}>
          <span class="fsrc" class:he={srcRtl} dir={srcRtl ? 'rtl' : undefined}>{u.content}</span>
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
{/snippet}

{#snippet menuNav()}
  <div class="seg mseg" role="group" aria-label={L.view}>
    <button aria-pressed={mode === 'read'} onclick={() => routeTo('read', passage?.id, sel ?? undefined)}>{L.reading}</button>
    <button aria-pressed={mode === 'study'} onclick={() => routeTo('study', passage?.id, sel ?? undefined)}>{L.study}</button>
  </div>
  {#if mode === 'study'}
    <button class="mi" aria-pressed={wide && prefs.railOpen} onclick={openTools}><Icon name="panel" /><span>{L.tools}</span></button>
    <button class="mi" onclick={printPassage}><Icon name="print" /><span>{L.print}</span></button>
  {/if}
{/snippet}

{#if error}
  <main class="state"><p>{error}</p><a href="#/">{L.backToLibrary}</a></main>
{:else if !meta || !passage}
  <main class="state"><p>{L.loading}</p></main>
{:else}
  <div class="page {mode}">
    <AppBar menuLabel={L.menu} onmenu={() => (menuOpen = true)} width={mode === 'study' ? '1400px' : 'calc(var(--read-w) + 2 * var(--gutter) + 120px)'}>
      <a class="where" href="#/" title={L.library}>
        <span class="bname">{meta.name.native}</span>
        <span class="pname">{deck}</span>
      </a>
      {#snippet actions()}
        <SearchBox {L} {catalog} translation={route.translation} local={localBooks} book={book!} {mode} {srcRtl} compact onpick={onSearchPick} />
      {/snippet}
    </AppBar>
    {@render sectionMap()}

    {#if mode === 'read'}
      <!-- ======================================================== READING VIEW -->
      <main class="read-main">
        <div class="read-card">
          {@render passageTitle()}
          {@render passageBody()}
          {@render passageNav()}
          <div class="foot">
            <span>{deck}</span>
            {#if remapNote}<span class="edition-note">{remapNote}</span>{/if}
            {#if meta.hasSemantic}
              <span>{meta.stats.units} {L.units}</span>
              <span>{statLines[2]?.[1]} {L.findings}</span>
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
          <span class="gr" dir={srcRtl && prefs.order === 'target' ? 'rtl' : undefined}>{hover.second}</span><span class="dotsep">·</span>
          <span class="gl">{hover.gl}</span>
          <span class="mono st">{hover.st}</span>
        </div>
      {/if}
    {:else}
      <!-- ======================================================== STUDY VIEW -->
      <div class="study-wrap" class:rail-on={wide && prefs.railOpen} class:panel-on={!narrow} data-print="wrap">
        {#if wide && prefs.railOpen}
          <aside class="rail" data-print="hide">{@render railContent()}</aside>
        {/if}

        <main class="study-main" data-print="page">
          {@render passageTitle()}
          {@render passageBody()}
          {@render passageNav()}
          <div class="foot small">
            {#if remapNote}<span class="edition-note">{remapNote}</span>{/if}
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
                <span class="gr" dir={srcRtl && prefs.order === 'target' ? 'rtl' : undefined}>{hover?.second ?? ''}</span>
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
                <div class="kbd">{L.kbdHint}</div>
              </div>
            {/if}
          </section>
        {/if}
      </div>
    {/if}
  </div>

  <AppMenu bind:open={menuOpen} nav={menuNav} reader={readerCtx} />

  {#if mode === 'study'}
    <Sheet bind:open={toolsOpen} title={L.tools} closeLabel={L.close} side="right">
      <div class="rail in-sheet">{@render railContent()}</div>
    </Sheet>
  {/if}
{/if}

<style>
  .page {
    min-height: 100vh;
    min-height: 100dvh;
  }
  .state {
    max-width: 560px;
    margin: 80px auto;
    padding: 0 16px;
    text-align: center;
    color: var(--muted-2);
  }

  /* app bar: where am I (opens the passage list) */
  .where {
    border-bottom: none;
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--ink);
    text-align: start;
  }
  .where:hover {
    background: var(--hover);
  }
  .bname {
    flex: 0 0 auto;
    max-width: 60%;
    min-width: 0;
    font-family: var(--f-ta-head);
    font-size: 17px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pname {
    flex: 0 1 auto;
    min-width: 0;
    font-size: 10.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* the section map under the app bar: follows the reading, tap a section to go to it */
  .secnav {
    position: sticky;
    top: var(--bar-offset);
    z-index: 35;
    background: var(--bar);
    backdrop-filter: saturate(1.4) blur(12px);
    -webkit-backdrop-filter: saturate(1.4) blur(12px);
    border-bottom: 1px solid var(--line);
    transition: top 0.22s ease;
  }
  .sn-track {
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--nav-h);
    margin: 0 auto;
    padding: 0 var(--gutter);
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    /* soft edges: more sections lie either side */
    -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--gutter), #000 calc(100% - var(--gutter)), transparent);
    mask-image: linear-gradient(to right, transparent, #000 var(--gutter), #000 calc(100% - var(--gutter)), transparent);
  }
  .sn-track::-webkit-scrollbar {
    display: none;
  }
  .chip-sec {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    max-width: min(260px, 72vw);
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--muted-2);
    font-size: 13px;
    line-height: 1.2;
    white-space: nowrap;
    transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
  }
  .chip-sec:hover {
    border-color: var(--accent-line);
    color: var(--ink);
  }
  .chip-sec .t {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--f-ta-head);
  }
  .chip-sec .n {
    flex: 0 0 auto;
    font-size: 10.5px;
    color: var(--muted-5);
  }
  /* sections of the passage being read, joined into one group */
  .chip-sec.here {
    border-color: var(--accent-line);
    background: var(--accent-wash);
    color: var(--ink-3);
  }
  .chip-sec.here:not(.last) {
    margin-right: -4px;
  }
  .chip-sec[aria-current='location'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .chip-sec[aria-current='location'] .n {
    color: var(--on-accent);
    opacity: 0.8;
  }

  /* reading layout: one calm column */
  .read-main {
    max-width: calc(var(--read-w) + 2 * var(--gutter));
    margin: 0 auto;
    padding: 6px var(--gutter) 120px;
  }
  .read-card {
    --surface: var(--bg);
  }
  .ptitle {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 22px;
    padding: 8px 0 12px;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface, var(--card));
  }
  .ptitle h1 {
    margin: 0;
    font-family: var(--f-ta-head);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
  .ptitle .range {
    font-size: 11.5px;
    color: var(--muted-5);
  }
  .edition-note {
    color: var(--muted-4);
  }

  /* sections: a tap in the section map lands the heading just under the map */
  .sec,
  .verse {
    scroll-margin-top: calc(var(--bar-h) + var(--nav-h) + 10px);
  }
  .vhead {
    margin: 0 0 14px;
    padding: 10px 0 8px;
    border-bottom: 1px solid var(--line-faint);
    font-family: var(--f-ta-head);
    font-size: 15.5px;
    font-weight: 500;
    color: var(--muted);
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
  .sec + .sec {
    margin-top: 10px;
  }

  /* verse */
  .verse.read {
    margin-bottom: 22px;
  }
  .verse.study {
    padding: 10px 0 12px;
    border-bottom: 1px solid var(--line-faint);
  }
  .vrow {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .vnum {
    flex: 0 0 26px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    padding-top: 6px;
  }
  .num {
    font-size: 12px;
    color: var(--muted-5);
  }
  .mark {
    color: var(--mark);
    font-size: 8px;
  }
  .flagbtn {
    border: none;
    background: transparent;
    padding: 2px 4px;
    margin-right: -4px;
    font-size: 13px;
    line-height: 1;
    color: var(--faint);
    border-radius: 4px;
    transition: opacity 0.15s ease;
  }
  .flagbtn.on,
  .flagbtn:hover {
    color: var(--accent);
  }
  /* with a mouse the flag appears on the verse being pointed at; on touch it stays faint */
  @media (hover: hover) {
    .flagbtn:not(.on) {
      opacity: 0;
    }
    .verse:hover .flagbtn,
    .flagbtn:focus-visible {
      opacity: 1;
    }
  }
  .vbody {
    flex: 1 1 0;
    min-width: 0;
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    min-width: 0;
  }
  .br {
    flex-basis: 100%;
    height: 0;
  }
  .esv {
    margin-top: 10px;
    font-family: var(--f-gr);
    font-size: 15px;
    line-height: 1.65;
    color: var(--muted-2);
  }
  .esv .tag {
    font-size: 9.5px;
    letter-spacing: 0.12em;
    color: var(--muted-6);
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
    min-width: 0;
  }
  .ntext {
    flex: 1 1 0;
    min-width: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted-2);
    overflow-wrap: anywhere;
  }
  .saved-flag {
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 13px;
    background: var(--accent-wash);
    border-left: 2px solid var(--accent);
    border-radius: 0 8px 8px 0;
  }
  .sf-tag {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent-mid);
  }
  .sf-note {
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--ink-4);
    overflow-wrap: anywhere;
  }
  .saved-flag button {
    border: none;
    background: transparent;
    color: var(--muted-5);
    font-size: 12px;
    padding: 2px 4px;
  }
  .local,
  .hint {
    margin: 0 0 20px;
    padding: 10px 13px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
    background: var(--gold-soft);
    color: var(--gold);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .hint {
    background: var(--soft);
    color: var(--muted-2);
  }
  .loading {
    color: var(--muted-5);
  }
  .pnav {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 26px;
  }
  .pnav .btn {
    max-width: 48%;
    min-height: 44px;
    text-align: start;
  }
  .pnav .next {
    margin-left: auto;
    text-align: end;
  }
  .foot {
    margin-top: 26px;
    padding-top: 16px;
    border-top: 1px solid var(--line-soft);
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    font-size: 11.5px;
    color: var(--muted-5);
  }
  .foot.small {
    font-size: 11px;
    color: var(--muted-6);
  }
  .copy {
    margin-top: 8px;
    font-size: 10.5px;
    color: var(--muted-6);
  }
  .hoverbar {
    display: none;
  }
  /* pointer devices: what is under the cursor, in a quiet bar at the bottom */
  @media (hover: hover) and (min-width: 900px) {
    .hoverbar {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 0;
      z-index: 30;
      display: flex;
      align-items: baseline;
      gap: 10px;
      max-width: var(--read-w);
      margin: 0 auto 16px;
      padding: 10px 18px;
      background: var(--dark);
      color: var(--on-dark);
      border-radius: 12px;
      box-shadow: var(--shadow-pop);
      overflow: hidden;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0.96;
    }
  }
  .hoverbar .ta {
    font-size: 15px;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hoverbar .gr {
    font-size: 15px;
    color: var(--on-dark-accent);
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hoverbar .gl {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    color: var(--on-dark-2);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hoverbar .st {
    font-size: 10.5px;
    color: var(--on-dark-muted);
    flex: 0 0 auto;
  }
  .dotsep {
    color: var(--on-dark-muted);
  }

  /* study layout */
  .study-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    align-items: start;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--gutter) 90px;
  }
  .study-wrap.panel-on {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  }
  .study-wrap.panel-on.rail-on {
    grid-template-columns: 230px minmax(0, 1fr) minmax(280px, 340px);
  }
  .study-main {
    min-width: 0;
    --surface: var(--bg);
  }
  .study-main .ptitle {
    margin-bottom: 14px;
  }
  .study-main .ptitle h1 {
    font-size: 19px;
  }
  .study .vhead {
    font-size: 14.5px;
  }
  .rail,
  .panel-col {
    position: sticky;
    top: calc(var(--bar-h) + var(--nav-h) + 14px);
    margin-top: 14px;
    max-height: calc(100vh - var(--bar-h) - var(--nav-h) - 28px);
    max-height: calc(100dvh - var(--bar-h) - var(--nav-h) - 28px);
  }
  .rail {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
  .rail.in-sheet {
    position: static;
    margin-top: 0;
    max-height: none;
    overflow: visible;
    padding: 6px 16px 10px;
  }
  .rail .eyebrow {
    margin-bottom: 8px;
  }
  .maprow {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 7px;
    padding: 4px 7px;
    border-radius: 6px;
  }
  .maprow.moved {
    background: var(--accent-wash);
  }
  .maprow .src {
    font-size: 10.5px;
    color: var(--muted-3);
    min-width: 38px;
  }
  .maprow .arrow {
    color: var(--muted-6);
    font-size: 10px;
  }
  .maprow .tgt {
    font-size: 10.5px;
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .maprow .tag {
    font-size: 10px;
    color: var(--mark);
    margin-left: auto;
  }
  .finding {
    display: block;
    width: 100%;
    text-align: start;
    padding: 8px 10px;
    margin-bottom: 3px;
    border: none;
    border-left: 2px solid var(--accent-line-soft);
    border-radius: 0 8px 8px 0;
    background: transparent;
  }
  .finding.on {
    border-left-color: var(--mark);
    background: var(--accent-soft);
  }
  .fsrc {
    display: block;
    font-family: var(--f-gr);
    font-size: 14px;
    color: var(--greek-strong);
    overflow-wrap: anywhere;
  }
  .fsrc.he {
    font-family: var(--f-he);
    font-size: 16px;
  }
  .fmeta {
    display: flex;
    flex-wrap: wrap;
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
    font-size: 12px;
    color: var(--muted-4);
  }
  .stat .mono {
    color: var(--muted);
  }
  .panel-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .under {
    display: none;
    background: var(--dark);
    border-radius: var(--r-md);
    padding: 12px 15px;
    color: var(--on-dark);
  }
  @media (hover: hover) {
    .under {
      display: block;
    }
  }
  .eyebrow.light {
    color: var(--on-dark-muted);
    margin-bottom: 6px;
    font-size: 9.5px;
  }
  .uw {
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
    overflow-wrap: anywhere;
  }
  .uw .ta {
    font-size: 16px;
  }
  .uw .gr {
    font-size: 15px;
    color: var(--on-dark-accent);
  }
  .ugl {
    font-size: 12.5px;
    color: var(--on-dark-2);
    margin-top: 3px;
    min-height: 18px;
    overflow-wrap: anywhere;
  }
  .panel {
    overflow-y: auto;
    min-height: 0;
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
    font-size: 13px;
    color: var(--muted-5);
    line-height: 1.65;
    margin-top: 6px;
  }
  .kbd {
    display: none;
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--muted-6);
  }
  @media (hover: hover) {
    .kbd {
      display: block;
    }
  }

  /* tablets and up: the text sits on a card */
  @media (min-width: 900px) {
    .read-main {
      padding-top: 0;
    }
    .read-card,
    .study-main {
      border-top: none !important;
      border-top-left-radius: 0 !important;
      border-top-right-radius: 0 !important;
    }
    .read-card,
    .study-main {
      --surface: var(--card);
      background: var(--card);
      border: 1px solid var(--card-line);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-1);
    }
    .read-card {
      padding: 26px 34px 28px;
    }
    .study-main {
      padding: 18px 24px 20px;
    }
    .vnum {
      flex-basis: 34px;
    }
    .vrow {
      gap: 14px;
    }
  }
  @media (max-width: 380px) {
    .vnum {
      flex-basis: 20px;
    }
    .vrow {
      gap: 6px;
    }
    .pname {
      display: none;
    }
  }
</style>
