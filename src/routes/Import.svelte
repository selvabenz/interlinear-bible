<script lang="ts">
  import { onMount } from 'svelte';
  import type { BookMeta, Catalog, IssueLevel } from '../lib/pipeline/types';
  import type { InputFile } from '../lib/pipeline/build';
  import { classifyFile } from '../lib/pipeline/classify';
  import { bookInfo } from '../lib/pipeline/books';
  import { loadCatalog, forgetBook } from '../lib/data/loader';
  import { saveLocalBook, listLocalBooks, deleteLocalBook } from '../lib/data/local';
  import { readFiles, runImport, contentBundle, contentFiles, download } from '../lib/data/importer';
  import { publishPullRequest, DEFAULT_REPO } from '../lib/data/github';
  import type { WorkerResponse, WorkerBookResult } from '../lib/import.worker';
  import { prefs } from '../lib/stores/prefs.svelte';
  import { href } from '../lib/stores/router.svelte';
  import { LABELS } from '../lib/i18n/labels';
  import AppBar from '../lib/components/AppBar.svelte';
  import AppMenu from '../lib/components/AppMenu.svelte';

  const L = $derived(LABELS[prefs.ui]);
  let menuOpen = $state(false);

  const ta = $derived(prefs.ui === 'ta');
  const T = $derived({
    title: ta ? 'தரவை இறக்கு' : 'Import data',
    intro: ta
      ? 'ஒரு புத்தகத்தைச் சேர்க்கவும் அல்லது புதுப்பிக்கவும். கோப்புகள் உங்கள் உலாவியிலேயே சரிபார்க்கப்படும்; எதுவும் பதிவேற்றப்படாது.'
      : 'Add or update a book. Files are checked here in your browser; nothing is uploaded.',
    need: ta
      ? 'தேவை: \\zaln இணைப்புள்ள USFM மட்டும் — வேதாகமத்தின் எந்தப் புத்தகத்திற்கும் (UGNT/UHB உடன் இணைத்த translationCore / Bridge கோப்புகள் அப்படியே ஏற்கப்படும்). கிரேக்க, எபிரெயச் சொல் பட்டியல்கள் செயலியிலேயே உள்ளன. விருப்பம்: \\zsem சொற்பொருள் USFM, <BOOK>.meta.json. .zip கோப்பும் ஏற்கப்படும்.'
      : 'Needed: only the USFM with \\zaln word alignment, for any book of the Bible (translationCore / Bridge files aligned to UGNT or UHB work as they are) — the Greek and Hebrew word lists come with the app. Optional: USFM with \\zsem semantic units, <BOOK>.meta.json passage labels. A .zip works too. The book is checked once per source text: as aligned, and remapped automatically to each other source text.',
    translation: ta ? 'மொழிபெயர்ப்பு' : 'Translation',
    choose: ta ? 'கோப்புகளைத் தேர்ந்தெடு' : 'Choose files',
    drop: ta ? 'அல்லது இங்கே இழுத்து விடவும்' : 'or drop them here',
    check: ta ? 'சரிபார்' : 'Check files',
    checking: ta ? 'சரிபார்க்கிறது…' : 'Checking…',
    clear: ta ? 'அழி' : 'Clear',
    ok: ta ? 'சரி' : 'Ready',
    failed: ta ? 'பிழைகள் உள்ளன' : 'Has errors',
    save: ta ? 'இந்தச் சாதனத்தில் சேமி' : 'Save on this device',
    saved: ta ? 'சேமிக்கப்பட்டது' : 'Saved',
    open: ta ? 'திற' : 'Open',
    bundle: ta ? 'வெளியிடுவதற்கான தொகுப்பு (.zip)' : 'Download content bundle (.zip)',
    missing: ta ? 'கோப்புகள் குறைவு' : 'Missing files',
    onDevice: ta ? 'இந்தச் சாதனத்திலுள்ள புத்தகங்கள்' : 'Books on this device',
    none: ta ? 'எதுவும் இல்லை.' : 'None yet.',
    remove: ta ? 'நீக்கு' : 'Remove',
    publishTitle: ta ? 'எல்லோருக்கும் வெளியிட' : 'Publishing for everyone',
    publish: ta
      ? 'இங்கே சேமித்த புத்தகம் இந்தச் சாதனத்தில் மட்டுமே தெரியும். எல்லாச் சாதனங்களுக்கும் வெளியிட, "வெளியிடு (pull request)" அழுத்தவும் (அமைப்புகளில் GitHub சாவி தேவை); GitHub-இல் pull request-ஐ இணைத்ததும் தளம் புதுப்பிக்கப்படும். அல்லது தொகுப்பைப் பதிவிறக்கி அதன் content/ கோப்புறையை களஞ்சியத்தில் சேர்க்கவும்.'
      : 'A book saved here is visible on this device only. To publish it for every device, press “Publish (pull request)” (needs a GitHub token in Settings) and merge the pull request on GitHub — the site then updates by itself. Or download the content bundle and copy its content/ folder into the repository.',
    guide: ta ? 'உள்ளடக்க வழிகாட்டி' : 'Content guide',
    errors: ta ? 'பிழைகள்' : 'errors',
    warnings: ta ? 'எச்சரிக்கைகள்' : 'warnings',
    back: ta ? '‹ நூலகம்' : '‹ Library',
    asAligned: ta ? 'இணைத்தபடியே' : 'as aligned',
    publishPr: ta ? 'வெளியிடு (pull request)' : 'Publish (pull request)',
    publishing: ta ? 'வெளியிடுகிறது…' : 'Publishing…',
    prOpened: ta ? 'Pull request திறக்கப்பட்டது' : 'Pull request opened',
    prNext: ta
      ? 'GitHub-இல் சரிபார்ப்பு (CI) முடிந்ததும் pull request-ஐ இணைக்கவும்; ஒரு நிமிடத்தில் புத்தகம் எல்லாச் சாதனங்களிலும் தெரியும்.'
      : 'When the checks on GitHub pass, merge the pull request; about a minute later the book is on the site for every device.',
    needToken: ta ? 'எல்லாச் சாதனங்களுக்கும் வெளியிட, அமைப்புகளில் GitHub சாவியைச் சேர்க்கவும்:' : 'To publish for every device, add a GitHub token in',
    settings: ta ? 'அமைப்புகள்' : 'Settings',
    remapped: (from: string) => (ta ? `${from} இலிருந்து தானாக மாற்றப்பட்டது` : `remapped from ${from}`),
    remapStats: (kept: number, dropped: number, cross: number) =>
      ta
        ? `${kept} இணைப்புகள் மாற்றப்பட்டன · ${dropped} இணையில்லை · ${cross} வேறு வசனத்திற்கு`
        : `${kept} links carried over · ${dropped} without a counterpart · ${cross} into another verse`,
    role: { aligned: 'aligned USFM', semantic: 'semantic USFM', source: 'source tokens', meta: 'book metadata', unknown: '—' } as Record<string, string>
  });

  let catalog = $state.raw<Catalog | null>(null);
  let translation = $state('');
  let files = $state<InputFile[]>([]);
  let busy = $state(false);
  let res = $state.raw<WorkerResponse | null>(null);
  let err = $state('');
  let savedKeys = $state<Record<string, boolean>>({});
  let local = $state.raw<BookMeta[]>([]);
  let dragging = $state(false);
  let input: HTMLInputElement;

  onMount(() => {
    loadCatalog()
      .then((c) => {
        catalog = c;
        translation ||= c.translations[0]?.id ?? 'ta-irv';
      })
      .catch(() => (translation ||= 'ta-irv'));
    refreshLocal();
  });

  async function refreshLocal() {
    local = await listLocalBooks();
  }

  async function add(list: FileList | File[]) {
    err = '';
    try {
      const got = await readFiles(list);
      // the same file chosen again replaces itself; a different file with the same name (e.g.
      // grc-tr/JAS.json and grc-ugnt/JAS.json) is kept under a distinct name
      let next = [...files];
      for (const g of got) {
        const same = next.findIndex((f) => f.name === g.name);
        if (same >= 0 && next[same].text === g.text) continue;
        let name = g.name;
        for (let k = 2; next.some((f) => f.name === name); k++) name = g.name.replace(/(\.[^.]+)?$/, ` (${k})$1`);
        next = [...next, { ...g, name }];
      }
      files = next;
      res = null;
    } catch (e) {
      err = (e as Error).message;
    }
  }

  async function check() {
    busy = true;
    err = '';
    try {
      // state proxies cannot be cloned into the worker
      res = await runImport($state.snapshot(files), translation);
    } catch (e) {
      err = (e as Error).message;
    }
    busy = false;
  }

  const rkey = (r: WorkerBookResult) => `${r.book}/${r.sourceId}`;

  // ---------------------------------------------------------------- publish (pull request)
  let pub = $state<Record<string, { busy?: boolean; url?: string; err?: string }>>({});
  const canPublish = $derived(!!prefs.githubToken.trim());

  async function publish(r: WorkerBookResult) {
    const k = rkey(r);
    pub[k] = { busy: true };
    try {
      const { files, maps } = contentFiles(translation, r);
      const editions = (res?.books ?? []).filter((x) => x.book === r.book);
      const name = r.result.book?.name;
      const lines = editions.map((e) => {
        const s = e.result.book?.stats;
        const ed = e.result.book?.edition;
        const how = e.primary ? 'as aligned' : `remapped from ${srcName(e.alignedTo)}: ${ed?.kept ?? 0} links kept, ${ed?.dropped ?? 0} without a counterpart`;
        return `- **${srcName(e.sourceId)}** (${how}) — ${s ? `${s.verses} verses, ${s.groups} groups, ` : ''}${e.result.issues.filter((i) => i.level === 'error').length} errors, ${e.result.issues.filter((i) => i.level === 'warning').length} warnings`;
      });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
      const out = await publishPullRequest({
        token: prefs.githubToken.trim(),
        repo: prefs.githubRepo.trim() || DEFAULT_REPO,
        files,
        maps,
        branch: `content/${translation}-${r.book.toLowerCase()}-${stamp}`,
        title: `content(${r.book}): ${name?.en ?? r.book} (${translation})`,
        body: [
          'Published from the in-app importer.',
          '',
          `**${name?.en ?? r.book}** · ${name?.native ?? ''} · ${translation} · aligned to ${srcName(r.alignedTo)}`,
          '',
          ...lines,
          '',
          'Files:',
          ...[...Object.keys(files), ...Object.keys(maps)].map((f) => `- \`${f}\``),
          '',
          'CI validates the content; merging this pull request deploys the book to the site for every device.'
        ].join('\n')
      });
      pub[k] = { url: out.url };
    } catch (e) {
      pub[k] = { err: (e as Error).message };
    }
  }
  const srcName = (id: string) => catalog?.sources.find((s) => s.id === id)?.shortName ?? id;

  async function save(r: WorkerBookResult) {
    if (!r.result.book || !r.result.chapters) return;
    await saveLocalBook({ book: r.result.book, chapters: r.result.chapters, files: r.files, importedAt: new Date().toISOString() });
    forgetBook(translation, r.book, r.sourceId);
    savedKeys[rkey(r)] = true;
    refreshLocal();
  }

  async function removeLocal(b: BookMeta) {
    await deleteLocalBook(b.translation, b.id, b.source);
    forgetBook(b.translation, b.id, b.source);
    refreshLocal();
  }

  const count = (r: WorkerBookResult, l: IssueLevel) => r.result.issues.filter((i) => i.level === l).length;
  const sorted = (r: WorkerBookResult) => {
    const order = { error: 0, warning: 1, info: 2 };
    return [...r.result.issues].sort((a, b) => order[a.level] - order[b.level]).slice(0, 200);
  };
