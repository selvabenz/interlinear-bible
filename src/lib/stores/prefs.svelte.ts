import type { UiLang } from '../i18n/labels';
import type { Order } from '../data/model';

export interface Layers {
  translit: boolean;
  gloss: boolean;
  strong: boolean;
  morph: boolean;
  esv: boolean;
  notes: boolean;
}

export interface Prefs {
  ui: UiLang;
  layers: Layers;
  order: Order;
  taSize: number;     // translation word size, px (design: 14–22, default 16)
  srcSize: number;    // source word size, px (design: 12–20, default 15.5)
  esvKey: string;
  railOpen: boolean;
  showAllBooks: boolean;
  translation: string;
  /** preferred source text per testament (e.g. { NT: 'grc-ugnt' }); unset = the catalog default */
  sources: { NT?: string; OT?: string };
  /** maintainers: GitHub repository and fine-grained token used to publish imported books */
  githubRepo: string;
  githubToken: string;
}

const KEY = 'ib-prefs';
const DEFAULTS: Prefs = {
  ui: 'en',
  layers: { translit: true, gloss: true, strong: true, morph: true, esv: false, notes: true },
  order: 'target',
  taSize: 16,
  srcSize: 15.5,
  esvKey: '',
  railOpen: false,
  showAllBooks: false,
  translation: '',
  sources: {},
  githubRepo: 'selvabenz/interlinear-bible',
  githubToken: ''
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULTS, ...p, layers: { ...DEFAULTS.layers, ...(p.layers ?? {}) }, sources: { ...(p.sources ?? {}) } };
    }
  } catch {
    /* private mode or corrupt value: use defaults */
  }
  return structuredClone(DEFAULTS);
}

export const prefs = $state<Prefs>(load());

export function savePrefs(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

export function resetPrefs(): void {
  const { esvKey, githubRepo, githubToken } = prefs;
  Object.assign(prefs, structuredClone(DEFAULTS), { esvKey, githubRepo, githubToken });
}
