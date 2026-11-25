import { mount } from 'svelte';
import '@fontsource/noto-serif-tamil/400.css';
import '@fontsource/noto-serif-tamil/500.css';
import '@fontsource/gentium-book-plus/400.css';
import '@fontsource/gentium-book-plus/400-italic.css';
import '@fontsource/gentium-book-plus/700.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/noto-serif-hebrew/hebrew-400.css';
import './app.css';
import App from './App.svelte';

// #app holds static text and book links for search engines (see index.html, scripts/build-seo.ts)
const target = document.getElementById('app')!;
target.replaceChildren();
const app = mount(App, { target });

export default app;
