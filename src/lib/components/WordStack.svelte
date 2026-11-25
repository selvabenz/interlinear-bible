<script lang="ts">
  import type { Item, Order } from '../data/model';
  import type { Layers } from '../stores/prefs.svelte';

  interface Props {
    item: Item;
    mode: 'read' | 'study';
    order: Order;
    layers: Layers;
    selected: boolean;
    related: boolean;
    srcRtl: boolean;
    crossTitle: string;
    onselect: (key: string) => void;
    onhover: (item: Item) => void;
    oncross: (ref: string) => void;
  }
  let { item, mode, order, layers, selected, related, srcRtl, crossTitle, onselect, onhover, oncross }: Props = $props();

  // In translation order the main word is the translation and `second` the source;
  // in source order it is the other way round.
  const taText = $derived(order === 'target' ? item.main : item.second);
  const srcText = $derived(order === 'target' ? item.second : item.main);
  const srcMuted = $derived(order === 'target' && item.secondMuted);
  const taMuted = $derived(order === 'source' && item.secondMuted);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="stack {mode}"
  class:selected
  class:related
  class:finding={item.finding && layers.notes}
  class:src-first={order === 'source'}
  role="button"
  tabindex="-1"
  data-key={item.key}
  aria-pressed={selected}
  onclick={() => onselect(item.key)}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onselect(item.key))}
  onmouseenter={() => onhover(item)}
>
  {#if mode === 'study' && layers.strong}<span class="row st" dir={srcRtl ? 'ltr' : undefined}>{item.st}</span>{/if}
  {#if order === 'target'}
    <span class="row ta-w">{taText}</span>
    <span class="row src-w" class:muted={srcMuted} dir={srcRtl ? 'rtl' : undefined}>{srcText}</span>
  {:else}
    <span class="row src-w main" dir={srcRtl ? 'rtl' : undefined}>{srcText}</span>
    <span class="row ta-w second" class:muted={taMuted}>{taText}</span>
  {/if}
  {#if layers.translit}<span class="row tr" dir={srcRtl ? 'ltr' : undefined}>{item.tr}</span>{/if}
  {#if layers.gloss}<span class="row gl" dir={srcRtl ? 'ltr' : undefined}>{item.gl}</span>{/if}
  {#if mode === 'read' && layers.strong}<span class="row st" dir={srcRtl ? 'ltr' : undefined}>{item.st}</span>{/if}
  {#if layers.morph}<span class="row mo" dir={srcRtl ? 'ltr' : undefined}>{item.mo}</span>{/if}
  {#if item.crossTo && item.crossRef}
    <button
      class="cross"
      title={crossTitle}
      onclick={(e) => {
        e.stopPropagation();
        oncross(item.crossRef!);
      }}>↗ {item.crossTo}</button
    >
  {/if}
</span>

<style>
  /*
   * One interlinear unit: a column of rows. Rows keep one line height each so units on a line
   * stay aligned; a row only wraps when the unit alone is wider than the whole line (a long
   * joined gloss, several aligned words), so nothing ever spills out of the text column.
   */
  .stack {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    max-width: 100%;
    text-align: start;
    margin: 0 3px 6px 0;
    padding: 3px 6px 4px;
    border-radius: 8px;
    cursor: pointer;
    background: transparent;
    transition: background 0.16s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .stack:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
  @media (hover: hover) {
    .stack:hover {
      background: var(--hover);
    }
  }
  .stack.related {
    background: var(--related);
  }
  .stack.selected {
    background: var(--select);
  }
  .row {
    display: block;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .row:empty::before {
    content: '\00a0';
  }

  /* translation word */
  .ta-w {
    font-family: var(--f-ta);
    font-size: var(--ta-size);
    min-height: calc(var(--ta-size) * 1.65);
    line-height: calc(var(--ta-size) * 1.65);
    color: var(--ink);
  }
  .study .ta-w {
    font-weight: 500;
    font-size: calc(var(--ta-size) + 1px);
  }
  .finding .ta-w {
    text-decoration: underline dotted var(--mark);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 4px;
  }
  .selected .ta-w,
  .selected .src-w {
    color: var(--gold);
  }

  /* source word */
  .src-w {
    font-family: var(--f-gr);
    font-size: var(--src-size);
    min-height: calc(var(--src-size) * 1.45);
    line-height: calc(var(--src-size) * 1.45);
    color: var(--greek);
  }
  .study .src-w {
    color: var(--accent-ink);
  }
  .src-w[dir='rtl'] {
    font-family: var(--f-he);
    font-size: calc(var(--src-size) + 3px);
    line-height: calc((var(--src-size) + 3px) * 1.5);
    min-height: calc((var(--src-size) + 3px) * 1.5);
    align-self: stretch;
    text-align: right;
  }
  .src-first .src-w.main {
    font-size: calc(var(--src-size) + 2px);
    min-height: calc((var(--src-size) + 2px) * 1.5);
    line-height: calc((var(--src-size) + 2px) * 1.5);
    color: var(--ink);
  }
  .src-first .src-w.main[dir='rtl'] {
    font-size: calc(var(--src-size) + 5px);
    min-height: calc((var(--src-size) + 5px) * 1.5);
    line-height: calc((var(--src-size) + 5px) * 1.5);
  }
  .src-first .ta-w.second {
    font-weight: 400;
    color: var(--ink-3);
    font-size: calc(var(--ta-size) - 1px);
  }
  .muted {
    color: var(--muted-6) !important;
    font-weight: 400 !important;
  }

  .tr {
    font-family: var(--f-gr);
    font-style: italic;
    font-size: 12px;
    min-height: 16px;
    line-height: 16px;
    color: var(--muted);
  }
  .gl {
    font-size: 12px;
    min-height: 16px;
    line-height: 16px;
    color: var(--gloss);
  }
  .study .gl {
    color: var(--ink-2);
    font-size: 12.5px;
    min-height: 17px;
    line-height: 17px;
  }
  .st {
    font-family: var(--f-mono);
    font-size: 10px;
    min-height: 14px;
    line-height: 14px;
    color: var(--accent-ink);
  }
  .mo {
    font-family: var(--f-mono);
    font-size: 10px;
    min-height: 14px;
    line-height: 14px;
    color: var(--muted-2);
  }
  .cross {
    margin-top: 2px;
    padding: 1px 6px;
    border: none;
    border-radius: 999px;
    background: var(--mark-soft);
    color: var(--mark);
    font-size: 10px;
    font-family: var(--f-mono);
  }
  .read .cross {
    background: var(--gold-soft);
    color: var(--gold);
  }
</style>
