import { useSyncExternalStore } from 'react';
import { TEAM_META } from '../data/teamMeta';
import { CURRENT_SEASON } from '../data/leagueConstants';

// ---------------------------------------------------------------------------
// Offseason transactions log. Parses a pasted signings table (SalarySwish-style,
// with Player / Team / Method / Date columns) and records which teams have
// SPENT an exception this offseason — the MLE, taxpayer MLE, room exception, or
// bi-annual. Bird/Non-Bird re-signings, minimums, two-ways and Exhibit 10s are
// not tracked (they don't consume a quiver arrow). Only signings on/after
// June 1 of the current season count.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'apronRoom.usedExceptions.v2';
const CUTOFF = new Date(`${CURRENT_SEASON}-06-01T00:00:00`);
const VALID_ABBRS = new Set(TEAM_META.map((t) => t.abbreviation));

export interface UsedException {
  family: 'mle' | 'bae';
  method: string; // as reported, e.g. "Taxpayer-MLE"
  player: string;
}

type UsedMap = Record<string, UsedException[]>;

function load(): UsedMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

let usedMap: UsedMap = load();
const listeners = new Set<() => void>();

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usedMap));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function classify(method: string): 'mle' | 'bae' | null {
  const m = method.toLowerCase();
  if (/bi.?annual|\bbae\b/.test(m)) return 'bae';
  if (/\bmle\b/.test(m)) return 'mle'; // MLE, Taxpayer-MLE, Room-MLE
  return null;
}

function teamAbbr(cell: string): string | null {
  const m = cell.match(/([A-Z]{2,4})\s*$/);
  if (!m) return null;
  const abbr = m[1].slice(-3);
  return VALID_ABBRS.has(abbr) ? abbr : null;
}

function cleanName(cell: string): string {
  return cell.replace(/unconfirmed information/i, '').trim();
}

/** Parse a pasted transactions table into the used-exception map. */
export function setSignings(rawText: string): { tracked: number; teams: number } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim());

  const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : /\s{2,}/;
  const split = (l: string) =>
    (typeof delimiter === 'string' ? l.split(delimiter) : l.split(delimiter)).map((f) => f.trim());

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = split(lines[i]).map((x) => x.toLowerCase());
    if (f.includes('player') && f.includes('method')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    usedMap = {};
    commit();
    return { tracked: 0, teams: 0 };
  }

  const header = split(lines[headerIdx]).map((x) => x.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iPlayer = col('player');
  const iTeam = col('team');
  const iMethod = col('method');
  const iDate = col('date');

  const map: UsedMap = {};
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = split(lines[i]);
    const abbr = teamAbbr(f[iTeam] || '');
    const family = classify(f[iMethod] || '');
    if (!abbr || !family) continue;

    if (iDate >= 0 && f[iDate]) {
      const d = new Date(f[iDate]);
      if (!Number.isNaN(d.getTime()) && d < CUTOFF) continue;
    }

    (map[abbr] ||= []).push({
      family,
      method: (f[iMethod] || '').trim(),
      player: cleanName(f[iPlayer] || ''),
    });
  }

  usedMap = map;
  commit();
  const tracked = Object.values(map).reduce((n, arr) => n + arr.length, 0);
  return { tracked, teams: Object.keys(map).length };
}

export function clearSignings(): void {
  usedMap = {};
  commit();
}

export function usedExceptionsFor(abbr: string): UsedException[] {
  return usedMap[abbr] || [];
}

export function signingsCount(): number {
  return Object.values(usedMap).reduce((n, arr) => n + arr.length, 0);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSignings(): UsedMap {
  return useSyncExternalStore(subscribe, () => usedMap, () => usedMap);
}
