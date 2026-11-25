<script lang="ts">
  /**
   * The one overlay of the app: a modal <dialog> drawn in the browser's top layer, so no
   * ancestor (sticky header, backdrop blur, transforms) can trap or cover it. A side drawer on
   * wider screens, a bottom sheet on phones. Closes with its close button, Escape, a tap on the
   * backdrop, and whenever the route changes.
   */
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { router } from '../stores/router.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    open: boolean;
    title: string;
    closeLabel: string;
    side?: 'left' | 'right';
    /** shows a back arrow before the title (drill-in pages) */
    onback?: () => void;
    backLabel?: string;
    children: Snippet;
  }
  let { open = $bindable(), title, closeLabel, side = 'left', onback, backLabel = '', children }: Props = $props();

  let dlg: HTMLDialogElement;

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  });

  // any navigation closes the sheet
  $effect(() => {
    void router.route;
    untrack(() => (open = false));
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dlg}
  class="sheet {side}"
  aria-label={title}
  oncancel={(e) => {
    e.preventDefault();
    open = false;
  }}
  onclose={() => (open = false)}
  onclick={(e) => {
    if (e.target === dlg) open = false; // the backdrop
  }}
>
  {#if open}
    <div class="body">
      <div class="head">
        {#if onback}
          <button class="icon-btn" onclick={onback} aria-label={backLabel} title={backLabel}><Icon name="back" /></button>
        {/if}
        <h2>{title}</h2>
        <button class="icon-btn close" onclick={() => (open = false)} aria-label={closeLabel} title={closeLabel}><Icon name="close" /></button>
      </div>
      <div class="scroll">
        {@render children()}
      </div>
    </div>
  {/if}
</dialog>

<style>
  .sheet {
    position: fixed;
    inset: 0 auto 0 0;
    margin: 0;
    padding: 0;
    width: min(400px, 92vw);
    max-width: none;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: none;
    background: var(--card);
    color: var(--ink);
    box-shadow: var(--shadow-pop);
  }
  .sheet.left {
    border-right: 1px solid var(--card-line);
  }
  .sheet.right {
    inset: 0 0 0 auto;
    border-left: 1px solid var(--card-line);
  }
  .sheet[open] {
    animation: from-left 0.22s ease-out;
  }
  .sheet.right[open] {
    animation-name: from-right;
  }
  .sheet::backdrop {
    background: var(--scrim);
    animation: fade 0.22s ease-out;
  }
  .body {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--bar-h);
    padding: 6px 8px 6px 12px;
    padding-top: max(6px, env(safe-area-inset-top));
    border-bottom: 1px solid var(--line-soft);
  }
  h2 {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .scroll {
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 0 max(16px, env(safe-area-inset-bottom));
  }

  /* phones: a bottom sheet within thumb reach */
  @media (max-width: 599px) {
    .sheet,
    .sheet.right {
      inset: auto 0 0 0;
      width: 100%;
      height: auto;
      max-height: 88dvh;
      border: none;
      border-radius: var(--r-lg) var(--r-lg) 0 0;
    }
    .sheet[open],
    .sheet.right[open] {
      animation-name: from-bottom;
    }
    .body {
      max-height: 88dvh;
    }
    .head {
      padding-top: 6px;
    }
    .head::before {
      content: '';
      position: absolute;
      top: 6px;
      left: 50%;
      width: 36px;
      height: 4px;
      margin-left: -18px;
      border-radius: 2px;
      background: var(--line);
    }
  }

  @keyframes from-left {
    from {
      transform: translateX(-100%);
    }
  }
  @keyframes from-right {
    from {
      transform: translateX(100%);
    }
  }
  @keyframes from-bottom {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
