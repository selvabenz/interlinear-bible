import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// GitHub Pages serves the site from /<repo>/; CI sets BASE_PATH=/interlinear-bible/.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'robots.txt'],
      manifest: {
        id: base,
        name: 'Interlinear Bible — IRV Tamil',
        short_name: 'Interlinear',
        description:
          'Interlinear and reverse-interlinear Bible: IRV Tamil aligned word by word to the Greek and Hebrew, with Strong’s numbers, morphology and semantic study marks.',
        lang: 'ta',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f3ec',
        theme_color: '#2c6f6b',
        categories: ['books', 'education', 'reference'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // The app shell (JS, CSS, fonts, icons) is precached. Bible data is cached at runtime
        // so a newly published book shows up without a new app release.
        // Only the font subsets the app needs (Latin, Greek, Tamil) are precached;
        // the fonts' other subsets (Cyrillic, Vietnamese …) are fetched only if ever used.
        globPatterns: [
          '**/*.{js,css,html,svg,png,webmanifest}',
          '**/*-{latin,latin-ext,greek,greek-ext,tamil}-*.woff2'
        ],
        globIgnores: ['data/**'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/catalog.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'ib-catalog', networkTimeoutSeconds: 4 }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'ib-data', expiration: { maxEntries: 5000 } }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  worker: { format: 'es' }
});
