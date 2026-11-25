<script lang="ts">
  /**
   * The app's only menu: navigation, the current book's actions (passed in by the reader) and
   * the three settings groups, which open in place with a back arrow.
   */
  import type { Snippet } from 'svelte';
  import { LABELS } from '../i18n/labels';
  import { prefs } from '../stores/prefs.svelte';
  import type { ReaderCtx } from '../stores/ui.svelte';
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';
  import SettingsPanel from './SettingsPanel.svelte';

  type Page = 'root' | 'app' | 'reading' | 'study';
  interface Props {
    open: boolean;
    /** route-specific items shown under "Library" (view switch, passages, study tools…) */
    nav?: Snippet;
    reader?: ReaderCtx;
  }
  let { open = $bindable(), nav, reader }: Props = $props();

  const L = $derived(LABELS[prefs.ui]);
  let page = $state<Page>('root');
  $effect(() => {
    if (!open) page = 'root';
  });
  const titles = $derived({ root: L.menu, app: L.setApp, reading: L.setReading, study: L.setStudy });
  const close = () => (open = false);
</script>

<Sheet bind:open title={titles[page]} closeLabel={L.close} backLabel={L.back} onback={page === 'root' ? undefined : () => (page = 'root')}>
  {#if page === 'root'}
    <nav class="menu">
      <a class="mi" href="#/" onclick={close}><Icon name="book" /><span>{L.library}</span></a>
      {@render nav?.()}
    </nav>
    <div class="menu">
      <div class="mhead">{L.settings}</div>
      <button class="mi" onclick={() => (page = 'app')}><Icon name="sliders" /><span>{L.setApp}</span><Icon name="chevron" size={16} /></button>
      <button class="mi" onclick={() => (page = 'reading')}><Icon name="type" /><span>{L.setReading}</span><Icon name="chevron" size={16} /></button>
      <button class="mi" onclick={() => (page = 'study')}><Icon name="study" /><span>{L.setStudy}</span><Icon name="chevron" size={16} /></button>
    </div>
    <div class="menu">
      <a class="mi" href="#/import" onclick={close}><Icon name="upload" /><span>{L.import}</span></a>
      <a class="mi" href="#/settings" onclick={close}><Icon name="info" /><span>{L.about}</span></a>
    </div>
  {:else}
    <SettingsPanel section={page} {reader} />
  {/if}
</Sheet>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
  }
  .menu + .menu {
    border-top: 1px solid var(--line-soft);
  }
  .mhead {
    padding: 8px 12px 4px;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted-5);
  }
  /* menu items; route items passed in through `nav` use the same classes */
  .menu :global(.mi) {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 46px;
    padding: 8px 12px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--ink-2);
    font-size: 15px;
    text-align: start;
  }
  .menu :global(a.mi) {
    border-bottom: none;
  }
  .menu :global(.mi > span) {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .menu :global(.mi:hover) {
    background: var(--hover);
    color: var(--ink);
  }
  .menu :global(.mi[aria-pressed='true']) {
    background: var(--accent-soft);
    color: var(--accent-dark);
  }
  .menu :global(.mi .icon) {
    color: var(--muted-3);
  }
  .menu :global(.mseg) {
    margin: 4px 4px 8px;
    width: calc(100% - 8px);
  }
  .menu :global(.mseg button) {
    flex: 1 1 0;
    min-height: 38px;
    font-size: 13.5px;
  }
</style>
