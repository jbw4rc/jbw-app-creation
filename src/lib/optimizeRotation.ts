import type { Player } from '../types';
import { darkoFor } from './darko';
import { positionGroup, type PosGroup } from './position';
import { diagnoseLineup, type LineupFlag } from './lineupDiagnostics';
import { TOTAL_ROTATION_MINUTES } from './minutesStore';
import { projectedDpm, projectedMinutes } from './rookies';

// ---------------------------------------------------------------------------
// Optimize Rotation — hand out the 240 minutes to maximize talent (DARKO DPM)
// while keeping the rotation realistic and the structural flags healthy.
//
// Objective = Σ dpm × (min/48)  +  λ_flags · (flag health)  −  λ_pos · (position imbalance)
//
// Hard constraints (never violated):
//   • total minutes = 240
//   • each player ≤ MAX_PLAYER_MIN (a real starter's ceiling, not 48)
//
// Position balance (G≈96 / F≈96 / C≈48) is a SOFT penalty, not a hard cap — a
// hard center cap would bury a team's second star big (e.g. Mobley behind Allen),
// which is exactly the opposite of maximizing talent. DPM stays primary; the
// penalty just nudges the split toward a realistic shape and yields when keeping
// a stud on the floor is worth far more than perfect position balance.
//
// Each player's minute ceiling is their DARKO projected minutes plus a little
// headroom — NOT a flat number. DARKO's projection already encodes role and
// durability (a load-managed center like Mitchell Robinson projects ~13 min, a
// backup like Queta ~18), so anchoring the cap to it keeps Optimize from
// stacking two backup bigs to 70+ minutes just because their per-minute DPM is
// high. Stars who really play 36–38 (Tatum, Mobley) keep their ceiling.
//
// Method: seed from the current allocation (already a sensible DARKO-based
// split), then hill-climb small minute transfers between any two players —
// accepting a move only when it raises the objective — until it settles.
// ---------------------------------------------------------------------------

const GLOBAL_MAX_MIN = 38; // nobody plays more than this
const MIN_CEIL = 12; // even a deep-bench arm can absorb up to this if needed
const PROJ_HEADROOM = 6; // minutes a player may exceed their DARKO projection by
const PROJ_FALLBACK = 20; // ceiling basis when DARKO has no projected minutes
const GROUP_TARGET: Record<PosGroup, number> = { G: 96, F: 96, C: 48 };
// A team may drift this far from the target split for free (double-big and
// three-guard looks are normal); minutes beyond the band are penalized.
const GROUP_TOL: Record<PosGroup, number> = { G: 14, F: 14, C: 8 };
const LAMBDA_FLAGS = 0.35; // gently prefer greener flags among equal-value options
const LAMBDA_POS = 0.2; // per minute of G/F/C imbalance BEYOND the tolerance band
const MAX_ITERS = 400;

// A player's realistic minute ceiling: DARKO projected minutes + headroom,
// bounded by [MIN_CEIL, GLOBAL_MAX].
const minuteCeiling = (projMin: number | null | undefined) =>
  Math.min(GLOBAL_MAX_MIN, Math.max(MIN_CEIL, Math.round((projMin ?? PROJ_FALLBACK) + PROJ_HEADROOM)));

// Flag health goals — mirror the thresholds in lineupDiagnostics. `dir` = +1 when
// more is better, −1 for shot congestion (fewer high-usage players is better).
const FLAG_GOALS: Record<string, { good: number; dir: 1 | -1 }> = {
  spacing: { good: 2.5, dir: 1 },
  rim: { good: 0.8, dir: 1 },
  playmaking: { good: 1.3, dir: 1 },
  congestion: { good: 2.2, dir: -1 },
  rebounding: { good: 1.8, dir: 1 },
};

interface Opt {
  id: string;
  name: string;
  grp: PosGroup;
  dpm: number;
  cap: number; // this player's realistic minute ceiling
}

export interface OptimizeResult {
  minutes: Record<string, number>;
  before: { dpm: number; flags: LineupFlag[] };
  after: { dpm: number; flags: LineupFlag[] };
  changed: boolean;
}

const teamDpm = (players: Opt[], mins: Record<string, number>) =>
  players.reduce((s, p) => s + p.dpm * ((mins[p.id] ?? 0) / 48), 0);

// A flag's health in [0,1]: 1 = comfortably at/above goal.
function flagHealth(flags: LineupFlag[]): number {
  let sum = 0;
  for (const f of flags) {
    const g = FLAG_GOALS[f.key];
    if (!g) continue;
    if (g.dir === 1) sum += Math.min(1, f.onFloor / g.good);
    else sum += f.onFloor <= g.good ? 1 : Math.max(0, 1 - (f.onFloor - g.good) / 1.2);
  }
  return sum; // out of ~5
}

