import { useSyncExternalStore } from 'react';
import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { projectedMinutes } from './rookies';

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

// Nobody's seed exceeds this — a realistic minutes-leader ceiling. DARKO's own
// projections top out around 39, so this only trims the very highest.
const SEED_MAX_MIN = 38;

/**
 * Seed each team's 240 game-minutes from DARKO's projected per-player minutes
 * (x_minutes). DARKO's projection already reflects what teams actually do —
 * including developing young players: it projects a negative-DPM lottery rookie
 * like Ace Bailey ~33 minutes because Utah plays him. So we allocate by PROJECTED
 * MINUTES, not by value; ordering by DPM would bury exactly those young assets.
 *
 * Reconciling to 240 (a full roster's projections rarely sum to exactly 240):
 *  • Over-subscribed (deep team, sum > 240): scale everyone down proportionally,
 *    so each keeps their share of the minutes DARKO gives them — no hard cutoff
 *    that zeroes the 8th man, no value-based benching of developing players.
 *  • Under-subscribed (thin team, sum < 240): keep each player's projection and
 *    spread the surplus to the bench/mid-rotation, sparing the stars, rather than
 *    inflating anyone past their real role.
 * Each player is capped at a realistic 38-minute ceiling either way.
 */
export function seedMinutes(players: Player[]): Record<string, number> {
  const info = players.map((p) => ({
    id: p.id,
    // DARKO where available, else the rookie model; capped at the 38 ceiling.
    proj: Math.min(Math.round(projectedMinutes(p)), SEED_MAX_MIN),
  }));
  const out: Record<string, number> = {};
  for (const x of info) out[x.id] = 0;
  const total = info.reduce((s, x) => s + x.proj, 0);
  if (total <= 0) return out;

  // Over-subscribed: scale proportionally to 240. Restrict to the real rotation
  // (projected >= 8) so deep-bench end-of-roster minutes don't dilute the pool
  // and over-compress the starters — those players realistically DNP. Falls back
  // to the whole roster if the rotation alone can't cover 240.
  if (total >= TOTAL_ROTATION_MINUTES) {
    let pool = info.filter((x) => x.proj >= 8);
    if (pool.reduce((s, x) => s + x.proj, 0) < TOTAL_ROTATION_MINUTES) pool = info;
    const poolTotal = pool.reduce((s, x) => s + x.proj, 0);
    const scale = TOTAL_ROTATION_MINUTES / poolTotal;
    const fracs: { id: string; frac: number }[] = [];
    let floored = 0;
    for (const x of pool) {
      const exact = x.proj * scale;
      const f = Math.floor(exact);
      out[x.id] = f;
      floored += f;
      fracs.push({ id: x.id, frac: exact - f });
    }
    let rem = TOTAL_ROTATION_MINUTES - floored;
    fracs.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < fracs.length && rem > 0; i++, rem--) out[fracs[i].id]++;
    return out;
  }

  // Under-subscribed: everyone gets their projection; spread the surplus to the
  // bench/mid-rotation (least-used regulars first), sparing the stars. Cap each
  // recipient a little above their own projection; deep bench (< 8) is left alone.
  for (const x of info) out[x.id] = x.proj;
  let remaining = TOTAL_ROTATION_MINUTES - total;
  let guard = 0;
  while (remaining > 0 && guard++ < 5000) {
    let best: string | null = null;
    let bestMin = Infinity;
    for (const x of info) {
      if (x.proj < 8) continue;
      const fillCap = Math.min(SEED_MAX_MIN, Math.round(x.proj) + 6);
      if (out[x.id] >= fillCap) continue;
      if (out[x.id] < bestMin) {
        bestMin = out[x.id];
        best = x.id;
      }
    }
    if (best == null) {
      // Everyone at their fill cap: relax and spread the rest over the rotation.
      let progressed = false;
      for (const x of info) {
        if (remaining <= 0) break;
        if (x.proj > 0 && out[x.id] < SEED_MAX_MIN) {
          out[x.id]++;
          remaining--;
          progressed = true;
        }
      }
      if (!progressed) break;
      continue;
    }
    out[best]++;
    remaining--;
  }
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

/** Set a whole team's allocation at once (one commit) — used by Optimize Rotation. */
export function setTeamMinutes(abbr: string, minutes: Record<string, number>): void {
  const next: TeamMinutes = {};
  for (const [id, min] of Object.entries(minutes)) {
    next[id] = Math.max(0, Math.min(48, Math.round(Number.isFinite(min) ? min : 0)));
  }
  data = { ...data, [abbr]: next };
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

/** Drop every team's manual minute edits (back to the DARKO-scaled seed). */
export function resetAllMinutes(): void {
  if (Object.keys(data).length === 0) return;
  data = {};
  commit();
}

export function hasMinuteOverrides(abbr: string): boolean {
  return Boolean(data[abbr] && Object.keys(data[abbr]).length);
}

/** Whether any team has manual minute edits. */
export function hasAnyMinuteOverrides(): boolean {
  return Object.keys(data).length > 0;
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
