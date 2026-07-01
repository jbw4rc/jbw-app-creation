import type { Team } from '../types';
import { classifyTier, teamSalaryForSeason } from './apron';
import { getSeasonCap } from '../data/leagueConstants';
import type { UsedException } from './signingsStore';

// ---------------------------------------------------------------------------
// Free Agent Quiver — the signing "arrows" a team has this offseason, based on
// its cap and apron status. Each arrow also lists any rostered players already
// on a contract of that exception type ("committed"), inferred from the source's
// signing terms. Note: the source tags the mechanism, not the year it was used,
// so "committed" means a contract of that type is on the books — not that this
// offseason's version of the exception is necessarily spent.
// ---------------------------------------------------------------------------

export type ArrowStatus = 'available' | 'unavailable' | 'used';

export interface QuiverArrow {
  key: string;
  name: string;
  /** Max first-year salary the tool provides (null when not applicable). */
  amount: number | null;
  status: ArrowStatus;
  detail: string;
  /** New signings this offseason on this exception — proof it was spent. */
  usedBy: string[];
}

const MIN_SALARY = 2_300_000;

/**
 * Build an exception arrow, flipping its status to "used" when the team has
 * spent an exception of this family this offseason.
 */
function exceptionArrow(
  key: string,
  name: string,
  amount: number | null,
  baseStatus: ArrowStatus,
  detail: string,
  family: 'mle' | 'bae',
  used: UsedException[]
): QuiverArrow {
  const usedBy = used
    .filter((u) => u.family === family)
    .map((u) => `${u.player} (${u.method})`);
  const status: ArrowStatus =
    usedBy.length > 0 && baseStatus === 'available' ? 'used' : baseStatus;
  return { key, name, amount, status, detail, usedBy };
}

export function freeAgentQuiver(
  team: Team,
  season: number,
  used: UsedException[] = []
): QuiverArrow[] {
  const cap = getSeasonCap(season);
  const salary = teamSalaryForSeason(team, season);
  const tier = classifyTier(salary, cap);
  const capRoom = Math.max(0, cap.salaryCap - salary);
  const roomEst = Math.round(cap.nonTaxpayerMLE * 0.62); // room exception ≈ 62% of NT-MLE

  const arrows: QuiverArrow[] = [];

  if (tier === 'underCap') {
    arrows.push({
      key: 'cap',
      name: 'Cap Space',
      amount: capRoom,
      status: capRoom > MIN_SALARY ? 'available' : 'unavailable',
      detail:
        capRoom > MIN_SALARY
          ? 'Sign free agents outright into cap room.'
          : 'No meaningful cap room.',
      usedBy: [],
    });
    arrows.push(
      exceptionArrow('room', 'Room Exception', roomEst, 'available', 'The cap-space team’s mid-level.', 'mle', used)
    );
  } else if (tier === 'overCap' || tier === 'overTax') {
    arrows.push(
      exceptionArrow('ntmle', 'Non-Taxpayer MLE', cap.nonTaxpayerMLE, 'available', 'Full mid-level for non-apron teams.', 'mle', used)
    );
    arrows.push(
      exceptionArrow('bae', 'Bi-Annual Exception', cap.biAnnualException, 'available', 'Usable every other year.', 'bae', used)
    );
  } else if (tier === 'firstApron') {
    arrows.push(
      exceptionArrow('tpmle', 'Taxpayer MLE', cap.taxpayerMLE, 'available', 'The full non-taxpayer MLE is lost at the first apron.', 'mle', used)
    );
    arrows.push({
      key: 'ntmle',
      name: 'Non-Taxpayer MLE',
      amount: cap.nonTaxpayerMLE,
      status: 'unavailable',
      detail: 'Lost at the first apron.',
      usedBy: [],
    });
    arrows.push({
      key: 'bae',
      name: 'Bi-Annual Exception',
      amount: cap.biAnnualException,
      status: 'unavailable',
      detail: 'Lost at the first apron.',
      usedBy: [],
    });
  } else {
    // secondApron
    arrows.push({
      key: 'mle',
      name: 'Mid-Level Exception',
      amount: null,
      status: 'unavailable',
      detail: 'No mid-level of any kind above the second apron.',
      usedBy: [],
    });
    arrows.push({
      key: 'bae',
      name: 'Bi-Annual Exception',
      amount: null,
      status: 'unavailable',
      detail: 'Lost above the second apron.',
      usedBy: [],
    });
  }

  arrows.push({
    key: 'min',
    name: 'Veteran Minimum',
    amount: MIN_SALARY,
    status: 'available',
    detail: 'Always available; unlimited minimum-salary deals.',
    usedBy: [],
  });

  return arrows;
}
