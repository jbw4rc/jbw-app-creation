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

// --- GM session (franchise mode) --------------------------------------------
// A running set of committed trades/signings layered over the real rosters, so
// the user can rebuild a team and watch its contention change. `rosters` holds
// the post-move roster for each touched team; `baseline` snapshots every team's
// roster at session start so we can compare and reset.
export interface SessionMove {
  id: string;
  kind: 'trade' | 'signing';
  summary: string;
  teams: string[];
  at: string; // ISO
}
interface SessionState {
  myTeam: string;
  startedAt: string;
  moves: SessionMove[];
  rosters: Record<string, Player[]>;
  baseline: Record<string, Player[]>;
}
const SESSION_KEY = 'apronRoom.session.v1';

function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionState;
    if (!s || !s.myTeam || !s.baseline) return null;
    return s;
  } catch {
    return null;
  }
}

let overrides: Overrides = loadOverrides();
let session: SessionState | null = loadSession();
let rosterVersion = 0;
let cache: Team[] = compute();
const listeners = new Set<() => void>();

// Effective roster for a team: GM-session roster (if the session has touched it)
// over any CSV-imported override over the base data.
function effectivePlayers(t: Team): Player[] {
  return session?.rosters[t.abbreviation] ?? overrides[t.abbreviation]?.players ?? t.players;
}

function compute(): Team[] {
  return BASE_TEAMS.map((t) => {
    const players = effectivePlayers(t);
    return players === t.players ? t : { ...t, players };
  });
}

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore quota / private-mode errors */
  }
  rosterVersion++;
  cache = compute();
  listeners.forEach((l) => l());
}

/** Bumped whenever the effective rosters change (imports or session moves). */
export function rosterStoreVersion(): number {
  return rosterVersion;
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

// ---------------------------------------------------------------------------
// GM session API. Committing a trade/signing writes the new rosters here, and
// the change flows through `useTeams` to team value, rank, and the Rotation
// Builder automatically.
// ---------------------------------------------------------------------------

export function getSession(): SessionState | null {
  return session;
}

export function sessionActive(): boolean {
  return session != null;
}

/** Start a session for `myTeam`, snapshotting every team's current roster. */
export function startSession(myTeam: string): void {
  const baseline: Record<string, Player[]> = {};
  for (const t of cache) baseline[t.abbreviation] = t.players;
  session = { myTeam, startedAt: new Date().toISOString(), moves: [], rosters: {}, baseline };
  commit();
}

/** Exit the session entirely (rosters revert to real). */
export function endSession(): void {
  session = null;
  commit();
}

/** Keep the session but undo all moves (rosters back to the baseline snapshot). */
export function resetSession(): void {
  if (!session) return;
  session = { ...session, moves: [], rosters: {} };
  commit();
}

/** Change which team the session is "playing as". */
export function setSessionTeam(myTeam: string): void {
  if (!session || session.myTeam === myTeam) return;
  session = { ...session, myTeam };
  commit();
}

/**
 * Apply a committed move: new rosters for the affected teams + a log entry.
 * Auto-starts a session (as `asTeam`) if none is running.
 */
export function commitSessionMove(
  rosterChanges: Record<string, Player[]>,
  move: Omit<SessionMove, 'id' | 'at'>,
  asTeam?: string
): void {
  if (!session) startSession(asTeam ?? move.teams[0] ?? selectedTeam);
  const s = session!;
  const entry: SessionMove = { ...move, id: `mv-${Date.now()}`, at: new Date().toISOString() };
  session = {
    ...s,
    moves: [...s.moves, entry],
    rosters: { ...s.rosters, ...rosterChanges },
  };
  commit();
}

/** Undo a single logged move is not supported; use resetSession for now. */

/** Teams as they were at session start (for baseline comparison); live teams if no session. */
export function getBaselineTeams(): Team[] {
  if (!session) return cache;
  return BASE_TEAMS.map((t) => {
    const players = session!.baseline[t.abbreviation] ?? t.players;
    return players === t.players ? t : { ...t, players };
  });
}

/** React hook: re-render on any session change (uses the shared roster version). */
export function useSession(): SessionState | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
