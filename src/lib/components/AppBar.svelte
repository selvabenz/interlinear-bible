<script lang="ts">
  /**
   * The slim bar at the top of every page: the menu button, a title and (usually) search.
   * On phones and small tablets it slides away while reading down and comes back on the
   * first scroll up; sticky headings follow it through --bar-offset.
   */
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    menuLabel: string;
    onmenu: () => void;
    /** widest the bar's content gets, to line up with the page below */
    width?: string;
    children?: Snippet;
    actions?: Snippet;
  }
  let { menuLabel, onmenu, width = '1400px', children, actions }: Props = $props();

  let hidden = $state(false);
  let bar: HTMLElement;

  onMount(() => {
    const small = matchMedia('(max-width: 899px)');
    let lastY = scrollY;
    const onScroll = () => {
      const y = scrollY;
      const busy = bar?.contains(document.activeElement) || !!document.querySelector('dialog[open]');
      if (!small.matches || busy || y < 80) hidden = false;
      else if (y > lastY + 8) hidden = true;
      else if (y < lastY - 8) hidden = false;
      if (Math.abs(y - lastY) > 8) lastY = y;
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      document.documentElement.style.removeProperty('--bar-offset');
    };
  });

  $effect(() => {
    document.documentElement.style.setProperty('--bar-offset', hidden ? '0px' : 'var(--bar-h)');
  });
</script>

<header class="appbar" class:hidden bind:this={bar} data-print="hide" onfocusin={() => (hidden = false)}>
  <div class="inner" style:max-width={width}>
    <button class="icon-btn" onclick={onmenu} aria-label={menuLabel} title={menuLabel}><Icon name="menu" /></button>
    <div class="center">{@render children?.()}</div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  .appbar {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--bar);
    backdrop-filter: saturate(1.4) blur(12px);
    -webkit-backdrop-filter: saturate(1.4) blur(12px);
    border-bottom: 1px solid var(--line);
    padding-top: env(safe-area-inset-top);
    transition: transform 0.22s ease;
  }
  .appbar.hidden {
    transform: translateY(calc(-100% - 1px));
  }
  .inner {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--bar-h);
    margin: 0 auto;
    padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
  }
  .center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .actions {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
</style>
