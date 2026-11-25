<script lang="ts">
  import { onMount } from 'svelte';
  import type { Catalog } from '../lib/pipeline/types';
  import { loadCatalog } from '../lib/data/loader';
  import { LABELS } from '../lib/i18n/labels';
  import { prefs } from '../lib/stores/prefs.svelte';
  import AppBar from '../lib/components/AppBar.svelte';
  import AppMenu from '../lib/components/AppMenu.svelte';
  import SettingsPanel from '../lib/components/SettingsPanel.svelte';

  const L = $derived(LABELS[prefs.ui]);
  const ta = $derived(prefs.ui === 'ta');
  let catalog = $state.raw<Catalog | null>(null);
  let menuOpen = $state(false);

  onMount(() => {
    loadCatalog().then((c) => (catalog = c)).catch(() => {});
  });
</script>

<div class="page">
  <AppBar menuLabel={L.menu} onmenu={() => (menuOpen = true)} width="760px">
    <h1>{L.settings}</h1>
  </AppBar>

  <main class="main">
    <SettingsPanel section="all" />

    <section class="card about">
      <h2>{ta ? 'பற்றி' : 'About'}</h2>
      <p class="muted">{L.heroBody}</p>
      {#each catalog?.translations ?? [] as t (t.id)}<p class="muted">{t.name} — {t.attribution}, {t.licence}.</p>{/each}
      {#each catalog?.sources ?? [] as s (s.id)}<p class="muted">{s.name} — {s.attribution}, {s.licence}.</p>{/each}
      <p class="muted">Semantic alignment data: AI-proposed, pending reviewer confirmation. App © Bridge Connectivity Solutions, GPL-3.0.</p>
      <p class="tiny mono">{ta ? 'பதிப்பு' : 'Version'} {__APP_VERSION__} · {catalog ? `data ${catalog.builtAt.slice(0, 16).replace('T', ' ')}` : ''}</p>
      <p><a href="https://github.com/selvabenz/interlinear-bible" target="_blank" rel="noopener">GitHub ↗</a></p>
    </section>
  </main>
</div>

<AppMenu bind:open={menuOpen} />

<style>
  h1 {
    margin: 0 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }
  .main {
    max-width: 760px;
    margin: 0 auto;
    padding: 18px var(--gutter) 80px;
  }
  .about {
    padding: 18px 20px;
  }
  h2 {
    font-size: 12px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 14px;
  }
  .muted {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted-2);
    margin: 0 0 10px;
  }
  .tiny {
    font-size: 11px;
    color: var(--muted-5);
  }
</style>
