<script lang="ts" module>
  /** One stop on the book's map: a section of the passage being read, or another passage. */
  export interface NavItem {
    label: string;
    /** where it starts ("8", "2:1") */
    num: string;
    /** its verses ("8–22") */
    range: string;
    /** number of verses, for sizing the rail */
    size: number;
    /** 0–1: how much of it has been read (passages before this one count as read) */
    progress: number;
    current: boolean;
    go: () => void;
  }
</script>

<script lang="ts">
  /**
   * The section navigator under the app bar. It follows the reading and is a way to move
   * through the book without book/chapter/verse pickers. Three looks, chosen in Reading settings:
   *  - rail: the current section's name over a line split into sections, each filling as it is read
   *  - tabs: text tabs with a hairline under each that fills as it is read
   *  - ring: the verse being read in a ring that fills through the section, and a whole-book line
   */
  import { onMount } from 'svelte';
  import type { NavStyle } from '../stores/prefs.svelte';
  import type { Labels } from '../i18n/labels';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    items: NavItem[];
    kind: NavStyle;
    /** the verse at the reading line ("5", "2:7") */
    verse: string;
    title: string;
    L: Labels;
    width: string;
  }
  let { items, kind, verse, title, L, width }: Props = $props();

  let root = $state<HTMLElement>();
  let track = $state<HTMLElement>();
  let listOpen = $state(false);
  let sheetOpen = $state(false);

  const cur = $derived(Math.max(0, items.findIndex((i) => i.current)));
  const now = $derived(items[cur]);
  const total = $derived(items.reduce((n, i) => n + i.size, 0) || 1);
  const book = $derived(items.reduce((n, i) => n + i.size * i.progress, 0) / total);
  const RING = 2 * Math.PI * 14;

  // sticky offsets below the navigator follow its real height
  onMount(() => {
    if (!root) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--nav-h', `${root!.offsetHeight}px`));
    ro.observe(root);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--nav-h');
    };
  });

  // tabs: keep the current tab in the middle
  $effect(() => {
    const k = cur;
    if (kind !== 'tabs' || !track) return;
    const t = track.querySelector<HTMLElement>(`[data-i="${k}"]`);
    if (t) track.scrollTo({ left: Math.max(0, t.offsetLeft - (track.clientWidth - t.offsetWidth) / 2), behavior: 'smooth' });
  });

  function pick(i: NavItem) {
    listOpen = false;
    sheetOpen = false;
    i.go();
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && listOpen && ((listOpen = false), e.stopPropagation())}
  onclick={(e) => listOpen && root && !root.contains(e.target as Node) && (listOpen = false)}
/>

