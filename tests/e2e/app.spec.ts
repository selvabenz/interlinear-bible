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

  // layers
  await expect(word).toContainText('Christou');
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Transliteration' }).click();
  await expect(word).not.toContainText('Christou');

  // interlinear (source) order: the first stack is the first Greek word
  await page.getByRole('button', { name: 'Greek order' }).click();
  const firstSrc = page.locator('[data-key="s:1:1#1"]');
  await expect(firstSrc).toContainText('Παῦλος');
  await expect(firstSrc).toContainText('பவுலும்');
  await page.getByRole('button', { name: 'Tamil order' }).click();

  // Tamil interface
  await page.getByRole('button', { name: 'தமிழ்', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'வாழ்த்துரை' })).toBeVisible();
});

test('study view: rail, study marks, side or inline panel', async ({ page }) => {
  await page.goto('/#/study/ta-irv/PHM/THANKSGIVING');
  await page.getByRole('button', { name: 'Study tools' }).click();
  await expect(page.locator('.rail')).toContainText('Passage map');
  await expect(page.locator('.maprow').first()).toContainText('swapped');
  const mark = page.locator('.finding').first();
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
  await page.getByRole('searchbox').fill('Onesimus');
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
  await page.goto('/#/read/ta-irv/1JN/c5');
  const sw = page.getByTestId('source-switch');
  await expect(sw.getByRole('button', { name: 'Textus Receptus 1894' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.edition-note')).toContainText('remapped automatically from UGNT');

  // the TR has the "three in heaven" words of 5:7; the UGNT does not (Greek word order)
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('ib-prefs') ?? '{}');
    localStorage.setItem('ib-prefs', JSON.stringify({ ...p, order: 'source' }));
  });
  await page.reload();
  const v57 = page.locator('[data-key^="s:5:7#"]');
  await expect(v57.filter({ hasText: 'οὐρανῷ' })).not.toHaveCount(0);

  await sw.getByRole('button', { name: 'UGNT' }).click();
  await expect(page).toHaveURL(/src=grc-ugnt/);
  await expect(page.getByTestId('source-switch').getByRole('button', { name: 'UGNT' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-key^="s:5:7#"]').first()).toBeVisible();
  await expect(page.locator('[data-key^="s:5:7#"]').filter({ hasText: 'οὐρανῷ' })).toHaveCount(0);
  await expect(page.locator('.edition-note')).toHaveCount(0);

  // the choice is remembered for links without ?src=
  await page.goto('/#/read/ta-irv/1JN/c1');
  await expect(page.getByTestId('source-switch').getByRole('button', { name: 'UGNT' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-key="s:1:1#1"]')).toContainText('ὃ');
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
