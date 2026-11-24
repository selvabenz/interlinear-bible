import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