</script>

<div class="page">
  <AppBar menuLabel={L.menu} onmenu={() => (menuOpen = true)} width="860px">
    <h1>{T.title}</h1>
  </AppBar>

  <main class="main">
    <p class="intro">{T.intro}</p>
    <p class="need">{T.need}</p>

    <div class="row">
      <label class="field">
        <span class="eyebrow">{T.translation}</span>
        <select class="input" bind:value={translation}>
          {#each catalog?.translations ?? [{ id: 'ta-irv', name: 'IRV Tamil' }] as t (t.id)}
            <option value={t.id}>{t.name} ({t.id})</option>
          {/each}
        </select>
      </label>
    </div>

    <div
      class="drop card"
      class:dragging
      role="region"
      aria-label={T.choose}
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => (dragging = false)}
      ondrop={(e) => { e.preventDefault(); dragging = false; if (e.dataTransfer?.files) add(e.dataTransfer.files); }}
    >
      <input bind:this={input} type="file" multiple accept=".usfm,.sfm,.json,.zip,.txt" class="sr-only"
        onchange={(e) => { const f = (e.target as HTMLInputElement).files; if (f) add(f); (e.target as HTMLInputElement).value = ''; }} />
      <button class="btn primary" onclick={() => input.click()}>{T.choose}</button>
      <span class="hint">{T.drop}</span>
    </div>

    {#if files.length}
      <div class="table-wrap">
      <table class="files">
        <tbody>
          {#each files as f (f.name)}
            {@const c = classifyFile(f.name, f.text)}
            <tr>
              <td class="fname">{f.name}</td>
              <td><span class="pill" class:ok={c.role !== 'unknown'}>{T.role[c.role]}</span></td>
              <td class="mono">{c.book ?? ''} {c.book ? bookInfo(c.book)?.en ?? '?' : ''}</td>
              <td class="mono size">{(f.text.length / 1024).toFixed(0)} KB</td>
              <td><button class="btn ghost" onclick={() => { files = files.filter((x) => x !== f); res = null; }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
      <div class="actions">
        <button class="btn primary" disabled={busy} onclick={check}>{busy ? T.checking : T.check}</button>
        <button class="btn" onclick={() => { files = []; res = null; }}>{T.clear}</button>
      </div>
    {/if}

    {#if err}<p class="err">{err}</p>{/if}

    {#if res}
      {#each res.missing as m (m.book)}
        <div class="result card bad">
          <div class="rhead"><strong>{m.book}</strong> <span class="pill flag">{T.missing}</span></div>
          <ul>{#each m.need as n (n)}<li>{n}</li>{/each}</ul>
        </div>
      {/each}
      {#each res.books as r (rkey(r))}
        {@const s = r.result.book?.stats}
        {@const ed = r.result.book?.edition}
        <div class="result card" class:bad={!r.result.ok}>
          <div class="rhead">
            <strong>{r.result.book?.name.native ?? r.book}</strong>
            <span class="mono">{r.book} · {translation} · {srcName(r.sourceId)}</span>
            <span class="pill">{r.primary ? T.asAligned : T.remapped(srcName(r.alignedTo))}</span>
            <span class="pill {r.result.ok ? 'ok' : 'flag'}">{r.result.ok ? T.ok : T.failed}</span>
            <span class="mono small">{count(r, 'error')} {T.errors} · {count(r, 'warning')} {T.warnings}</span>
          </div>
          {#if s}
            <div class="mono stats">
              {s.verses} v · {s.sourceWords} src · {s.targetWords} tgt · {s.groups} groups · {s.units} units · {s.findings} findings
            </div>
          {/if}
          {#if ed && !ed.primary}
            <div class="mono stats">{T.remapStats(ed.kept ?? 0, ed.dropped ?? 0, ed.crossVerse ?? 0)}</div>
          {/if}
          {#if r.result.issues.length}
            <ul class="issues">
              {#each sorted(r) as i, k (k)}
                <li class={i.level}><span class="mono code">{i.code}</span> {i.message}</li>
              {/each}
            </ul>
          {/if}
          {#if r.result.ok}
            <div class="actions">
              {#if savedKeys[rkey(r)]}
                <a class="btn primary" href={href({ name: 'read', translation, book: r.book, src: r.sourceId })}>{T.open}</a>
                <span class="pill ok">{T.saved}</span>
              {:else}
                <button class="btn primary" onclick={() => save(r)}>{T.save}</button>
              {/if}
              {#if r.primary}
                {@const p = pub[rkey(r)]}
                {#if p?.url}
                  <a class="btn primary" href={p.url} target="_blank" rel="noopener" data-testid="pr-link">{T.prOpened} ↗</a>
                {:else if canPublish}
                  <button class="btn primary" disabled={p?.busy || res?.books.some((x) => x.book === r.book && !x.result.ok)} onclick={() => publish(r)}>
                    {p?.busy ? T.publishing : T.publishPr}
                  </button>
                {/if}
                <button class="btn" onclick={() => download(contentBundle(translation, r), `${translation}-${r.book}-content.zip`)}>{T.bundle}</button>
              {/if}
            </div>
            {#if r.primary}
              {@const p = pub[rkey(r)]}
              {#if p?.url}<p class="msg ok-msg">{T.prNext}</p>{/if}
              {#if p?.err}<p class="err">{p.err}</p>{/if}
              {#if !canPublish}<p class="muted small">{T.needToken} <a href={href({ name: 'settings' })}>{T.settings}</a></p>{/if}
            {/if}
          {/if}
        </div>
      {/each}
    {/if}

    <section class="sec">
      <h2>{T.onDevice}</h2>
      {#if local.length}
        <ul class="local">
          {#each local as b (b.translation + b.id + b.source)}
            <li>
              <a href={href({ name: 'read', translation: b.translation, book: b.id, src: b.source })}>{b.name.native}</a>
              <span class="mono">{b.translation}/{b.id} · {srcName(b.source)} · {b.builtAt.slice(0, 10)}</span>
              <button class="btn ghost danger" onclick={() => removeLocal(b)}>{T.remove}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{T.none}</p>
      {/if}
    </section>

    <section class="sec">
      <h2>{T.publishTitle}</h2>
      <p class="muted">{T.publish}</p>
      <a href="https://github.com/selvabenz/interlinear-bible/blob/main/docs/CONTENT_GUIDE.md" target="_blank" rel="noopener">{T.guide} ↗</a>
    </section>
  </main>
</div>

<AppMenu bind:open={menuOpen} />

<style>
  .table-wrap {
    max-width: 100%;
    overflow-x: auto;
  }
  h1 {
    margin: 0 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }
  .main {
    max-width: 860px;
    margin: 0 auto;
    padding: 26px 22px 80px;
  }
  .intro {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ink-3);
    margin: 0 0 6px;
  }
  .need {
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted-2);
    margin: 0 0 18px;
  }
  .row {
    display: flex;
    gap: 16px;
    margin-bottom: 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .drop {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 22px;
    border-style: dashed;
    border-width: 1.5px;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: var(--accent-wash);
  }
  .hint {
    color: var(--muted-4);
    font-size: 13px;
  }
  .files {
    width: 100%;
    margin-top: 14px;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  .files td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line-soft);
  }
  .fname {
    word-break: break-all;
  }
  .size {
    color: var(--muted-5);
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .err {
    color: var(--danger);
  }
  .result .msg,
  .result .err,
  .result .muted {
    margin: 10px 0 0;
    font-size: 12.5px;
  }
  .result {
    margin-top: 16px;
    padding: 16px 18px;
  }
  .result.bad {
    border-color: color-mix(in srgb, var(--danger) 30%, var(--card-line));
  }
  .rhead {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rhead strong {
    font-family: var(--f-ta-head);
    font-size: 17px;
    font-weight: 500;
  }
  .rhead .mono {
    font-size: 11px;
    color: var(--muted-4);
  }
  .stats {
    margin-top: 6px;
    font-size: 11px;
    color: var(--muted-3);
  }
  .issues {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    max-height: 280px;
    overflow: auto;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .issues li {
    padding: 4px 8px;
    border-left: 2px solid var(--line);
    margin-bottom: 3px;
  }
  .issues li.error {
    border-left-color: var(--danger);
    background: var(--danger-soft);
  }
  .issues li.warning {
    border-left-color: var(--gold);
    background: var(--gold-soft);
  }
  .issues li.info {
    color: var(--muted-2);
  }
  .code {
    font-size: 10.5px;
    color: var(--muted-3);
  }
  .sec {
    margin-top: 34px;
  }
  .sec h2 {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 10px;
  }
  .local {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .local li {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
    padding: 6px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .local a {
    font-family: var(--f-ta-head);
  }
  .local .mono {
    font-size: 11px;
    color: var(--muted-4);
  }
  .muted {
    color: var(--muted-2);
    font-size: 13px;
    line-height: 1.6;
  }
  @media (max-width: 640px) {
    .main {
      padding: 20px 16px 60px;
    }
    .drop {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
