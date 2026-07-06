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

// Nobody's seed exceeds this — a realistic minutes-leader ceiling. DARKO's own
// projections top out around 39, so this only trims the very highest.
const SEED_MAX_MIN = 38;

/**
 * Seed each team's 240 game-minutes from DARKO's projected per-player minutes
 * (x_minutes), which already encode role and load management.
 *
 * We do NOT scale everyone to hit 240 — summing a full roster's projections
 * overshoots 240 for deep teams (squishing the stars) and falls short for thin
 * ones (inflating them). Instead we allocate from the highest-projected players
 * down, giving each their DARKO minutes (capped), until the 240 are used up.
 * That yields a realistic ~9–10 man rotation with stars at their real projected
 * minutes; anyone past the cutoff seeds to 0 (bench). If a team's projections
 * fall short of 240, the surplus is spread across the rotation (still capped),
 * never inflating a single player past the ceiling.
 */
export function seedMinutes(players: Player[]): Record<string, number> {
  const raw = players.map((p) => ({ id: p.id, min: darkoFor(p.name)?.min ?? 0 }));
  const out: Record<string, number> = {};
  for (const r of raw) out[r.id] = 0;
  if (raw.reduce((s, r) => s + r.min, 0) <= 0) return out;

  // Allocate top-down by projected minutes until the 240 run out.
  const sorted = [...raw].sort((a, b) => b.min - a.min);
  let remaining = TOTAL_ROTATION_MINUTES;
  for (const r of sorted) {
    const give = Math.max(0, Math.min(Math.round(r.min), SEED_MAX_MIN, remaining));
    out[r.id] = give;
    remaining -= give;
  }

  // Thin projections (rotation sums < 240): fill the surplus into the rotation
  // from the least-used player upward, sparing the top minutes — so the stars
  // stay at their DARKO projection and the extra goes to the bench/mid-rotation.
  // Each recipient is capped a little above their own projection so nobody
  // balloons. Deep bench (projected < 8) is left alone.
  const proj = new Map(raw.map((r) => [r.id, Math.round(r.min)]));
  let guard = 0;
  while (remaining > 0 && guard++ < 5000) {
    let best: string | null = null;
    let bestMin = Infinity;
    for (const r of sorted) {
      const pj = proj.get(r.id) ?? 0;
      if (pj < 8) continue; // skip deep bench
      const fillCap = Math.min(SEED_MAX_MIN, pj + 6); // limit inflation over projection
      if (out[r.id] >= fillCap) continue;
      if (out[r.id] < bestMin) {
        bestMin = out[r.id];
        best = r.id;
      }
    }
    if (best == null) {
      // Everyone at their fill cap: relax and spread the rest over the rotation.
      let progressed = false;
      for (const r of sorted) {
        if (remaining <= 0) break;
        if (r.min > 0 && out[r.id] < SEED_MAX_MIN) {
          out[r.id]++;
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
