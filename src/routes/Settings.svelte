<script lang="ts">
  import { onMount } from 'svelte';
  import type { Catalog } from '../lib/pipeline/types';
  import { loadCatalog } from '../lib/data/loader';
  import { sourcesFor } from '../lib/pipeline/sources';
  import { LABELS } from '../lib/i18n/labels';
  import { prefs, resetPrefs } from '../lib/stores/prefs.svelte';
  import { flags, exportFlags, importFlags, clearAllFlags } from '../lib/stores/flags.svelte';
  import { testEsvKey } from '../lib/esv';
  import { checkToken, DEFAULT_REPO } from '../lib/data/github';
  import { download } from '../lib/data/importer';

  const L = $derived(LABELS[prefs.ui]);
  const ta = $derived(prefs.ui === 'ta');
  const T = $derived({
    title: L.settings,
    back: ta ? '‹ நூலகம்' : '‹ Library',
    display: ta ? 'காட்சி' : 'Display',
    lang: ta ? 'இடைமுக மொழி' : 'Interface language',
    taSize: ta ? 'மொழிபெயர்ப்புச் சொல் அளவு' : 'Translation word size',
    srcSize: ta ? 'மூலச் சொல் அளவு' : 'Source word size',
    order: ta ? 'சொல் வரிசை' : 'Word order',
    orderT: ta ? 'தலைகீழ் இடைவரி — மொழிபெயர்ப்பின் வரிசை' : 'Reverse interlinear — translation order',
    orderS: ta ? 'இடைவரி — மூலமொழியின் வரிசை' : 'Interlinear — original-language order',
    layers: ta ? 'இயல்பான அடுக்குகள்' : 'Layers shown',
    english: ta ? 'ஆங்கில வசனம் (ESV)' : 'English verse (ESV)',
    englishBody: ta
      ? 'ESV உரை Crossway-இன் பதிப்புரிமை; இது தளத்துடன் வெளியிடப்படவில்லை. api.esv.org-இல் இலவச API சாவியைப் பெற்று இங்கே ஒட்டவும். சாவி இந்த உலாவியில் மட்டுமே சேமிக்கப்படும்.'
      : 'The ESV text is © Crossway and is not published with this site. Get a free API key at api.esv.org and paste it here; the passage you read is then fetched from the ESV API. The key is stored only in this browser.',
    key: ta ? 'ESV API சாவி' : 'ESV API key',
    test: ta ? 'சோதி' : 'Test key',
    keyOk: ta ? 'சாவி வேலை செய்கிறது' : 'Key works',
    show: ta ? 'ஆங்கில வசன அடுக்கைக் காட்டு' : 'Show the English verse layer',
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
    reset: ta ? 'அமைப்புகளை மீட்டமை' : 'Reset settings',
    about: ta ? 'பற்றி' : 'About',
    version: ta ? 'பதிப்பு' : 'Version'
  });

  let catalog = $state.raw<Catalog | null>(null);
  /** per testament: the translation's source texts, when there is a choice and books to read */
  const sourceChoices = $derived.by(() => {
    const tr = catalog?.translations.find((t) => t.id === prefs.translation) ?? catalog?.translations[0];
    if (!tr || !catalog) return [];
    return (['NT', 'OT'] as const)
      .map((t) => ({ t, ids: sourcesFor(tr, t).filter((id) => catalog!.books.some((b) => b.translation === tr.id && b.testament === t && b.source === id)) }))
      .filter((g) => g.ids.length > 1);
  });
  let keyMsg = $state('');
  let ghMsg = $state('');
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

  async function checkGithub() {
    ghMsg = '…';
    try {
      const r = await checkToken(prefs.githubToken.trim(), prefs.githubRepo.trim() || DEFAULT_REPO);
      ghMsg = P.ok(r.login, prefs.githubRepo.trim() || DEFAULT_REPO);
    } catch (e) {
      ghMsg = (e as Error).message;
    }
  }
  let flagMsg = $state('');
  let storage = $state('');
  let cacheMsg = $state('');
  let fileInput: HTMLInputElement;

  onMount(() => {
    loadCatalog().then((c) => (catalog = c)).catch(() => {});
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) storage = `${(e.usage / 1024 / 1024).toFixed(1)} MB${e.quota ? ` / ${(e.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}`;
    });
  });

  async function test() {
    keyMsg = '…';
    try {
      const v = await testEsvKey(prefs.esvKey.trim());
      keyMsg = `${T.keyOk}: “${v.slice(0, 80)}…”`;
    } catch (e) {
      keyMsg = (e as Error).message;
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

  const layerList = $derived([
    ['translit', L.translit], ['gloss', L.gloss], ['strong', L.strong], ['morph', L.morph], ['esv', L.esv], ['notes', L.notes]
  ] as [keyof typeof prefs.layers, string][]);
</script>

<div class="page">
  <header class="hdr">
    <div class="bar">
      <a class="btn ghost" href="#/">{T.back}</a>
      <h1>{T.title}</h1>
    </div>
  </header>

  <main class="main">
    <section class="card sec">
      <h2>{T.display}</h2>
      <div class="field">
        <span class="label">{T.lang}</span>
        <div class="seg">
          <button aria-pressed={prefs.ui === 'en'} onclick={() => (prefs.ui = 'en')}>English</button>
          <button aria-pressed={prefs.ui === 'ta'} onclick={() => (prefs.ui = 'ta')}>தமிழ்</button>
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
      <div class="preview">
        <span class="pta">கிறிஸ்து</span><span class="pgr">Χριστοῦ</span>
      </div>
      <div class="field">
        <span class="label">{T.order}</span>
        <label class="radio"><input type="radio" bind:group={prefs.order} value="target" /> {T.orderT}</label>
        <label class="radio"><input type="radio" bind:group={prefs.order} value="source" /> {T.orderS}</label>
      </div>
      <div class="field">
        <span class="label">{T.layers}</span>
        <div class="chips">
          {#each layerList as [k, label] (k)}
            <button class="chip" aria-pressed={prefs.layers[k]} onclick={() => (prefs.layers[k] = !prefs.layers[k])}>{label}</button>
          {/each}
        </div>
      </div>
    </section>

    {#if sourceChoices.length}
      <section class="card sec" data-testid="source-settings">
        <h2>{L.sourceText}</h2>
        <p class="muted">{L.sourceHelp}</p>
        {#each sourceChoices as g (g.t)}
          <div class="field">
            <span class="label">{g.t === 'NT' ? L.sourceGreek : L.sourceHebrew}</span>
            <div class="seg">
              {#each g.ids as id, k (id)}
                <button
                  aria-pressed={(prefs.sources[g.t] ?? g.ids[0]) === id}
                  onclick={() => (prefs.sources = { ...prefs.sources, [g.t]: id })}
                >{catalog?.sources.find((s) => s.id === id)?.shortName ?? id}{k === 0 ? ` (${L.sourceDefault})` : ''}</button>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    <section class="card sec" data-testid="publish-settings">
      <h2>{P.title}</h2>
      <p class="muted">{P.body}</p>
      <label class="field">
        <span class="label">{P.repo}</span>
        <input class="input" spellcheck="false" bind:value={prefs.githubRepo} placeholder={DEFAULT_REPO} />
      </label>
      <label class="field">
        <span class="label">{P.token}</span>
        <div class="inline">
          <input class="input key" type="password" autocomplete="off" spellcheck="false" bind:value={prefs.githubToken} placeholder="github_pat_…" />
          <button class="btn" disabled={!prefs.githubToken.trim()} onclick={checkGithub}>{P.check}</button>
        </div>
      </label>
      {#if ghMsg}<p class="msg">{ghMsg}</p>{/if}
      <p class="tiny">
        {P.how}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">{P.create} ↗</a>
      </p>
    </section>

    <section class="card sec">
      <h2>{T.english}</h2>
      <p class="muted">{T.englishBody}</p>
      <label class="field">
        <span class="label">{T.key}</span>
        <div class="inline">
          <input class="input key" type="password" autocomplete="off" spellcheck="false" bind:value={prefs.esvKey} placeholder="Token…" />
          <button class="btn" disabled={!prefs.esvKey.trim()} onclick={test}>{T.test}</button>
        </div>
      </label>
      {#if keyMsg}<p class="msg">{keyMsg}</p>{/if}
      <label class="radio"><input type="checkbox" bind:checked={prefs.layers.esv} /> {T.show}</label>
      <p class="tiny">{L.esvCopyright}</p>
    </section>

    <section class="card sec">
      <h2>{T.flagsTitle}</h2>
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
        <button class="btn" onclick={() => fileInput.click()}>{T.import}</button>
        <button class="btn danger" disabled={!Object.keys(flags).length} onclick={() => confirm(T.confirmClear) && clearAllFlags()}>{T.clear}</button>
      </div>
      {#if flagMsg}<p class="msg">{flagMsg}</p>{/if}
    </section>

    <section class="card sec">
      <h2>{T.offlineTitle}</h2>
      {#if storage}<p class="muted">{T.storage}: <span class="mono">{storage}</span></p>{/if}
      <div class="inline">
        <button class="btn" onclick={clearCache}>{T.clearCache}</button>
        <button class="btn" onclick={resetPrefs}>{T.reset}</button>
      </div>
      {#if cacheMsg}<p class="msg">{cacheMsg}</p>{/if}
    </section>

    <section class="card sec">
      <h2>{T.about}</h2>
      {#each catalog?.translations ?? [] as t (t.id)}<p class="muted">{t.name} — {t.attribution}, {t.licence}.</p>{/each}
      {#each catalog?.sources ?? [] as s (s.id)}<p class="muted">{s.name} — {s.attribution}, {s.licence}.</p>{/each}
      <p class="muted">Semantic alignment data: AI-proposed, pending reviewer confirmation. Layout after the reading and study designs; app © Bridge Connectivity Solutions, GPL-3.0.</p>
      <p class="tiny mono">{T.version} {__APP_VERSION__} · {catalog ? `data ${catalog.builtAt.slice(0, 16).replace('T', ' ')}` : ''}</p>
      <p><a href="https://github.com/selvabenz/interlinear-bible" target="_blank" rel="noopener">GitHub ↗</a></p>
    </section>
  </main>
</div>

<style>
  .hdr {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--bar);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    max-width: 720px;
    margin: 0 auto;
    padding: 12px 22px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .main {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 22px 80px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .sec {
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
  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-bottom: 14px;
  }
  .label {
    font-size: 13px;
    color: var(--ink-3);
  }
  .label .mono {
    color: var(--muted-4);
    font-size: 11px;
    margin-left: 6px;
  }
  .seg {
    align-self: flex-start;
  }
  input[type='range'] {
    accent-color: var(--accent);
    max-width: 320px;
  }
  .preview {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: -4px 0 16px;
    padding: 10px 12px;
    background: var(--bg);
    border-radius: 8px;
  }
  .pta {
    font-family: var(--f-ta);
    font-size: var(--ta-size);
  }
  .pgr {
    font-family: var(--f-gr);
    font-size: var(--src-size);
    color: var(--greek);
  }
  .radio {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    color: var(--ink-3);
  }
  .radio input {
    accent-color: var(--accent);
  }
  .chips,
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
  }
  .key {
    width: 320px;
    max-width: 100%;
    font-family: var(--f-mono);
  }
  .muted {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted-2);
    margin: 0 0 10px;
  }
  .msg {
    font-size: 12.5px;
    color: var(--accent-dark);
  }
  .tiny {
    font-size: 11px;
    color: var(--muted-5);
  }
  @media (max-width: 640px) {
    .bar {
      padding: 10px 16px;
    }
    .main {
      padding: 16px 12px 60px;
    }
  }
</style>
