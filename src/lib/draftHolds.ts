import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { SEEDED_CAP_HOLDS } from '../data/seededCapHolds';
import { draftClass2026Position } from '../data/draftClass2026';

// ---------------------------------------------------------------------------
// Unsigned first-round picks. A drafted first-rounder who hasn't signed yet
// still sits on his team's cap as a rookie-scale hold (120% of his slot). It's
// ahistorical for a first-round pick to go unsigned unless he's a draft-and-stash
// staying overseas, so we pull these holds into the rotation as rookies and
// project them from the hold amount (a pick-number proxy, same 120%-of-scale
// basis as a signed rookie deal).
//
// We include a hold only if it belongs to the CURRENT (2026) draft class. The
// SalarySwish "1st Rd Picks" section also carries ancient draft-and-stash rights
// (e.g. a 2007 pick still held years later) that are never actually coming; a
// draft-class check drops them cleanly, where an age heuristic only did so by
// coincidence. Membership also supplies the position, which the hold row lacks.
// ---------------------------------------------------------------------------

export function unsignedFirstRounders(abbr: string): Player[] {
  const holds = SEEDED_CAP_HOLDS[abbr] ?? [];
  const out: Player[] = [];
  for (const h of holds) {
    if (h.type !== 'draftPick') continue;
    const position = draftClass2026Position(h.player);
    if (position == null) continue; // not in the 2026 class — an old stash, skip
    out.push({
      id: `hold-${abbr}-${h.player.toLowerCase().replace(/[^a-z]/g, '')}`,
      name: h.player,
      position,
      age: h.age ?? 20,
      contract: [{ season: CURRENT_SEASON, salary: h.amount, option: 'guaranteed' as const }],
      signedUsing: 'RSC',
    });
  }
  return out;
}
