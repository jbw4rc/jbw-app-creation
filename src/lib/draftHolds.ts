import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { SEEDED_CAP_HOLDS } from '../data/seededCapHolds';

// ---------------------------------------------------------------------------
// Unsigned first-round picks. A drafted first-rounder who hasn't signed yet
// still sits on his team's cap as a rookie-scale hold (120% of his slot). It's
// ahistorical for a first-round pick to go unsigned unless he's a draft-and-stash
// staying overseas — and research on the 2026 class confirmed essentially all of
// them sign and play; the lone exceptions are ancient stashes (e.g. a 2007 pick
// still held years later), which read as an out-of-range age. So we pull the
// young holds into the rotation as rookies, projecting them from the hold amount
// (a pick-number proxy, same 120%-of-scale basis as a signed rookie deal).
// ---------------------------------------------------------------------------

// A genuine incoming rookie is 18–22; an older "draft pick" hold is an overseas
// stash from years ago who is never actually coming.
const STASH_AGE = 24;

export function unsignedFirstRounders(abbr: string): Player[] {
  const holds = SEEDED_CAP_HOLDS[abbr] ?? [];
  return holds
    .filter((h) => h.type === 'draftPick' && (h.age ?? 99) < STASH_AGE)
    .map((h) => ({
      id: `hold-${abbr}-${h.player.toLowerCase().replace(/[^a-z]/g, '')}`,
      name: h.player,
      position: '', // unknown from the hold; classifier defaults to forward
      age: h.age ?? 20,
      contract: [{ season: CURRENT_SEASON, salary: h.amount, option: 'guaranteed' as const }],
      signedUsing: 'RSC',
    }));
}
