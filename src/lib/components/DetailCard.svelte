<script lang="ts">
  import type { Detail } from '../data/model';
  import type { Labels } from '../i18n/labels';
  import { STATUS } from '../i18n/labels';

  interface Props {
    d: Detail;
    L: Labels;
    variant: 'read' | 'inline' | 'panel';
    occ: { key: string; ref: string; ta: string }[];
    occTitle: string;
    englishVerse?: string;
    srcRtl: boolean;
    onclose: () => void;
    onpick: (key: string) => void;
  }
  let { d, L, variant, occ, occTitle, englishVerse, srcRtl, onclose, onpick }: Props = $props();
  const tone = $derived(STATUS[d.status]?.tone ?? '');
</script>

{#snippet head()}
  <div class="head">
    <div class="words">
      <span class="ta">{d.ta}</span>
      <span class="gr" dir={srcRtl ? 'rtl' : undefined}>{d.gr}</span>
      {#if d.tr}<span class="tr">{d.tr}</span>{/if}
    </div>
    <div class="spacer"></div>
    <div class="codes">
      <span class="mono st">{d.st}</span>
      {#if variant !== 'inline'}<span class="mono mo">{d.mo}</span>{/if}
      <button class="close" onclick={onclose}>{L.close}</button>
    </div>
  </div>
{/snippet}

{#snippet lexicon()}
  <div class="eyebrow">{L.lexicon}</div>
  <div class="lemma gr" dir={srcRtl ? 'rtl' : undefined}>{d.lemma}</div>
  <div class="lg">{d.lemmaGloss}</div>
  {#if d.morphLong}<div class="ml">{d.morphLong}</div>{/if}
{/snippet}

{#snippet english()}
  <div class="eyebrow">{L.englishGloss}</div>
  <div class="eng">{d.english}</div>
  {#if englishVerse}<div class="ev">{englishVerse}</div>{/if}
{/snippet}

{#snippet unit()}
  <div class="eyebrow">{L.unit}</div>
  <div class="ul">
    <span class="ulabel">{d.unitLabel}</span>
    {#if d.unit}<span class="mono uid">{d.unit.id}</span>{/if}
  </div>
  {#if d.statusText}<span class="pill {tone}">{d.statusText}</span>{/if}
  {#if d.note}<div class="note">{d.note}</div>{/if}
{/snippet}

{#snippet occurrences()}
  {#if occ.length}
    <div class="occ">
      <div class="eyebrow">{occTitle}</div>
      <div class="occ-list">
        {#each occ as o (o.key)}
          <button onclick={() => onpick(o.key)}><span class="mono">{o.ref}</span><span class="ta">{o.ta}</span></button>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#if variant === 'read'}
  <div class="card-read">
    {@render head()}
    <div class="grid">
      <div class="cell">{@render lexicon()}</div>
      <div class="cell">{@render english()}</div>
      <div class="cell">{@render unit()}</div>
    </div>
    {@render occurrences()}
  </div>
{:else if variant === 'inline'}
  <div class="card-inline">
    {@render head()}
    <div class="stackcells">
      <div>{@render lexicon()}</div>
      <div>{@render english()}</div>
      <div>{@render unit()}</div>
    </div>
    {@render occurrences()}
  </div>
{:else}
  <div class="card-panel">
    {@render head()}
    <div class="sec">{@render lexicon()}</div>
    <div class="sec">{@render english()}</div>
    <div class="sec last">{@render unit()}</div>
    {@render occurrences()}
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    flex-wrap: wrap;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .words .ta {
    font-family: var(--f-ta);
    font-size: 23px;
    line-height: 1.3;
  }
  .words .gr {
    font-family: var(--f-gr);
    font-size: 18px;
    color: var(--greek-strong);
  }
  .words .gr[dir='rtl'],
  .lemma[dir='rtl'] {
    font-family: var(--f-he);
  }
  .words .tr {
    font-family: var(--f-gr);
    font-style: italic;
    font-size: 13px;
    color: #8b9298;
  }
  .spacer {
    flex: 1 1 10px;
  }
  .codes {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: flex-end;
  }
  .st {
    font-size: 12px;
    color: var(--accent);
    letter-spacing: 0.04em;
  }
  .mo {
    font-size: 10.5px;
    color: var(--muted-5);
  }
  .close {
    border: none;
    background: transparent;
    color: var(--muted-5);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0;
  }
  .eyebrow {
    margin-bottom: 7px;
    color: var(--muted-5);
  }
  .lemma {
    font-family: var(--f-gr);
    font-size: 16px;
    margin-bottom: 3px;
  }
  .lg {
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-4);
  }
  .ml {
    font-size: 12px;
    line-height: 1.55;
    color: #8b9298;
    margin-top: 7px;
  }
  .eng {
    font-size: 14.5px;
    line-height: 1.5;
    color: var(--ink-2);
  }
  .ev {
    font-family: var(--f-gr);
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--muted-3);
    margin-top: 7px;
  }
  .ul {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .ulabel {
    font-size: 14px;
    color: var(--ink-2);
  }
  .uid {
    font-size: 10px;
    color: var(--muted-5);
  }
  .note {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--muted-2);
    margin-top: 8px;
  }
  .occ-list {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .occ-list button {
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 5px 10px;
    border: 1px solid #dfe8e5;
    border-radius: 999px;
    background: var(--card);
  }
  .occ-list .mono {
    font-size: 10px;
    color: var(--accent);
  }
  .occ-list .ta {
    font-family: var(--f-ta);
    font-size: 13.5px;
  }

  /* Reading view: card under the verse */
  .card-read {
    margin-top: 16px;
    border: 1px solid var(--accent-line);
    background: var(--accent-wash);
    border-radius: 11px;
    overflow: hidden;
  }
  .card-read .head {
    padding: 16px 18px 14px;
    border-bottom: 1px solid #e2eeeb;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
    gap: 1px;
    background: #e2eeeb;
  }
  .cell {
    background: #f9fdfc;
    padding: 14px 18px;
  }
  .card-read .occ {
    padding: 14px 18px;
    border-top: 1px solid #e2eeeb;
  }

  /* Study view, narrow screens: inline under the verse */
  .card-inline {
    margin-top: 12px;
    border: 1px solid var(--accent-line);
    background: var(--accent-wash);
    border-radius: 10px;
    padding: 14px 15px;
  }
  .card-inline .words .ta {
    font-size: 19px;
  }
  .card-inline .words .gr {
    font-size: 16px;
  }
  .stackcells {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e2eeeb;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card-inline .occ {
    margin-top: 12px;
  }

  /* Study view: side panel */
  .card-panel {
    background: var(--card);
  }
  .card-panel .head {
    padding: 15px 17px 13px;
    border-bottom: 1px solid var(--card-line);
  }
  .card-panel .words .ta {
    font-size: 20px;
    line-height: 1.4;
  }
  .card-panel .words .gr {
    font-size: 17px;
  }
  .sec {
    padding: 13px 17px;
    border-bottom: 1px solid #f2ecdf;
  }
  .sec.last {
    border-bottom: none;
  }
  .card-panel .occ {
    padding: 13px 17px;
    border-top: 1px solid #f2ecdf;
  }
</style>
