import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Per-team "repeater" flag (taxpayer in three of the last four seasons), which
// triggers steeper luxury-tax rates. It can't be inferred from current salary,
// so it's a manual toggle, persisted in localStorage.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'apronRoom.repeaters.v1';

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

let flags: Record<string, boolean> = load();
const listeners = new Set<() => void>();

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function isRepeater(abbr: string): boolean {
  return Boolean(flags[abbr]);
}

export function toggleRepeater(abbr: string): void {
  flags = { ...flags, [abbr]: !flags[abbr] };
  commit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useRepeater(abbr: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isRepeater(abbr),
    () => isRepeater(abbr)
  );
}
