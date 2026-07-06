import { useSyncExternalStore } from 'react';
import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { darkoFor } from './darko';
import { positionGroup, type PosGroup } from './position';

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
 * Within a position we hand out minutes by VALUE (DARKO DPM), not by DARKO's
 * projected minutes: when a rotation is over-subscribed, the better players
 * should play. DARKO sometimes projects a replacement-level guard heavy minutes
 * (it had Ja'Kobe Walter at 36) ahead of a clearly better one (Quickley at 30) —
 * ranking by minutes would bench Quickley at 0. Each player is still capped at
 * their own projected minutes, so nobody gets inflated past their real role.
 *
 * The center spot also gets crowded out on guard-heavy teams, so we RESERVE the
 * centers first, then fill the rest of the 240 with the guards and forwards.
 *
 * We deliberately do NOT scale everyone to hit 240: summing a full roster's
 * projections overshoots for deep teams (squishing the stars) and falls short
 * for thin ones (inflating them). Stars land at their real projected minutes.
 */
const CENTER_CEILING = 56; // most center minutes a team will reserve up front

export function seedMinutes(players: Player[]): Record<string, number> {
  const info = players.map((p) => {
    const d = darkoFor(p.name);
    return {
      id: p.id,
      proj: d?.min ?? 0,
      dpm: d?.dpm ?? -2, // no DARKO ≈ replacement level
      grp: (positionGroup(p.position, d?.posNum, d?.pos) ?? 'F') as PosGroup,
    };
  });
  const out: Record<string, number> = {};
  for (const x of info) out[x.id] = 0;
  if (info.reduce((s, x) => s + x.proj, 0) <= 0) return out;

  // Fill a pool's budget by DPM (best players first), each capped at their own
  // projected minutes (and the 38 ceiling) so nobody is inflated past their role.
  const fill = (pool: typeof info, budget: number) => {
    let rem = budget;
    for (const x of [...pool].sort((a, b) => b.dpm - a.dpm)) {
      const give = Math.max(0, Math.min(Math.round(x.proj), SEED_MAX_MIN, rem));
      out[x.id] = give;
      rem -= give;
    }
  };

  // Reserve the centers first (by value), then fill the rest with guards/forwards.
  fill(info.filter((x) => x.grp === 'C'), CENTER_CEILING);
  const centerMinutes = info.filter((x) => x.grp === 'C').reduce((s, x) => s + out[x.id], 0);
  fill(info.filter((x) => x.grp !== 'C'), TOTAL_ROTATION_MINUTES - centerMinutes);

  // Hand out whatever's left (a thin rotation that couldn't fill 240) across the
  // rotation — least-used regulars first, so we deepen the rotation / go
  // small-ball rather than inflate a star. Cap each recipient a little above
  // their own projection; deep bench (projected < 8) is left alone.
  let remaining = TOTAL_ROTATION_MINUTES - info.reduce((s, x) => s + out[x.id], 0);
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
