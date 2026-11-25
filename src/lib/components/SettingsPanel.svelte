<script lang="ts">
  /**
   * Every preference, in three groups: App, Reading and Study. Shown inside the menu (one group
   * at a time, so the text stays in view and changes show at once) and on the Settings page
   * (all groups). Opened from a book, the reader passes its editions and language names.
   */
  import { onMount } from 'svelte';
  import type { Catalog } from '../pipeline/types';
  import type { Order } from '../data/model';
  import { loadCatalog } from '../data/loader';
  import { sourcesFor } from '../pipeline/sources';
  import { LABELS } from '../i18n/labels';
  import { prefs, resetPrefs, THEMES } from '../stores/prefs.svelte';
  import { flags, exportFlags, importFlags, clearAllFlags } from '../stores/flags.svelte';
  import type { ReaderCtx } from '../stores/ui.svelte';
  import { testEsvKey } from '../esv';
  import { checkToken, DEFAULT_REPO } from '../data/github';
  import { download } from '../data/importer';

  interface Props {
    section: 'app' | 'reading' | 'study' | 'all';
    reader?: ReaderCtx;
  }
  let { section, reader }: Props = $props();
  const show = (s: 'app' | 'reading' | 'study') => section === 'all' || section === s;

  const L = $derived(LABELS[prefs.ui]);
  const ta = $derived(prefs.ui === 'ta');
  const T = $derived({
    taSize: ta ? 'மொழிபெயர்ப்புச் சொல் அளவு' : 'Translation word size',
    srcSize: ta ? 'மூலச் சொல் அளவு' : 'Source word size',
    order: ta ? 'சொல் வரிசை' : 'Word order',
    orderT: ta ? 'மொழிபெயர்ப்பின் வரிசை' : 'Translation order',
    orderS: ta ? 'மூலமொழியின் வரிசை' : 'Original order',
    layers: ta ? 'காட்டும் அடுக்குகள்' : 'Layers shown',
    english: ta ? 'ஆங்கில வசனம் (ESV)' : 'English verse (ESV)',
    englishBody: ta
      ? 'ESV உரை Crossway-இன் பதிப்புரிமை; இது தளத்துடன் வெளியிடப்படவில்லை. api.esv.org-இல் இலவச API சாவியைப் பெற்று இங்கே ஒட்டவும். சாவி இந்த உலாவியில் மட்டுமே சேமிக்கப்படும்.'
      : 'The ESV text is © Crossway and is not published with this site. Get a free API key at api.esv.org and paste it here; the passage you read is then fetched from the ESV API. The key is stored only in this browser.',
    key: ta ? 'ESV API சாவி' : 'ESV API key',
    test: ta ? 'சோதி' : 'Test key',
    keyOk: ta ? 'சாவி வேலை செய்கிறது' : 'Key works',
    flagsTitle: ta ? 'வசனக் குறிப்புகள்' : 'Verse flags',
    flagsBody: (n: number) => (ta ? `இந்தச் சாதனத்தில் ${n} குறிப்புகள் உள்ளன.` : `${n} flag${n === 1 ? '' : 's'} on this device.`),
    export: ta ? 'ஏற்றுமதி (JSON)' : 'Export (JSON)',
    import: ta ? 'இறக்குமதி' : 'Import',
    clear: ta ? 'எல்லாவற்றையும் நீக்கு' : 'Delete all',
    confirmClear: ta ? 'எல்லாக் குறிப்புகளையும் நீக்கவா?' : 'Delete all verse flags on this device?',
    imported: (n: number) => (ta ? `${n} குறிப்புகள் இறக்கப்பட்டன` : `${n} flag(s) imported`),
    offlineTitle: ta ? 'இணையமின்றி' : 'Offline',
    storage: ta ? 'பயன்படுத்தப்பட்ட சேமிப்பு' : 'Storage used',
    clearCache: ta ? 'சேமித்த வேதாகமத் தரவை நீக்கு' : 'Clear saved Bible data',
    cacheCleared: ta ? 'நீக்கப்பட்டது' : 'Cleared',
    reset: ta ? 'அமைப்புகளை மீட்டமை' : 'Reset settings'
  });
  const P = $derived({
    title: ta ? 'வெளியிடுதல் (பராமரிப்பாளர்கள்)' : 'Publishing (maintainers)',
    body: ta
      ? 'இறக்கிய புத்தகத்தை எல்லாச் சாதனங்களுக்கும் வெளியிட, GitHub-இல் ஒரு pull request திறக்கப்படும்; அதை இணைத்ததும் தளம் புதுப்பிக்கப்படும். சாவி இந்த உலாவியில் மட்டுமே சேமிக்கப்படும்.'
      : 'To publish an imported book for every device, the importer opens a pull request on GitHub; merging it updates the site. The token is stored in this browser only.',
    repo: ta ? 'GitHub களஞ்சியம்' : 'GitHub repository',
    token: ta ? 'GitHub சாவி (fine-grained)' : 'GitHub token (fine-grained)',
    check: ta ? 'சரிபார்' : 'Check',
    ok: (login: string, repo: string) => (ta ? `சரி — ${login || 'சாவி'} ${repo}-இல் எழுதலாம்` : `OK — ${login || 'this token'} can write to ${repo}`),
    how: ta
      ? 'இந்தக் களஞ்சியத்திற்கு மட்டும் ஒரு fine-grained token உருவாக்கவும்: Contents — Read and write, Pull requests — Read and write.'
      : 'Create a fine-grained token for this repository only, with Contents: Read and write and Pull requests: Read and write.',
    create: ta ? 'சாவி உருவாக்கு' : 'Create a token'
  });

  let catalog = $state.raw<Catalog | null>(null);
  const translations = $derived(catalog?.translations ?? []);
  /** per testament: the translation's source texts, when there is a choice and books to read */
  const sourceChoices = $derived.by(() => {
    const tr = catalog?.translations.find((t) => t.id === prefs.translation) ?? catalog?.translations[0];
    if (!tr || !catalog) return [];
    return (['NT', 'OT'] as const)
      .map((t) => ({ t, ids: sourcesFor(tr, t).filter((id) => catalog!.books.some((b) => b.translation === tr.id && b.testament === t && b.source === id)) }))
      .filter((g) => g.ids.length > 1);
  });
  const readingLayers = $derived([
    ['translit', L.translit], ['gloss', L.gloss], ['strong', L.strong], ['morph', L.morph], ['esv', L.esv]
  ] as [keyof typeof prefs.layers, string][]);

  let keyMsg = $state('');
  let ghMsg = $state('');
  let flagMsg = $state('');
  let storage = $state('');
  let cacheMsg = $state('');
  let fileInput = $state<HTMLInputElement>();

  onMount(() => {
    loadCatalog().then((c) => (catalog = c)).catch(() => {});
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) storage = `${(e.usage / 1024 / 1024).toFixed(1)} MB${e.quota ? ` / ${(e.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}`;
    });
  });

  function setOrder(o: Order) {
    if (reader) reader.onorder(o);
    else prefs.order = o;
  }

  async function test() {
    keyMsg = '…';
    try {
      const v = await testEsvKey(prefs.esvKey.trim());
      keyMsg = `${T.keyOk}: “${v.slice(0, 80)}…”`;
    } catch (e) {
      keyMsg = (e as Error).message;
    }
  }

  async function checkGithub() {
    ghMsg = '…';
    try {
      const r = await checkToken(prefs.githubToken.trim(), prefs.githubRepo.trim() || DEFAULT_REPO);
      ghMsg = P.ok(r.login, prefs.githubRepo.trim() || DEFAULT_REPO);
    } catch (e) {
      ghMsg = (e as Error).message;
    }
  }

  async function clearCache() {
    if ('caches' in window) {
      for (const k of await caches.keys()) if (k.startsWith('ib-')) await caches.delete(k);
    }
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('ib-offline:')) localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
    cacheMsg = T.cacheCleared;
  }
</script>

{#snippet toggle(on: boolean, label: string, flip: () => void)}
  <button class="toggle" aria-pressed={on} onclick={flip}>
    <span class="tl">{label}</span>
    <span class="sw" aria-hidden="true"><span></span></span>
  </button>
{/snippet}

<div class="settings" class:all={section === 'all'}>
  {#if show('app')}
    <section class="group">
      {#if section === 'all'}<h2>{L.setApp}</h2>{/if}
      <div class="field">
        <span class="label">{L.theme}</span>
        <div class="seg wide themes" role="group" aria-label={L.theme}>
          {#each THEMES as t (t)}
            <button aria-pressed={prefs.theme === t} onclick={() => (prefs.theme = t)}>
              <span class="swatch {t}" aria-hidden="true"></span>{L.themes[t]}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span class="label">{L.language}</span>
        <div class="seg wide" role="group" aria-label="Interface language">
          <button aria-pressed={prefs.ui === 'en'} onclick={() => (prefs.ui = 'en')}>English</button>
          <button aria-pressed={prefs.ui === 'ta'} onclick={() => (prefs.ui = 'ta')}>தமிழ்</button>
        </div>
      </div>
      {#if translations.length > 1}
        <label class="field">
          <span class="label">{L.translation}</span>
          <select class="input" value={prefs.translation || translations[0].id} onchange={(e) => (prefs.translation = (e.target as HTMLSelectElement).value)}>
            {#each translations as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          </select>
        </label>
      {/if}
      <div class="field">
        <span class="label">{T.offlineTitle}</span>
        {#if storage}<p class="muted">{T.storage}: <span class="mono">{storage}</span></p>{/if}
        <div class="inline">
          <button class="btn" onclick={clearCache}>{T.clearCache}</button>
          <button class="btn" onclick={resetPrefs}>{T.reset}</button>
        </div>
        {#if cacheMsg}<p class="msg">{cacheMsg}</p>{/if}
      </div>
    </section>
  {/if}

  {#if show('reading')}
    <section class="group">
      {#if section === 'all'}<h2>{L.setReading}</h2>{/if}
      <div class="field">
        <span class="label">{T.order}</span>
        <div class="seg wide" role="group" aria-label={T.order} title={L.orderHint}>
          <button aria-pressed={prefs.order === 'target'} onclick={() => setOrder('target')}>{reader ? L.orderTarget(reader.targetLang) : T.orderT}</button>
          <button aria-pressed={prefs.order === 'source'} onclick={() => setOrder('source')}>{reader ? L.orderSource(reader.sourceLang) : T.orderS}</button>
        </div>
        <p class="tiny">{L.orderHint}</p>
      </div>
      <div class="field">
        <span class="label">{T.layers}</span>
        <div class="toggles">
          {#each readingLayers as [k, label] (k)}
            {@render toggle(prefs.layers[k], label, () => (prefs.layers[k] = !prefs.layers[k]))}
          {/each}
        </div>
      </div>
      <label class="field">
        <span class="label">{T.taSize} <span class="mono">{prefs.taSize}px</span></span>
        <input type="range" min="14" max="22" step="1" bind:value={prefs.taSize} />
      </label>
      <label class="field">
        <span class="label">{T.srcSize} <span class="mono">{prefs.srcSize}px</span></span>
        <input type="range" min="12" max="20" step="0.5" bind:value={prefs.srcSize} />
      </label>
      {#if reader && reader.editions.length > 1}
        <div class="field">
          <span class="label">{L.sourceText}</span>
          <div class="seg wide" role="group" aria-label={L.sourceText} data-testid="source-switch">
            {#each reader.editions as s (s)}
              <button aria-pressed={reader.source === s} onclick={() => reader.onsource(s)}>{reader.srcName(s)}</button>
            {/each}
          </div>
          {#if reader.note}<p class="tiny">{reader.note}</p>{/if}
        </div>
      {:else if !reader && sourceChoices.length}
        <div class="field" data-testid="source-settings">
          <span class="label">{L.sourceText}</span>
          <p class="tiny">{L.sourceHelp}</p>
          {#each sourceChoices as g (g.t)}
            <span class="sublabel">{g.t === 'NT' ? L.sourceGreek : L.sourceHebrew}</span>
            <div class="seg wide">
              {#each g.ids as id, k (id)}
                <button aria-pressed={(prefs.sources[g.t] ?? g.ids[0]) === id} onclick={() => (prefs.sources = { ...prefs.sources, [g.t]: id })}>
                  {catalog?.sources.find((s) => s.id === id)?.shortName ?? id}{k === 0 ? ` (${L.sourceDefault})` : ''}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      <div class="field">
        <span class="label">{T.english}</span>
        <p class="tiny">{T.englishBody}</p>
        <div class="inline">
          <input class="input key" type="password" autocomplete="off" spellcheck="false" bind:value={prefs.esvKey} placeholder={T.key} aria-label={T.key} />
          <button class="btn" disabled={!prefs.esvKey.trim()} onclick={test}>{T.test}</button>
        </div>
        {#if keyMsg}<p class="msg">{keyMsg}</p>{/if}
      </div>
    </section>
  {/if}

  {#if show('study')}
    <section class="group">
      {#if section === 'all'}<h2>{L.setStudy}</h2>{/if}
      <div class="toggles">
        {@render toggle(prefs.layers.notes, L.notes, () => (prefs.layers.notes = !prefs.layers.notes))}
        {@render toggle(prefs.railOpen, L.showTools, () => (prefs.railOpen = !prefs.railOpen))}
      </div>
      <div class="field">
        <span class="label">{T.flagsTitle}</span>
        <p class="muted">{T.flagsBody(Object.keys(flags).length)}</p>
        <div class="inline">
          <button class="btn" disabled={!Object.keys(flags).length}
            onclick={() => download(new Blob([exportFlags()], { type: 'application/json' }), `verse-flags-${new Date().toISOString().slice(0, 10)}.json`)}>{T.export}</button>
          <input bind:this={fileInput} type="file" accept=".json" class="sr-only"
            onchange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              try { flagMsg = T.imported(importFlags(await f.text())); } catch (err) { flagMsg = (err as Error).message; }
              (e.target as HTMLInputElement).value = '';
            }} />
          <button class="btn" onclick={() => fileInput?.click()}>{T.import}</button>
          <button class="btn danger" disabled={!Object.keys(flags).length} onclick={() => confirm(T.confirmClear) && clearAllFlags()}>{T.clear}</button>
        </div>
        {#if flagMsg}<p class="msg">{flagMsg}</p>{/if}
      </div>
      <div class="field" data-testid="publish-settings">
        <span class="label">{P.title}</span>
        <p class="tiny">{P.body}</p>
        <label class="sub">
          <span class="sublabel">{P.repo}</span>
          <input class="input" spellcheck="false" bind:value={prefs.githubRepo} placeholder={DEFAULT_REPO} />
        </label>
        <label class="sub">
          <span class="sublabel">{P.token}</span>
          <span class="inline">
            <input class="input key" type="password" autocomplete="off" spellcheck="false" bind:value={prefs.githubToken} placeholder="github_pat_…" />
            <button class="btn" disabled={!prefs.githubToken.trim()} onclick={checkGithub}>{P.check}</button>
          </span>
        </label>
        {#if ghMsg}<p class="msg">{ghMsg}</p>{/if}
        <p class="tiny">
          {P.how}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">{P.create} ↗</a>
        </p>
      </div>
    </section>
  {/if}
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group {
    padding: 8px 18px 4px;
  }
  .all .group {
    background: var(--card);
    border: 1px solid var(--card-line);
    border-radius: var(--r-md);
    padding: 18px 20px 6px;
    margin-bottom: 10px;
  }
  h2 {
    font-size: 12px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
    min-width: 0;
  }
  .label {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ink-2);
  }
  .label .mono {
    color: var(--muted-4);
    font-size: 11px;
    font-weight: 400;
    margin-left: 6px;
  }
  .sublabel {
    font-size: 12.5px;
    color: var(--muted-2);
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .seg.wide {
    width: 100%;
  }
  .seg.wide button {
    flex: 1 1 0;
    min-height: 36px;
  }
  .themes button {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
  }
  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgba(127, 127, 127, 0.45);
    background: #f6f3ec;
  }
  .swatch.system {
    background: linear-gradient(135deg, #f6f3ec 50%, #11161a 50%);
  }
  .swatch.dark {
    background: #11161a;
  }
  .swatch.sepia {
    background: #f1e7d0;
  }
  input[type='range'] {
    accent-color: var(--accent);
    width: 100%;
    max-width: 360px;
  }
  .toggles {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 8px 2px;
    border: none;
    border-bottom: 1px solid var(--line-faint);
    background: transparent;
    text-align: start;
    font-size: 14px;
    color: var(--ink-3);
  }
  .tl {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sw {
    position: relative;
    flex: 0 0 auto;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--faint);
    transition: background 0.15s ease;
  }
  .sw span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--card);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s ease;
  }
  .toggle[aria-pressed='true'] .sw {
    background: var(--accent);
  }
  .toggle[aria-pressed='true'] .sw span {
    transform: translateX(16px);
  }
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
  }
  .key {
    flex: 1 1 200px;
    min-width: 0;
    font-family: var(--f-mono);
  }
  .muted {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted-2);
    margin: 0;
  }
  .msg {
    font-size: 12.5px;
    color: var(--accent-dark);
    margin: 0;
    overflow-wrap: anywhere;
  }
  .tiny {
    font-size: 12px;
    line-height: 1.55;
    color: var(--muted-4);
    margin: 0;
  }
  select.input {
    width: 100%;
  }
</style>
