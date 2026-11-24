/**
 * npm run icons — render public/favicon.svg into the PNG icons the web manifest needs.
 * Uses Playwright's Chromium (npx playwright install chromium).
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8');
const out = join(ROOT, 'public', 'icons');
mkdirSync(out, { recursive: true });

// maskable icons need the artwork inside the central 80% safe zone, on a full-bleed background
const targets: { file: string; size: number; maskable?: boolean }[] = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true }
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = t.maskable ? Math.round(t.size * 0.78) : t.size;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;width:${t.size}px;height:${t.size}px;display:flex;align-items:center;justify-content:center;background:${t.maskable ? '#2c6f6b' : 'transparent'}">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`
  );
  await page.screenshot({ path: join(out, t.file), omitBackground: !t.maskable });
  console.log('wrote', t.file);
}
await browser.close();
