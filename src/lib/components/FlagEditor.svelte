<script lang="ts">
  import type { Labels } from '../i18n/labels';

  interface Props {
    L: Labels;
    verseLabel: string;
    note: string;
    reason: string;
    onsave: (note: string, reason: string) => void;
    oncancel: () => void;
  }
  let { L, verseLabel, note, reason, onsave, oncancel }: Props = $props();
  // svelte-ignore state_referenced_locally
  let text = $state(note);
  // svelte-ignore state_referenced_locally
  let why = $state(reason || 'meaning');
</script>

<div class="flag-editor" data-print="hide">
  <div class="title">{L.flagVerse} {verseLabel}</div>
  <!-- svelte-ignore a11y_autofocus -->
  <textarea bind:value={text} placeholder={L.flagPlaceholder} autofocus></textarea>
  <div class="reasons">
    {#each Object.keys(L.reasons) as k (k)}
      <button class="chip" aria-pressed={why === k} onclick={() => (why = k)}>{L.reasons[k]}</button>
    {/each}
  </div>
  <div class="actions">
    <button class="btn primary" onclick={() => onsave(text, why)}>{L.save}</button>
    <button class="btn" onclick={oncancel}>{L.cancel}</button>
  </div>
</div>

<style>
  .flag-editor {
    margin-top: 12px;
    padding: 13px;
    border: 1px solid var(--accent-line);
    background: var(--accent-wash);
    border-radius: 10px;
  }
  .title {
    font-size: 10.5px;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--accent-mid);
    margin-bottom: 8px;
  }
  textarea {
    width: 100%;
    min-height: 60px;
    resize: vertical;
    padding: 9px 11px;
    border: 1px solid var(--accent-line);
    border-radius: 8px;
    background: var(--card);
    font-size: 13.5px;
    line-height: 1.5;
    outline: none;
  }
  .reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 9px 0 11px;
  }
  .reasons .chip {
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>