export function optimizeRotation(
  rotation: Player[],
  current: Record<string, number>
): OptimizeResult {
  const players: Opt[] = rotation.map((p) => {
    const d = darkoFor(p.name);
    return {
      id: p.id,
      name: p.name,
      grp: positionGroup(p.position, d?.posNum, d?.pos, d?.xpos) ?? 'F', // unlisted → forward
      dpm: projectedDpm(p) ?? -2, // DARKO, else the rookie model, else replacement
      cap: minuteCeiling(projectedMinutes(p)), // realistic ceiling from projected minutes
    };
  });
  const capOf = new Map(players.map((p) => [p.id, p.cap]));
  const groups: PosGroup[] = ['G', 'F', 'C'];

  // G/F/C minutes for an allocation, and the total distance from 96/96/48.
  const posMinutes = (m: Record<string, number>) => {
    const t: Record<PosGroup, number> = { G: 0, F: 0, C: 0 };
    for (const p of players) t[p.grp] += m[p.id] ?? 0;
    return t;
  };
  const posImbalance = (m: Record<string, number>) => {
    const t = posMinutes(m);
    return groups.reduce((s, g) => s + Math.max(0, Math.abs(t[g] - GROUP_TARGET[g]) - GROUP_TOL[g]), 0);
  };

  // ---- Feasible seed from the current allocation --------------------------
  // Clamp to the per-player ceiling, then true-up to exactly 240 by adding to /
  // trimming from players by DPM (add to the best with room, trim the weakest).
  const mins: Record<string, number> = {};
  for (const p of players) mins[p.id] = Math.max(0, Math.min(p.cap, Math.round(current[p.id] ?? 0)));
  let total = players.reduce((s, p) => s + mins[p.id], 0);
  const byDpmDesc = [...players].sort((a, b) => b.dpm - a.dpm);
  while (total < TOTAL_ROTATION_MINUTES) {
    const p = byDpmDesc.find((x) => mins[x.id] < x.cap);
    if (!p) break;
    mins[p.id]++;
    total++;
  }
  while (total > TOTAL_ROTATION_MINUTES) {
    const p = [...byDpmDesc].reverse().find((x) => mins[x.id] > 0);
    if (!p) break;
    mins[p.id]--;
    total--;
  }

  // ---- Objective + hard guarantees ----------------------------------------
  // Optimize must never hand back something worse than the user started with, so
  // two guarantees are HARD (a move that breaks either is rejected outright):
  //   • team value (DPM) never drops below the current allocation
  //   • the number of red (alert) flags never increases
  // Within that feasible set we maximize value, then gently prefer greener flags
  // and a more balanced G/F/C split.
  const redCount = (flags: LineupFlag[]) => flags.filter((f) => f.level === 'alert').length;
  const baseReds = redCount(diagnoseLineup(rotation, current).flags);
  const dpmFloor = teamDpm(players, current) - 1e-6;

  // Full evaluation of an allocation: null when a hard guarantee is broken.
  const evaluate = (m: Record<string, number>): number | null => {
    const dpm = teamDpm(players, m);
    if (dpm < dpmFloor) return null;
    const flags = diagnoseLineup(rotation, m).flags;
    if (redCount(flags) > baseReds) return null;
    return dpm + LAMBDA_FLAGS * flagHealth(flags) - LAMBDA_POS * posImbalance(m);
  };

  // ---- Hill-climb: transfer minutes between ANY two players -----------------
  // Try a coarse step first (fast, big moves), then a fine step to polish.
  let best = evaluate(mins) ?? -Infinity;
  for (const step of [3, 1]) {
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      let bestGain = 1e-6;
      let move: [string, string] | null = null;
      for (const a of players) {
        if (mins[a.id] < step) continue;
        for (const b of players) {
          if (a.id === b.id || mins[b.id] + step > (capOf.get(b.id) ?? GLOBAL_MAX_MIN)) continue;
          mins[a.id] -= step;
          mins[b.id] += step;
          const s = evaluate(mins);
          mins[a.id] += step;
          mins[b.id] -= step;
          if (s != null && s - best > bestGain) {
            bestGain = s - best;
            move = [a.id, b.id];
          }
        }
      }
      if (!move) break;
      mins[move[0]] -= step;
      mins[move[1]] += step;
      best = evaluate(mins) ?? best;
    }
  }

  const before = { dpm: teamDpm(players, current), flags: diagnoseLineup(rotation, current).flags };
  const after = { dpm: teamDpm(players, mins), flags: diagnoseLineup(rotation, mins).flags };
  const changed = rotation.some((p) => (current[p.id] ?? 0) !== (mins[p.id] ?? 0));
  return { minutes: mins, before, after, changed };
}
