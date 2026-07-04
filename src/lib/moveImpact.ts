import type { Player } from '../types';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { classifyTier, type ApronTier } from './apron';
import { computeTax } from './luxuryTax';
import { isRepeater } from './repeaterStore';
import {
  rankForDpm,
  rosterDpm,
  teamTalent,
  tierForRank,
  type TalentTier,
} from './teamTalent';

// ---------------------------------------------------------------------------
// The win-now / cost impact of a roster move (trade side or signing): how it
// moves the team's DARKO talent and league/conference rank, whether it flips the
// team's tax/apron status, and the true cost including the luxury-tax swing.
// ---------------------------------------------------------------------------

export interface MoveImpact {
  beforeDpm: number;
  afterDpm: number;
  beforeOverall: number;
  afterOverall: number;
  beforeConf: number;
  afterConf: number;
  beforeTier: TalentTier;
  afterTier: TalentTier;
  apronBefore: ApronTier;
  apronAfter: ApronTier;
  taxBefore: number;
  taxAfter: number;
  preSalary: number;
  postSalary: number;
}

/**
 * Compute a move's impact for a team, given its salary before/after and the
 * resulting roster (used for the DARKO talent + rank read).
 */
export function moveImpact(
  abbr: string,
  preSalary: number,
  postSalary: number,
  afterPlayers: Player[]
): MoveImpact {
  const cap = getSeasonCap(CURRENT_SEASON);
  const before = teamTalent(abbr);
  const afterDpm = rosterDpm(afterPlayers);
  const afterRank = rankForDpm(abbr, afterDpm);
  const rep = isRepeater(abbr);
  return {
    beforeDpm: before?.dpm ?? afterDpm,
    afterDpm,
    beforeOverall: before?.overallRank ?? afterRank.overall,
    afterOverall: afterRank.overall,
    beforeConf: before?.confRank ?? afterRank.conf,
    afterConf: afterRank.conf,
    beforeTier: before?.tier ?? tierForRank(afterRank.overall),
    afterTier: tierForRank(afterRank.overall),
    apronBefore: classifyTier(preSalary, cap),
    apronAfter: classifyTier(postSalary, cap),
    taxBefore: computeTax(preSalary, cap.luxuryTax, rep).bill,
    taxAfter: computeTax(postSalary, cap.luxuryTax, rep).bill,
    preSalary,
    postSalary,
  };
}
