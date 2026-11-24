<script lang="ts">
  import { router } from './lib/stores/router.svelte';
  import { prefs, savePrefs } from './lib/stores/prefs.svelte';
  import { LABELS } from './lib/i18n/labels';
  import Library from './routes/Library.svelte';
  import Reader from './routes/Reader.svelte';
  import Import from './routes/Import.svelte';
  import Settings from './routes/Settings.svelte';
  import UpdatePrompt from './lib/components/UpdatePrompt.svelte';

  const L = $derived(LABELS[prefs.ui]);

  // persist preferences whenever any of them changes
  $effect(() => {
    JSON.stringify(prefs);
    savePrefs();
  });

  $effect(() => {
    document.documentElement.lang = prefs.ui;
    document.documentElement.style.setProperty('--ta-size', `${prefs.taSize}px`);
    document.documentElement.style.setProperty('--src-size', `${prefs.srcSize}px`);
  });

  $effect(() => {
    const r = router.route;
    window.scrollTo({ top: 0 });
    if (r.name === 'library') document.title = L.appName;
    else if (r.name === 'import') document.title = `${L.import} · ${L.appName}`;
    else if (r.name === 'settings') document.title = `${L.settings} · ${L.appName}`;
  });
</script>

{#if router.route.name === 'library'}
  <Library />
{:else if router.route.name === 'read' || router.route.name === 'study'}
  {#key `${router.route.translation}/${router.route.book}/${router.route.src ?? ''}`}
    <Reader route={router.route} />
  {/key}
{:else if router.route.name === 'import'}
  <Import />
{:else if router.route.name === 'settings'}
  <Settings />
{:else}
  <main class="nf">
    <p>{L.notFound}</p>
    <a href="#/">{L.backToLibrary}</a>
  </main>
{/if}

<UpdatePrompt />

<style>
  .nf {
    max-width: 560px;
    margin: 80px auto;
    padding: 0 16px;
    text-align: center;
    color: var(--muted-2);
  }
</style>
