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
interface Override {
  players: Player[];
  updatedAt: string; // ISO timestamp of the import
}
type Overrides = Record<string, Override>;

function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Player[] | Override>;
    const out: Overrides = {};
    for (const [abbr, value] of Object.entries(parsed)) {
      // Migrate the earlier shape (a bare Player[]).
      out[abbr] = Array.isArray(value)
        ? { players: value, updatedAt: '' }
        : value;
    }
    return out;
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
      ? { ...t, players: overrides[t.abbreviation].players }
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
  overrides = { ...overrides, [abbr]: { players, updatedAt: new Date().toISOString() } };
  commit();
}

export interface RosterStatus {
  imported: boolean;
  updatedAt: string | null;
}

/** Whether a team is on imported data, and when it was imported. */
export function getRosterStatus(abbr: string): RosterStatus {
  const o = overrides[abbr];
  return { imported: Boolean(o), updatedAt: o?.updatedAt || null };
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

// ---------------------------------------------------------------------------
// Currently-selected team, shared across tabs. Picking a team in Team Explorer
// carries over as the default team in the Trade Machine and Signings. Persisted
// so the choice survives reloads.
// ---------------------------------------------------------------------------

const SELECTED_KEY = 'apronRoom.selectedTeam.v1';
const selectedListeners = new Set<() => void>();

function loadSelected(): string {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    if (raw && BASE_TEAMS.some((t) => t.abbreviation === raw)) return raw;
  } catch {
    /* ignore */
  }
  return BASE_TEAMS[0].abbreviation;
}

let selectedTeam = loadSelected();

export function getSelectedTeam(): string {
  return selectedTeam;
}

export function setSelectedTeam(abbr: string): void {
  if (abbr === selectedTeam) return;
  selectedTeam = abbr;
  try {
    localStorage.setItem(SELECTED_KEY, abbr);
  } catch {
    /* ignore */
  }
  selectedListeners.forEach((l) => l());
}

function subscribeSelected(fn: () => void): () => void {
  selectedListeners.add(fn);
  return () => {
    selectedListeners.delete(fn);
  };
}

/** React hook: the currently-selected team abbreviation, shared across tabs. */
export function useSelectedTeam(): string {
  return useSyncExternalStore(subscribeSelected, getSelectedTeam, getSelectedTeam);
}