<nav class="secnav kind-{kind}" aria-label={L.passages} bind:this={root} data-print="hide">
  <div class="inner" style:max-width={width}>
    {#if kind === 'rail' && now}
      <button class="row" aria-expanded={listOpen} onclick={() => (listOpen = !listOpen)}>
        <span class="mono num">{now.range}</span>
        <span class="t">{now.label}</span>
        <span class="mono count">{cur + 1}/{items.length}</span>
        <span class="chev"><Icon name="down" size={15} /></span>
      </button>
      <div class="pieces">
        {#each items as it, i (i)}
          <button class="piece" class:now={it.current} style:flex-grow={it.size} aria-label="{it.num} {it.label}"
            aria-current={it.current ? 'location' : undefined} onclick={() => pick(it)}>
            <i style:transform="scaleX({it.progress})"></i>
          </button>
        {/each}
      </div>
      {#if listOpen}
        <div class="list">
          {#each items as it, i (i)}
            <button class="item" class:now={it.current} onclick={() => pick(it)}>
              <span class="mono r">{it.range}</span>
              <span class="n">{it.label}</span>
              <span class="p"><b style:width="{it.progress * 100}%"></b></span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if kind === 'tabs'}
      <div class="track" bind:this={track}>
        {#each items as it, i (i)}
          <button class="tab" class:now={it.current} data-i={i} aria-current={it.current ? 'location' : undefined} onclick={() => pick(it)}>
            <span class="top"><span class="mono num">{it.num}</span><span class="t">{it.label}</span></span>
            <span class="bar"><b style:width="{it.progress * 100}%"></b></span>
          </button>
        {/each}
      </div>
    {:else if now}
      <button class="nowline" onclick={() => (sheetOpen = true)} aria-haspopup="dialog">
        <span class="ring" aria-hidden="true">
          <svg viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="14" /><circle class="fg" cx="17" cy="17" r="14" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - now.progress)} /></svg>
          <span class="mono">{verse}</span>
        </span>
        <span class="txt"><span class="t">{now.label}</span><span class="sub">{L.verseWord} {verse} · {cur + 1} / {items.length}</span></span>
        <span class="chev"><Icon name="down" size={15} /></span>
      </button>
    {/if}
  </div>
  {#if kind === 'ring'}<div class="bookline"><b style:width="{book * 100}%"></b></div>{/if}
</nav>

{#if kind === 'ring'}
  <Sheet bind:open={sheetOpen} {title} closeLabel={L.close}>
    <ol class="timeline">
      {#each items as it, i (i)}
        <li class:done={it.progress >= 1 && !it.current} class:now={it.current}>
          <button onclick={() => pick(it)}>
            <span class="dot"></span><span class="n">{it.label}</span><span class="mono r">{it.range}</span>
          </button>
        </li>
      {/each}
    </ol>
  </Sheet>
{/if}

<style>
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
  .inner {
    position: relative;
    margin: 0 auto;
    padding: 0 var(--gutter);
  }
  button {
    border: none;
    background: none;
    text-align: start;
  }
  .mono {
    font-family: var(--f-mono);
  }
  .t {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--f-ta-head);
  }
  .chev {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--muted-4);
    transition: transform 0.2s ease;
  }

  /* ---------- rail ---------- */
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 9px 0 6px;
    color: var(--ink);
  }
  .row .num {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--accent);
  }
  .row .t {
    flex: 1 1 auto;
    font-size: 14.5px;
  }
  .row .count {
    flex: 0 0 auto;
    font-size: 10.5px;
    color: var(--muted-4);
  }
  .row[aria-expanded='true'] .chev {
    transform: rotate(180deg);
  }
  .pieces {
    display: flex;
    gap: 3px;
    padding-bottom: 10px;
  }
  .piece {
    position: relative;
    flex-basis: 0;
    min-width: 6px;
    height: 4px;
    padding: 0;
    border-radius: 2px;
    background: var(--line);
  }
  .piece::before {
    content: '';
    position: absolute;
    inset: -9px 0; /* a finger-sized target around a thin line */
  }
  .piece i {
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: var(--accent);
    transform-origin: left;
    transition: transform 0.12s linear;
  }
  .piece.now {
    box-shadow: 0 0 0 1px var(--accent);
  }
  .list {
    position: absolute;
    top: 100%;
    left: var(--gutter);
    right: var(--gutter);
    max-height: min(60vh, 460px);
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-top: 1px;
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-pop);
  }
  .item {
    display: grid;
    grid-template-columns: minmax(44px, auto) 1fr;
    gap: 3px 10px;
    width: 100%;
    padding: 9px 8px;
    border-radius: 10px;
    color: var(--ink-3);
  }
  .item:hover {
    background: var(--hover);
  }
  .item .r {
    font-size: 11px;
    color: var(--muted-4);
    padding-top: 3px;
  }
  .item .n {
    font-family: var(--f-ta-head);
    font-size: 14.5px;
    overflow-wrap: anywhere;
  }
  .item .p {
    grid-column: 2;
    height: 3px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .item .p b {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .item.now .n {
    color: var(--accent);
    font-weight: 500;
  }

  /* ---------- tabs ---------- */
  .kind-tabs .inner {
    padding: 0;
  }
  .track {
    display: flex;
    gap: 20px;
    padding: 0 var(--gutter);
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--gutter), #000 calc(100% - var(--gutter)), transparent);
    mask-image: linear-gradient(to right, transparent, #000 var(--gutter), #000 calc(100% - var(--gutter)), transparent);
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .tab {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-width: min(240px, 70vw);
    padding: 11px 0 0;
    color: var(--muted-4);
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .tab .num {
    font-size: 10.5px;
    color: var(--muted-6);
  }
  .tab .t {
    font-size: 14px;
    transition: color 0.2s ease;
  }
  .bar {
    height: 2px;
    border-radius: 1px;
    background: var(--line);
    overflow: hidden;
  }
  .bar b {
    display: block;
    height: 100%;
    background: var(--accent);
    opacity: 0.45;
    transition: width 0.12s linear;
  }
  .tab.now {
    color: var(--ink);
  }
  .tab.now .num {
    color: var(--accent);
  }
  .tab.now .bar b {
    opacity: 1;
  }

  /* ---------- now reading ---------- */
  .nowline {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 7px 0 8px;
    color: var(--ink);
  }
  .ring {
    position: relative;
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
  }
  .ring svg {
    width: 36px;
    height: 36px;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3;
  }
  .ring .bg {
    stroke: var(--line);
  }
  .ring .fg {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.12s linear;
  }
  .ring .mono {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--accent);
  }
  .txt {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .txt .t {
    font-size: 14.5px;
  }
  .sub {
    font-size: 11.5px;
    color: var(--muted-4);
  }
  .bookline {
    height: 2px;
    background: var(--line);
  }
  .bookline b {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.12s linear;
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 4px 10px;
  }
  .timeline button {
    position: relative;
    display: grid;
    grid-template-columns: 22px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 8px 6px;
    border-radius: 10px;
    color: var(--ink-3);
  }
  .timeline button:hover {
    background: var(--hover);
  }
  .dot {
    position: relative;
    z-index: 1;
    width: 12px;
    height: 12px;
    margin-left: 5px;
    border-radius: 50%;
    border: 2px solid var(--line);
    background: var(--card);
  }
  .timeline li:not(:last-child) button::after {
    content: '';
    position: absolute;
    left: 16px;
    top: 30px;
    bottom: -14px;
    width: 2px;
    background: var(--line);
  }
  .timeline li.done .dot {
    background: var(--accent);
    border-color: var(--accent);
  }
  .timeline li.done:not(:last-child) button::after {
    background: var(--accent);
  }
  .timeline li.now .dot {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }
  .timeline .n {
    font-family: var(--f-ta-head);
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .timeline li.now .n {
    color: var(--accent);
    font-weight: 500;
  }
  .timeline .r {
    font-size: 11px;
    color: var(--muted-4);
  }
</style>
