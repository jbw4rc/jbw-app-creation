import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { SEEDED_CAP_HOLDS } from '../data/seededCapHolds';
import { darkoFor, darkoNorm } from './darko';
import { projectedContract } from './contractModel';

// ---------------------------------------------------------------------------
// Sign-and-trade support.
//
// A team can sign a free agent it holds rights to (an FA cap hold) and trade him
// in the same transaction. We synthesize a signed Player at his PROJECTED market
// contract (from contractModel), tagged so the trade engine can hard-cap the
// acquiring team at the first apron. Sign-and-trade deals run a minimum of three
// seasons under the CBA.
// ---------------------------------------------------------------------------

const ST_YEARS = 3;
export const SIGN_AND_TRADE_TERMS = 'Sign-and-Trade';

/** Synthetic-player id for a signed-and-traded free agent. */
export const stId = (name: string) => `st-${darkoNorm(name)}`;

export interface SignableFA {
  name: string;
  projected: number; // projected annual contract, $M
  pos: string | null;
  age: number | null;
}

/**
 * Free agents a team holds rights to and could sign-and-trade — its veteran/RFA
 * cap holds that have a DARKO projection (so a market contract can be modeled).
 */
export function signableHolds(abbr: string): SignableFA[] {
  const holds = SEEDED_CAP_HOLDS[abbr] ?? [];
  const out: SignableFA[] = [];
  for (const h of holds) {
    if (h.type === 'draftPick') continue; // rookie-scale hold, not an FA
    const d = darkoFor(h.player);
    if (!d || d.value == null) continue; // need a projectable player
    const age = d.age ?? h.age ?? 27;
    out.push({
      name: h.player,
      projected: projectedContract(d.value, age, d.dpm ?? 0).salary,
      pos: d.pos ?? null,
      age: h.age ?? (d.age != null ? Math.round(d.age) : null),
    });
  }
  return out.sort((a, b) => b.projected - a.projected);
}

/**
 * Build a synthetic signed Player. Uses the projected market contract by
 * default, or an explicit `salaryM` (annual, $M) when the user forces a value.
 */
export function buildSignedPlayer(name: string, salaryM?: number): Player | null {
  const d = darkoFor(name);
  if (!d) return null;
  const age = d.age ?? 27;
  const annual =
    salaryM != null
      ? salaryM
      : d.value != null
        ? projectedContract(d.value, age, d.dpm ?? 0).salary
        : null;
  if (annual == null) return null;
  const salary = Math.round(annual * 1_000_000);
  const contract = [];
  for (let k = 0; k < ST_YEARS; k++) {
    contract.push({ season: CURRENT_SEASON + k, salary, option: 'guaranteed' as const });
  }
  return {
    id: stId(name),
    name,
    position: d.pos ?? '—',
    age: Math.round(age),
    contract,
    signedUsing: SIGN_AND_TRADE_TERMS,
  };
}
