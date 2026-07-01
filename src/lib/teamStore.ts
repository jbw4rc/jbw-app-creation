import { useSyncExternalStore } from 'react';
import type { Player, Team } from '../types';
import { TEAMS as BASE_TEAMS } from '../data/teams';

// ---------------------------------------------------------------------------
// Team store.
//
// Holds the working set of teams: the hand-authored base data, with any
// per-team roster overrides imported by the user (via the CSV importer) layered
// on top. Overrides persist in localStorage so imported data survives reloads,
// and a tiny subscription drives live re-renders across the app.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'apronRoom.teamOverrides.v1';
type Overrides = Record<string, Player[]>;

function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

let overrides: Overrides = loadOverrides();
let cache: Team[] = compute();
const listeners = new Set<() => void>();

function compute(): Team[] {
  return BASE_TEAMS.map((t) =>
    overrides[t.abbreviation]
      ? { ...t, players: overrides[t.abbreviation] }
      : t
  );
}

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota / private-mode errors */
  }
  cache = compute();
  listeners.forEach((l) => l());
}

export function getTeams(): Team[] {
  return cache;
}

export function getTeam(abbr: string): Team {
  const t = cache.find((x) => x.abbreviation === abbr);
  if (!t) throw new Error(`Unknown team ${abbr}`);
  return t;
}

export function setTeamPlayers(abbr: string, players: Player[]): void {
  overrides = { ...overrides, [abbr]: players };
  commit();
}

export function clearTeamOverride(abbr: string): void {
  const next = { ...overrides };
  delete next[abbr];
  overrides = next;
  commit();
}

export function isOverridden(abbr: string): boolean {
  return Boolean(overrides[abbr]);
}

export function overriddenTeams(): string[] {
  return Object.keys(overrides);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook: the current teams, re-rendering when imports change. */
export function useTeams(): Team[] {
  return useSyncExternalStore(subscribe, getTeams, getTeams);
}
