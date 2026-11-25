import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/*
 * Smoke tests of the built app with the first published book (PHM).
 * Book-specific values (words, Strong's numbers) come from the seeded content.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 700;

/** The app bar's menu, and a settings group inside it. */
async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
}
async function openSettings(page: Page, group: 'App settings' | 'Reading settings' | 'Study settings') {
  await openMenu(page);
  await page.locator('dialog[open]').getByRole('button', { name: group }).click();
}
/** In a book on a phone, search is an icon in the app bar that opens the field. */
async function openSearch(page: Page) {
  const box = page.getByRole('searchbox');
  if (!(await box.isVisible())) await page.getByRole('button', { name: 'Search', exact: true }).click();
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
  });
});

test('library lists the available book and opens the reading view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Read the Bible word by word.' })).toBeVisible();
  const card = page.locator('article.book').filter({ hasText: 'Philemon' });
  await expect(card).toContainText('பிலேமோன்');
  await card.getByRole('link', { name: 'Read' }).click();
  await expect(page).toHaveURL(/#\/read\/ta-irv\/PHM\/GREETING/);
  await expect(page.getByRole('heading', { level: 1, name: 'Greeting' })).toBeVisible();
  const first = page.locator('[data-key="t:1:1.1"]');
  await expect(first).toContainText('கிறிஸ்து');
  await expect(first).toContainText('Χριστοῦ');
  await expect(first).toContainText('G5547');
});

test('reading view: word detail, layers, order and language', async ({ page }) => {
  await page.goto('/#/read/ta-irv/PHM/GREETING');
  const word = page.locator('[data-key="t:1:1.1"]');
  await word.click();
  const card = page.locator('.card-read');
  await expect(card).toContainText("Strong's entry");
  await expect(card).toContainText('noun — genitive singular masculine, title');
  await expect(card).toContainText('Also in this book');
  await expect(page).toHaveURL(/w=t%3A1%3A1\.1/);

  // layers, in Reading settings in the menu
  await expect(word).toContainText('Christou');
  await openSettings(page, 'Reading settings');
  await page.getByRole('button', { name: 'Transliteration' }).click();
  await expect(word).not.toContainText('Christou');

  // interlinear (source) order: the first stack is the first Greek word
  await page.getByRole('button', { name: 'Greek order' }).click();
  const firstSrc = page.locator('[data-key="s:1:1#1"]');
  await expect(firstSrc).toContainText('Παῦλος');
  await expect(firstSrc).toContainText('பவுலும்');
  await page.getByRole('button', { name: 'Tamil order' }).click();

  // Tamil interface, in App settings
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'App settings' }).click();
  await page.getByRole('button', { name: 'தமிழ்', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'வாழ்த்துரை' })).toBeVisible();
});

test('study view: rail, study marks, side or inline panel', async ({ page }) => {
  await page.goto('/#/study/ta-irv/PHM/THANKSGIVING');
  await openMenu(page);
  await page.getByRole('button', { name: 'Study tools' }).click();
  await expect(page.locator('.rail')).toContainText('Passage map');
  await expect(page.locator('.maprow').first()).toContainText('swapped');
  const mark = page.locator('.rail .finding').first();
  await expect(mark).toBeVisible();
  await mark.click();
  if (isPhone(page)) {
    await expect(page.locator('.card-inline')).toContainText('Semantic unit');
  } else {
    await expect(page.locator('.card-panel')).toContainText('Meaning shift');
  }
});

test('search jumps to a word in another passage', async ({ page }) => {
  await page.goto('/#/read/ta-irv/PHM/GREETING');
  await (await openSearch(page)).fill('Onesimus');
  const hit = page.locator('.hit').first();
  await expect(hit).toContainText('1:10');
  await hit.click();
  await expect(page).toHaveURL(/APPEAL/);
  await expect(page.locator('.stack.selected')).toContainText('Onesimus');
});

test('verse flags are saved on the device', async ({ page }) => {
  await page.goto('/#/read/ta-irv/PHM/GREETING');
  await page.locator('#v1\\:2 .flagbtn').click();
  await page.getByPlaceholder('What should a reviewer look at here?').fill('Check ἀγαπητῇ vs ἀδελφῇ');
  await page.getByRole('button', { name: 'Base text', exact: true }).click();
  await page.getByRole('button', { name: 'Save flag' }).click();
  await expect(page.locator('#v1\\:2 .saved-flag')).toContainText('Check ἀγαπητῇ');
  await page.reload();
  await expect(page.locator('#v1\\:2 .saved-flag')).toContainText('Base text');
});

