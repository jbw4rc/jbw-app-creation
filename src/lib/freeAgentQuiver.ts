import type { Player, Team } from '../types';
import { classifyTier, teamSalaryForSeason } from './apron';
import { getSeasonCap } from '../data/leagueConstants';

// ---------------------------------------------------------------------------
// Free Agent Quiver — the signing "arrows" a team has this offseason, based on
// its cap and apron status. Each arrow also lists any rostered players already
// on a contract of that exception type ("committed"), inferred from the source's
// signing terms. Note: the source tags the mechanism, not the year it was used,
// so "committed" means a contract of that type is on the books — not that this
// offseason's version of the exception is necessarily spent.
// ---------------------------------------------------------------------------

export type ArrowStatus = 'available' | 'unavailable';

export interface QuiverArrow {
  key: string;
  name: string;
  /** Max first-year salary the tool provides (null when not applicable). */
  amount: number | null;
  status: ArrowStatus;
  detail: string;
  /** Rostered players on a contract signed via this exception type. */
  committed: string[];
}

const MIN_SALARY = 2_300_000;

function committedTo(players: Player[], re: RegExp): string[] {
  return players
    .filter((p) => p.signedUsing && re.test(p.signedUsing))
    .map((p) => p.name);
}

export function freeAgentQuiver(team: Team, season: number): QuiverArrow[] {
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
      committed: [],
    });
    arrows.push({
      key: 'room',
      name: 'Room Exception',
      amount: roomEst,
      status: 'available',
      detail: 'The cap-space team’s mid-level.',
      committed: committedTo(team.players, /r-?mle|room/i),
    });
  } else if (tier === 'overCap' || tier === 'overTax') {
    arrows.push({
      key: 'ntmle',
      name: 'Non-Taxpayer MLE',
      amount: cap.nonTaxpayerMLE,
      status: 'available',
      detail: 'Full mid-level for non-apron teams.',
      committed: committedTo(team.players, /^mle$/i),
    });
    arrows.push({
      key: 'bae',
      name: 'Bi-Annual Exception',
      amount: cap.biAnnualException,
      status: 'available',
      detail: 'Usable every other year.',
      committed: committedTo(team.players, /bae|bi-?annual/i),
    });
  } else if (tier === 'firstApron') {
    arrows.push({
      key: 'tpmle',
      name: 'Taxpayer MLE',
      amount: cap.taxpayerMLE,
      status: 'available',
      detail: 'The full non-taxpayer MLE is lost at the first apron.',
      committed: committedTo(team.players, /tp-?mle/i),
    });
    arrows.push({
      key: 'ntmle',
      name: 'Non-Taxpayer MLE',
      amount: cap.nonTaxpayerMLE,
      status: 'unavailable',
      detail: 'Lost at the first apron.',
      committed: [],
    });
    arrows.push({
      key: 'bae',
      name: 'Bi-Annual Exception',
      amount: cap.biAnnualException,
      status: 'unavailable',
      detail: 'Lost at the first apron.',
      committed: [],
    });
  } else {
    // secondApron
    arrows.push({
      key: 'mle',
      name: 'Mid-Level Exception',
      amount: null,
      status: 'unavailable',
      detail: 'No mid-level of any kind above the second apron.',
      committed: committedTo(team.players, /mle/i),
    });
    arrows.push({
      key: 'bae',
      name: 'Bi-Annual Exception',
      amount: null,
      status: 'unavailable',
      detail: 'Lost above the second apron.',
      committed: [],
    });
  }

  arrows.push({
    key: 'min',
    name: 'Veteran Minimum',
    amount: MIN_SALARY,
    status: 'available',
    detail: 'Always available; unlimited minimum-salary deals.',
    committed: [],
  });

  return arrows;
}
