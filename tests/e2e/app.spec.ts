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

test('import needs only the aligned USFM, even for a book that is not published', async ({ page }) => {
  test.skip(isPhone(page), 'file picking is covered on desktop');
  // a translationCore-style file for 3 John 1:1, made from the bundled UGNT word list
  const lib = JSON.parse(readFileSync(join(ROOT, 'content/library/grc-ugnt/3JN.json'), 'utf8')) as { v: Record<string, [number, string, string, string, string, string][]> };
  const words = lib.v['1:1'];
  const usfm = [
    '\\id 3JN test', '\\h 3 யோவான்', '\\c 1',
    '\\v 1 ' + words.map(([, w, , , st], k) =>
      `\\zaln-s |x-strong="${st}0" x-morph="Gr,N,,,,,NMS," x-occurrence="1" x-occurrences="1" x-content="${w}"\\*\\w சொல்${k + 1}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`
    ).join(' ')
  ].join('\n');
  await page.goto('/#/import');
  await page.locator('input[type=file]').setInputFiles({ name: '3jn-aligned.usfm', mimeType: 'text/plain', buffer: Buffer.from(usfm) });
  await page.getByRole('button', { name: 'Check files' }).click();
  const cards = page.locator('.result.card');
  await expect(cards).toHaveCount(2, { timeout: 20000 });
  await expect(cards.filter({ hasText: 'ta-irv · UGNT' })).toContainText('as aligned');
  await expect(cards.filter({ hasText: 'ta-irv · Textus Receptus 1894' })).toContainText('remapped from UGNT');
  await expect(page.getByText('Missing files')).toHaveCount(0);
});
