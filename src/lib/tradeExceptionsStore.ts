import { useSyncExternalStore } from 'react';
import { TEAM_META } from '../data/teamMeta';
import { BUNDLED_ROSTERS } from '../data/leagueConstants';
import { SEEDED_TRADE_EXCEPTIONS } from '../data/seededTradeExceptions';

// ---------------------------------------------------------------------------
// Traded-player exceptions (TPEs) — a tradeable asset. Parses a pasted table
// (Team / Player / Exception / Used / Remaining / Start / End) and stores the
// live exceptions per team. A TPE past its End Date is expired and unusable.
// "Now" is the data's as-of instant.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'apronRoom.tpes.v1';
const NOW = new Date(BUNDLED_ROSTERS.asOf);
const VALID_ABBRS = new Set(TEAM_META.map((t) => t.abbreviation));

export interface TradeException {
  player: string;
  total: number;
  remaining: number;
  start: string;
  end: string;
  expired: boolean;
}

type TpeMap = Record<string, TradeException[]>;

// A stored value (even empty) means the user has imported; null means "never
// imported" → fall back to the baked league-wide default.
function load(): TpeMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

const seedMap = () => parseTradeExceptions(SEEDED_TRADE_EXCEPTIONS);

let tpeMap: TpeMap = load() ?? seedMap();
const listeners = new Set<() => void>();

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tpeMap));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function teamAbbr(cell: string): string | null {
  const m = cell.match(/([A-Z]{2,4})\s*$/);
  if (!m) return null;
  const abbr = m[1].slice(-3);
  return VALID_ABBRS.has(abbr) ? abbr : null;
}

function dollars(cell: string): number {
  const digits = (cell || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** Pure parse of a TPE table into the per-team map. */
function parseTradeExceptions(rawText: string): TpeMap {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim());

  const useTab = lines.some((l) => l.includes('\t'));
  const split = (l: string) => (useTab ? l.split('\t') : l.split(/\s{2,}/)).map((f) => f.trim());

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = split(lines[i]).map((x) => x.toLowerCase());
    if (f.includes('team') && (f.includes('exception') || f.includes('remaining'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return {};

  const header = split(lines[headerIdx]).map((x) => x.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iTeam = idx('team');
  const iPlayer = idx('player');
  const iTotal = idx('exception');
  const iRemaining = idx('remaining');
  const iStart = header.findIndex((h) => h.includes('start'));
  const iEnd = header.findIndex((h) => h.includes('end'));

  const map: TpeMap = {};
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = split(lines[i]);
    const abbr = teamAbbr(f[iTeam] || '');
    if (!abbr) continue;
    const remaining = iRemaining >= 0 ? dollars(f[iRemaining]) : 0;
    const total = iTotal >= 0 ? dollars(f[iTotal]) : remaining;
    if (remaining <= 0 && total <= 0) continue;

    const end = iEnd >= 0 ? (f[iEnd] || '').trim() : '';
    const endDate = end ? new Date(end) : null;
    const expired = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate < NOW);

    (map[abbr] ||= []).push({
      player: (f[iPlayer] || '').trim(),
      total,
      remaining,
      start: iStart >= 0 ? (f[iStart] || '').trim() : '',
      end,
      expired,
    });
  }

  for (const abbr of Object.keys(map)) {
    map[abbr].sort((a, b) => b.remaining - a.remaining);
  }
  return map;
}

/** Parse a pasted TPE table and persist it as the active set. */
export function setTradeExceptions(rawText: string): { count: number; teams: number } {
  tpeMap = parseTradeExceptions(rawText);
  commit();
  return {
    count: tpeCount(),
    teams: Object.keys(tpeMap).length,
  };
}

/** Reset to the baked league-wide default (clears any user import). */
export function clearTradeExceptions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  tpeMap = seedMap();
  listeners.forEach((l) => l());
}

export function tradeExceptionsFor(abbr: string): TradeException[] {
  return tpeMap[abbr] || [];
}

export function tpeCount(): number {
  return Object.values(tpeMap).reduce((n, arr) => n + arr.length, 0);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTradeExceptions(): TpeMap {
  return useSyncExternalStore(subscribe, () => tpeMap, () => tpeMap);
}
