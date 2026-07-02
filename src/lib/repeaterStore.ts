import { useSyncExternalStore } from 'react';
import { SEEDED_TAX } from '../data/seededTax';

// ---------------------------------------------------------------------------
// Per-team "repeater" flag (taxpayer in three of the last four seasons), which
// triggers steeper luxury-tax rates. Defaults to SalarySwish's authoritative
// repeater designation (seededTax.ts, auto-pulled daily); the user can still
// override any team, and overrides persist in localStorage.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'apronRoom.repeaters.v1';
const seededDefault = (abbr: string): boolean => Boolean(SEEDED_TAX.repeaters[abbr]);

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
  return abbr in flags ? flags[abbr] : seededDefault(abbr);
}

export function toggleRepeater(abbr: string): void {
  flags = { ...flags, [abbr]: !isRepeater(abbr) };
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
