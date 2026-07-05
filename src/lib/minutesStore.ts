import { useSyncExternalStore } from 'react';
import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Rotation-minutes store.
//
// A game has 240 player-minutes to hand out (five on-court slots × 48). We seed
// each team's allocation from DARKO's projected minutes, scaled so the roster
// totals 240, and let the user hand-adjust from there. The allocation feeds
// team value everywhere (Team Explorer talent/rank, Trade Machine & Signings
// win-now impact), so tweaking who plays changes the numbers. Overrides persist
// in localStorage. This applies to the CURRENT season only.
// ---------------------------------------------------------------------------

export const TOTAL_ROTATION_MINUTES = 240;
const STORAGE_KEY = 'apronRoom.minutes.v1';

type TeamMinutes = Record<string, number>; // playerId -> minutes
type Store = Record<string, TeamMinutes>; // teamAbbr -> per-player overrides

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

let data: Store = load();
let version = 0;
const listeners = new Set<() => void>();

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private-mode errors */
  }
  version++;
  listeners.forEach((l) => l());
}

/** Players who share a team's 240 minutes: on the books this season, not two-way. */
export function rotationPlayers(players: Player[]): Player[] {
  return players.filter((p) => {
    if (p.twoWay) return false;
    const cy = p.contract.find((c) => c.season === CURRENT_SEASON);
    return !!cy && cy.option !== 'ufa' && cy.option !== 'rfa' && cy.salary > 0;
  });
}

/**
 * DARKO minutes for the given players, scaled so they total 240 (the seed).
 * Rounded to whole minutes via largest-remainder so the integers still sum to
 * exactly 240 (easier to read/adjust, especially on mobile).
 */
export function seedMinutes(players: Player[]): Record<string, number> {
  const raw = players.map((p) => ({ id: p.id, min: darkoFor(p.name)?.min ?? 0 }));
  const sum = raw.reduce((s, r) => s + r.min, 0);
  const out: Record<string, number> = {};
  if (sum <= 0) {
    for (const r of raw) out[r.id] = 0;
    return out;
  }
  const scale = TOTAL_ROTATION_MINUTES / sum;
  const fracs: { id: string; frac: number }[] = [];
  let floored = 0;
  for (const r of raw) {
    const exact = r.min * scale;
    const f = Math.floor(exact);
    out[r.id] = f;
    floored += f;
    fracs.push({ id: r.id, frac: exact - f });
  }
  // Hand out the leftover minutes to the largest fractional parts.
  let rem = TOTAL_ROTATION_MINUTES - floored;
  fracs.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < fracs.length && rem > 0; i++, rem--) out[fracs[i].id]++;
  return out;
}

/**
 * Effective minutes for each player: the user's manual value where set, else the
 * DARKO-scaled seed. Total can drift from 240 as the user edits (that's what the
 * "remaining to allocate" readout is for).
 */
export function allocation(abbr: string, players: Player[]): Record<string, number> {
  const seed = seedMinutes(players);
  const stored = data[abbr] || {};
  const out: Record<string, number> = {};
  for (const p of players) out[p.id] = stored[p.id] ?? seed[p.id] ?? 0;
  return out;
}

export function setMinutes(abbr: string, playerId: string, min: number): void {
  const clamped = Math.max(0, Math.min(48, Math.round(Number.isFinite(min) ? min : 0)));
  data = { ...data, [abbr]: { ...(data[abbr] || {}), [playerId]: clamped } };
  commit();
}

/** Drop all manual edits for a team (back to the DARKO-scaled seed). */
export function resetTeamMinutes(abbr: string): void {
  if (!data[abbr]) return;
  const next = { ...data };
  delete next[abbr];
  data = next;
  commit();
}

export function hasMinuteOverrides(abbr: string): boolean {
  return Boolean(data[abbr] && Object.keys(data[abbr]).length);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Monotonic version, bumped on every edit — for memoization + live re-renders. */
export function minutesVersion(): number {
  return version;
}

/** React hook: re-render when any minutes override changes. */
export function useMinutesVersion(): number {
  return useSyncExternalStore(subscribe, minutesVersion, minutesVersion);
}
