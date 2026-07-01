import type { Team } from '../types';
import {
  type ApronTier,
  classifyTier,
  teamSalaryForSeason,
} from './apron';
import { getSeasonCap } from '../data/leagueConstants';
import type { TradeViolation } from './trade';

// ---------------------------------------------------------------------------
// Free-agent signing evaluator.
//
// Given a team and a proposed first-year salary, determine which signing
// mechanisms are available (cap space, various exceptions, minimum) and flag
// apron-driven blocks — most importantly, that a second-apron team has no MLE
// and that using the full non-taxpayer MLE hard-caps a team at the first apron.
// ---------------------------------------------------------------------------

export type SigningTool =
  | 'capSpace'
  | 'nonTaxpayerMLE'
  | 'taxpayerMLE'
  | 'biAnnual'
  | 'minimum';

export interface SigningOption {
  tool: SigningTool;
  label: string;
  /** Maximum first-year salary this tool provides. */
  maxSalary: number;
  available: boolean;
  /** Why the tool is unavailable, when it is not. */
  blockedReason?: string;
  /** True if using this tool hard-caps the team at an apron. */
  hardCaps?: 'firstApron' | 'secondApron';
}

export interface FreeAgentEvaluation {
  season: number;
  preTier: ApronTier;
  preSalary: number;
  targetSalary: number;
  options: SigningOption[];
  /** The best (largest) legal option that covers the target salary, if any. */
  recommended?: SigningOption;
  violations: TradeViolation[];
}

const MINIMUM_SALARY = 2_200_000; // approx. veteran minimum, illustrative

export function evaluateSigning(
  team: Team,
  season: number,
  targetSalary: number
): FreeAgentEvaluation {
  const cap = getSeasonCap(season);
  const preSalary = teamSalaryForSeason(team, season);
  const preTier = classifyTier(preSalary, cap);
  const capRoom = Math.max(cap.salaryCap - preSalary, 0);

  const overFirstApron = preTier === 'firstApron' || preTier === 'secondApron';
  const overSecondApron = preTier === 'secondApron';

  const options: SigningOption[] = [
    {
      tool: 'capSpace',
      label: 'Cap Space',
      maxSalary: capRoom,
      available: capRoom > MINIMUM_SALARY,
      blockedReason: capRoom <= MINIMUM_SALARY ? 'No meaningful cap room.' : undefined,
    },
    {
      tool: 'nonTaxpayerMLE',
      label: 'Non-Taxpayer Mid-Level',
      maxSalary: cap.nonTaxpayerMLE,
      available: !overFirstApron,
      blockedReason: overFirstApron
        ? 'Unavailable at or above the first apron.'
        : undefined,
      hardCaps: 'firstApron',
    },
    {
      tool: 'taxpayerMLE',
      label: 'Taxpayer Mid-Level',
      maxSalary: cap.taxpayerMLE,
      available: !overSecondApron,
      blockedReason: overSecondApron
        ? 'Second-apron teams have no mid-level exception.'
        : undefined,
    },
    {
      tool: 'biAnnual',
      label: 'Bi-Annual Exception',
      maxSalary: cap.biAnnualException,
      available: !overFirstApron,
      blockedReason: overFirstApron
        ? 'Unavailable at or above the first apron.'
        : undefined,
      hardCaps: 'firstApron',
    },
    {
      tool: 'minimum',
      label: 'Veteran Minimum',
      maxSalary: MINIMUM_SALARY,
      available: true,
    },
  ];

  // The recommended tool is the smallest tool that still covers the target,
  // preferring cap space, then exceptions from largest to smallest, then min.
  const order: SigningTool[] = [
    'capSpace',
    'nonTaxpayerMLE',
    'taxpayerMLE',
    'biAnnual',
    'minimum',
  ];
  const recommended = order
    .map((t) => options.find((o) => o.tool === t)!)
    .find((o) => o.available && o.maxSalary + 1 >= targetSalary);

  const violations: TradeViolation[] = [];
  if (!recommended) {
    violations.push({
      code: 'no-tool',
      severity: 'block',
      title: 'No legal way to sign this player',
      detail: overSecondApron
        ? `As a second-apron team, ${team.abbreviation} can only offer minimum deals (${money(
            MINIMUM_SALARY
          )}). ${money(targetSalary)} is not reachable.`
        : `${team.abbreviation} has no available tool large enough for a ${money(
            targetSalary
          )} salary.`,
    });
  } else if (recommended.hardCaps) {
    violations.push({
      code: 'hard-cap',
      severity: 'warn',
      title: `Signing hard-caps ${team.abbreviation} at the ${
        recommended.hardCaps === 'firstApron' ? 'first' : 'second'
      } apron`,
      detail: `Using the ${recommended.label} hard-caps the team for the rest of the season; it may not exceed that apron by any means.`,
    });
  }

  return {
    season,
    preTier,
    preSalary,
    targetSalary,
    options,
    recommended,
    violations,
  };
}

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
