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
  {#if mode === 'study' && layers.strong}<span class="row st">{item.st}</span>{/if}
  {#if order === 'target'}
    <span class="row ta-w">{taText}</span>
    <span class="row src-w" class:muted={srcMuted} dir={srcRtl ? 'rtl' : undefined}>{srcText}</span>
  {:else}
    <span class="row src-w main" dir={srcRtl ? 'rtl' : undefined}>{srcText}</span>
    <span class="row ta-w second" class:muted={taMuted}>{taText}</span>
  {/if}
  {#if layers.translit}<span class="row tr">{item.tr}</span>{/if}
  {#if layers.gloss}<span class="row gl">{item.gl}</span>{/if}
  {#if mode === 'read' && layers.strong}<span class="row st">{item.st}</span>{/if}
  {#if layers.morph}<span class="row mo">{item.mo}</span>{/if}
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
  .stack {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: start;
    margin: 0 4px 4px 0;
    padding: 3px 6px 4px;
    border-radius: 7px;
    cursor: pointer;
    background: transparent;
    transition: background 0.16s ease;
    outline: none;
  }
  .stack:hover {
    background: #f3f0e8;
  }
  .stack.related {
    background: var(--related);
  }
  .stack.selected {
    background: var(--select);
  }
  .row {
    white-space: nowrap;
    display: block;
  }
  .row:empty::before {
    content: '\00a0';
  }

  /* translation word */
  .ta-w {
    font-family: var(--f-ta);
    font-size: var(--ta-size);
    height: calc(var(--ta-size) * 1.6);
    line-height: calc(var(--ta-size) * 1.6);
    color: var(--ink);
  }
  .study .ta-w {
    color: #000;
    font-weight: 900;
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
    height: calc(var(--src-size) * 1.42);
    line-height: calc(var(--src-size) * 1.42);
    color: var(--greek);
  }
  .study .src-w {
    color: #336f6b;
  }
  .src-w[dir='rtl'] {
    font-family: var(--f-he);
    font-size: calc(var(--src-size) + 3px);
    align-self: stretch;
    text-align: right;
  }
  .src-first .src-w.main {
    font-size: calc(var(--src-size) + 2px);
    height: calc((var(--src-size) + 2px) * 1.5);
    line-height: calc((var(--src-size) + 2px) * 1.5);
    color: var(--ink);
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
    font-size: 11.5px;
    height: 15px;
    line-height: 15px;
    color: var(--muted);
  }
  .gl {
    font-size: 11.5px;
    height: 15px;
    line-height: 15px;
    color: #4f5c63;
  }
  .study .gl {
    color: #1a282f;
    font-size: 12.5px;
    height: 17px;
    line-height: 17px;
  }
  .st {
    font-family: var(--f-mono);
    font-size: 9.5px;
    height: 13px;
    line-height: 13px;
    color: var(--accent-ink);
  }
  .mo {
    font-family: var(--f-mono);
    font-size: 10px;
    height: 12px;
    line-height: 12px;
    color: var(--muted-2);
  }
  .cross {
    margin-top: 2px;
    padding: 1px 5px;
    border: none;
    border-radius: 999px;
    background: #eef2f0;
    color: var(--mark);
    font-size: 9.5px;
    font-family: var(--f-mono);
  }
  .read .cross {
    background: #eef2ea;
    color: var(--gold);
  }
</style>