test('import validates files and opens the book as a local preview', async ({ page }) => {
  test.skip(isPhone(page), 'file import is checked on desktop');
  await page.goto('/#/import');
  await page.locator('input[type=file]').setInputFiles([
    join(ROOT, 'content/translations/ta-irv/PHM.aligned.usfm'),
    join(ROOT, 'content/translations/ta-irv/PHM.semantic.usfm'),
    join(ROOT, 'content/sources/grc-tr/PHM.json')
  ]);
  await expect(page.locator('table.files tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Check files' }).click();
  const result = page.locator('.result').first();
  await expect(result).toContainText('Ready');
  await expect(result).toContainText('0 errors');
  await result.getByRole('button', { name: 'Save on this device' }).click();
  await result.getByRole('link', { name: 'Open' }).click();
  await expect(page.locator('.local')).toContainText('Local preview');
  await page.getByRole('button', { name: 'Remove local copy' }).click();
  await expect(page.locator('.local')).toHaveCount(0);
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/#/read/ta-irv/PHM/GREETING');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker, data goes through its cache
  await expect(page.locator('[data-key="t:1:1.1"]')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-key="t:1:1.1"]')).toContainText('கிறிஸ்து');
  await context.setOffline(false);
});

test('a Bridge (UGNT-aligned) book is readable in both source texts', async ({ page }) => {
  // 1 John: aligned against UGNT, also published remapped to the Textus Receptus (catalog default)
  // the source text is chosen in Reading settings
  await page.goto('/#/read/ta-irv/1JN/c5');
  await openSettings(page, 'Reading settings');
  const sw = page.getByTestId('source-switch');
  await expect(sw.getByRole('button', { name: 'Textus Receptus 1894' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.edition-note')).toContainText('remapped automatically from UGNT');

  // the TR has the "three in heaven" words of 5:7; the UGNT does not (Greek word order)
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('ib-prefs') ?? '{}');
    localStorage.setItem('ib-prefs', JSON.stringify({ ...p, order: 'source' }));
  });
  await page.reload();
  const v57 = page.locator('[data-key^="s:5:7#"]');
  await expect(v57.filter({ hasText: 'οὐρανῷ' })).not.toHaveCount(0);

  await openSettings(page, 'Reading settings');
  await sw.getByRole('button', { name: 'UGNT' }).click();
  await expect(page).toHaveURL(/src=grc-ugnt/);
  await openSettings(page, 'Reading settings');
  await expect(page.getByTestId('source-switch').getByRole('button', { name: 'UGNT' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-key^="s:5:7#"]').first()).toBeVisible();
  await expect(page.locator('[data-key^="s:5:7#"]').filter({ hasText: 'οὐρανῷ' })).toHaveCount(0);
  await expect(page.locator('.edition-note')).toHaveCount(0);

  // the choice is remembered for links without ?src=
  await page.goto('/#/read/ta-irv/1JN/c1');
  await openSettings(page, 'Reading settings');
  await expect(page.getByTestId('source-switch').getByRole('button', { name: 'UGNT' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-key="s:1:1#1"]')).toContainText('ὃ');
});

test('the menu closes with its button, Escape and a tap outside', async ({ page }) => {
  await page.goto('/#/read/ta-irv/PHM/GREETING');
  const open = page.locator('dialog[open]');
  await openMenu(page);
  await open.getByRole('button', { name: 'Close' }).click();
  await expect(open).toHaveCount(0);
  await openMenu(page);
  await page.keyboard.press('Escape');
  await expect(open).toHaveCount(0);
  await openMenu(page);
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 8, 8); // the backdrop: right of the drawer, above the phone sheet
  await expect(open).toHaveCount(0);
  // a settings group, opened after typing in search
  await (await openSearch(page)).fill('x');
  await page.keyboard.press('Escape');
  await openSettings(page, 'Reading settings');
  await page.keyboard.press('Escape');
  await expect(open).toHaveCount(0);
});

test('no text spills out of the page, in either view, order or language', async ({ page }) => {
  test.skip(isPhone(page), 'widths are set explicitly on desktop');
  test.setTimeout(240_000);
  const layers = { translit: true, gloss: true, strong: true, morph: true, esv: false, notes: true };
  const cases = [
    { width: 320, ui: 'en' }, { width: 320, ui: 'ta' }, { width: 412, ui: 'en' }, { width: 768, ui: 'ta' }, { width: 1360, ui: 'en' }
  ];
  for (const { width, ui } of cases) {
    await page.setViewportSize({ width, height: 820 });
    for (const order of ['target', 'source']) {
      await page.goto('/');
      await page.evaluate((p) => localStorage.setItem('ib-prefs', JSON.stringify(p)), { ui, order, layers });
      for (const url of ['/#/', '/#/read/ta-irv/PHM/APPEAL', '/#/study/ta-irv/PHM/APPEAL', '/#/read/ta-irv/1JN/c1', '/#/settings']) {
        await page.goto(url);
        await page.reload();
        if (url.includes('/read/') || url.includes('/study/')) await expect(page.locator('.stack').first()).toBeVisible();
        else await page.waitForLoadState('networkidle');
        const r = await page.evaluate(() => {
          const doc = document.documentElement;
          const spill = [...document.querySelectorAll('.stack')].filter((s) => {
            const w = s.closest('.words')!.getBoundingClientRect();
            const b = s.getBoundingClientRect();
            return b.right > w.right + 1 || b.left < w.left - 1;
          }).length;
          return { scroll: doc.scrollWidth - doc.clientWidth, spill };
        });
        expect(r, `${url} at ${width}px, ${ui}, ${order} order`).toEqual({ scroll: 0, spill: 0 });
      }
    }
  }
});

test('the section map stays under the app bar and follows the reading', async ({ page }) => {
  await page.goto('/#/read/ta-irv/PHM/APPEAL');
  await expect(page.locator('.stack').first()).toBeVisible();
  const map = page.locator('.secnav');
  const here = map.locator('.chip-sec.here');
  await expect(here.first()).toHaveAttribute('aria-current', 'location');
  // read to the end: the map is still in view and the last section is the current one
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  const box = (await map.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeLessThan(80);
  await expect(here.last()).toHaveAttribute('aria-current', 'location');
  // another passage is one tap away; chapters are named in the Bible's language
  await page.goto('/#/read/ta-irv/1JN/c2');
  await expect(page.getByRole('heading', { level: 1, name: 'அத்தியாயம் 2' })).toBeVisible();
  await map.getByRole('button', { name: /அத்தியாயம் 3/ }).click();
  await expect(page).toHaveURL(/1JN\/c3/);
});

test('the colour theme is chosen in App settings and remembered', async ({ page }) => {
  await page.goto('/');
  await openSettings(page, 'App settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Sepia' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ib-prefs') ?? '{}').theme)).toBe('sepia');
});

test('home search opens a book or goes straight to a reference', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('Philemon');
  await page.locator('.bookhit').first().click();
  await expect(page).toHaveURL(/#\/read\/ta-irv\/PHM/);
  await page.goto('/');
  await page.getByRole('searchbox').fill('phm 1:10');
  await page.locator('.bookhit').first().click();
  await expect(page).toHaveURL(/PHM\/APPEAL/);
  await expect(page.locator('[id="v1:10"]')).toBeInViewport();
});

/** A translationCore-style aligned file for 3 John 1:1 (an unpublished book), from the bundled UGNT list. */
function uwUsfm3JN(): string {
  const lib = JSON.parse(readFileSync(join(ROOT, 'content/library/grc-ugnt/3JN.json'), 'utf8')) as { v: Record<string, [number, string, string, string, string, string][]> };
  return [
    '\\id 3JN test', '\\h 3 யோவான்', '\\c 1',
    '\\v 1 ' + lib.v['1:1'].map(([, w, , , st], k) =>
      `\\zaln-s |x-strong="${st}0" x-morph="Gr,N,,,,,NMS," x-occurrence="1" x-occurrences="1" x-content="${w}"\\*\\w சொல்${k + 1}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`
    ).join(' ')
  ].join('\n');
}

test('import needs only the aligned USFM, even for a book that is not published', async ({ page }) => {
  test.skip(isPhone(page), 'file picking is covered on desktop');
  const usfm = uwUsfm3JN();
  await page.goto('/#/import');
  await page.locator('input[type=file]').setInputFiles({ name: '3jn-aligned.usfm', mimeType: 'text/plain', buffer: Buffer.from(usfm) });
  await page.getByRole('button', { name: 'Check files' }).click();
  const cards = page.locator('.result.card');
  await expect(cards).toHaveCount(2, { timeout: 20000 });
  await expect(cards.filter({ hasText: 'ta-irv · UGNT' })).toContainText('as aligned');
  await expect(cards.filter({ hasText: 'ta-irv · Textus Receptus 1894' })).toContainText('remapped from UGNT');
  await expect(page.getByText('Missing files')).toHaveCount(0);
});

test('a maintainer publishes an imported book as a GitHub pull request', async ({ page }) => {
  test.skip(isPhone(page), 'file picking is covered on desktop');
  // GitHub API, mocked: record what the app sends
  const sent: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  const oldMap = JSON.stringify({ overrides: { '1:1#2': null } });
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : null;
    sent.push({ method: req.method(), path, body });
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/repos/selvabenz/interlinear-bible') return json(200, { default_branch: 'main', permissions: { push: true } });
    if (path === '/user') return json(200, { login: 'maintainer' });
    if (path.endsWith('/git/ref/heads/main')) return json(200, { object: { sha: 'base' } });
    if (path.endsWith('/git/commits/base')) return json(200, { tree: { sha: 'basetree' } });
    if (path.includes('/contents/content/maps/')) return json(200, { content: Buffer.from(oldMap).toString('base64'), encoding: 'base64' });
    if (path.includes('/contents/')) return json(404, { message: 'Not Found' });
    if (path.endsWith('/git/blobs')) return json(201, { sha: `blob${sent.length}` });
    if (path.endsWith('/git/trees')) return json(201, { sha: 'tree1' });
    if (path.endsWith('/git/commits')) return json(201, { sha: 'commit1' });
    if (path.endsWith('/git/refs')) return json(201, {});
    if (path.endsWith('/pulls')) return json(201, { html_url: 'https://github.com/selvabenz/interlinear-bible/pull/99', number: 99 });
    return json(404, { message: 'unexpected' });
  });

  await page.goto('/#/settings');
  await page.getByTestId('publish-settings').locator('input[type=password]').fill('github_pat_test');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('publish-settings')).toContainText('OK — maintainer can write to selvabenz/interlinear-bible');

  await page.goto('/#/import');
  await page.locator('input[type=file]').setInputFiles({ name: '3jn-aligned.usfm', mimeType: 'text/plain', buffer: Buffer.from(uwUsfm3JN()) });
  await page.getByRole('button', { name: 'Check files' }).click();
  await page.getByRole('button', { name: 'Publish (pull request)' }).click();
  await expect(page.getByTestId('pr-link')).toHaveAttribute('href', 'https://github.com/selvabenz/interlinear-bible/pull/99');

  const tree = sent.find((s) => s.path.endsWith('/git/trees'))!.body as { base_tree: string; tree: { path: string }[] };
  expect(tree.base_tree).toBe('basetree');
  expect(tree.tree.map((t) => t.path).sort()).toEqual(['content/maps/grc-ugnt__grc-tr/3JN.json', 'content/translations/ta-irv/3JN.aligned.usfm']);
  // the repository's hand overrides survive in the published map
  const blobs = sent.filter((s) => s.path.endsWith('/git/blobs')).map((s) => Buffer.from(String(s.body!.content), 'base64').toString('utf8'));
  expect(blobs.find((b) => b.includes('"auto"'))).toContain('"1:1#2": null');
  const pr = sent.find((s) => s.path.endsWith('/pulls'))!.body!;
  expect(pr).toMatchObject({ base: 'main', title: 'content(3JN): 3 John (ta-irv)' });
  expect(String(pr.head)).toMatch(/^content\/ta-irv-3jn-/);
  expect(sent.every((s) => !s.path.includes('/contents/') || s.method === 'GET')).toBe(true);
});
