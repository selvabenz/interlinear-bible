/**
 * Reviewer flags on verses, kept on this device. Key: "<translation>/<BOOK> c:v".
 */
export interface Flag {
  note: string;
  reason: string;
  at: string;
}

const KEY = 'ib-flags';

function load(): Record<string, Flag> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const flags = $state<Record<string, Flag>>(load());

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {
    /* storage unavailable */
  }
}

export const flagKey = (translation: string, book: string, ref: string) => `${translation}/${book} ${ref}`;

export function setFlag(key: string, note: string, reason: string): void {
  if (note.trim()) flags[key] = { note: note.trim(), reason, at: new Date().toISOString() };
  else delete flags[key];
  persist();
}

export function clearFlag(key: string): void {
  delete flags[key];
  persist();
}

export function exportFlags(): string {
  return JSON.stringify({ kind: 'interlinear-bible-flags', version: 1, exportedAt: new Date().toISOString(), flags }, null, 1);
}

/** Merge flags from an export; returns how many were added or updated. */
export function importFlags(text: string): number {
  const j = JSON.parse(text);
  const incoming: Record<string, Flag> = j && j.flags ? j.flags : j;
  let n = 0;
  for (const [k, f] of Object.entries(incoming)) {
    if (!f || typeof f.note !== 'string') continue;
    flags[k] = { note: f.note, reason: f.reason ?? 'other', at: f.at ?? new Date().toISOString() };
    n++;
  }
  persist();
  return n;
}

export function clearAllFlags(): void {
  for (const k of Object.keys(flags)) delete flags[k];
  persist();
}
