import type { Team } from '../types';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { classifyTier, summarizeTeamSeason, type ApronTier } from './apron';
import { toGrade, type Grade } from './grade';
import { money } from './format';

// ---------------------------------------------------------------------------
// Financial flexibility — graded on two horizons the front office actually
// thinks about separately:
//
//  • Now (this offseason): what can you DO? This is a function of your apron
//    tier — the CBA hands out (or strips away) cap room, the mid-level and
//    bi-annual exceptions, sign-and-trade, and trade-matching room by tier.
//  • Future books (2 years out): do the books CLEAR? Sum only the money that's
//    actually locked in — guaranteed salary and player options — against the
//    projected cap. Team options and non-guaranteeds are sheddable, so they
//    don't count against future flexibility; UFA/RFA years are already off the
//    books.
// ---------------------------------------------------------------------------

export interface FlexHorizon {
  label: string;
  grade: Grade;
  blurb: string;
}

export interface FlexPoint {
  season: number;
  committed: number; // locked money (guaranteed + player options)
  tier: ApronTier; // where that locked money sits
  fillToSecondApron: number; // 0..1 — committed / second apron, for the bar
}

export interface FinancialFlex {
  now: FlexHorizon;
  future: FlexHorizon;
  trajectory: FlexPoint[];
}

/** Locked money for a season: guaranteed salary + player options (the player's
 *  call, so treat as on the books). Team options / non-guaranteeds are sheddable. */
function committedFor(team: Team, season: number): number {
  return team.players.reduce((s, p) => {
    if (p.twoWay) return s;
    const y = p.contract.find((c) => c.season === season);
    if (!y) return s;
    return y.option === 'guaranteed' || y.option === 'player' ? s + y.salary : s;
  }, 0);
}

// The biggest long-term guaranteed commitment reaching `season` or beyond — the
// contract a "locked in" description should name.
function anchorContract(team: Team, season: number): { name: string; through: number } | null {
  let best: { name: string; through: number; sal: number } | null = null;
  for (const p of team.players) {
    if (p.twoWay) continue;
    const locked = p.contract.filter(
      (c) => (c.option === 'guaranteed' || c.option === 'player') && c.season >= CURRENT_SEASON
    );
    if (!locked.length) continue;
    const through = locked.reduce((m, c) => Math.max(m, c.season), 0);
    if (through < season) continue;
    const sal = p.contract.find((c) => c.season === CURRENT_SEASON)?.salary ?? 0;
    if (!best || sal > best.sal) best = { name: p.name, through, sal };
  }
  return best ? { name: best.name, through: best.through } : null;
}

function nowHorizon(team: Team): FlexHorizon {
  const cur = summarizeTeamSeason(team, CURRENT_SEASON);
  const frozen = CURRENT_SEASON + 7;
  let score: number;
  let blurb: string;
  switch (cur.tier) {
    case 'underCap':
      score = 60 + Math.min(38, cur.spaceUnderCap / 1_000_000);
      blurb = `${money(cur.spaceUnderCap)} in cap space — can sign a free agent outright, plus the room exception.`;
      break;
    case 'overCap':
      score = 68;
      blurb =
        'Over the cap, under the tax — full non-taxpayer MLE and bi-annual in hand, with expanded (up to 200%) trade matching.';
      break;
    case 'overTax':
      score = 55;
      blurb = `In the luxury tax — still has the full MLE and bi-annual, but every add is taxed; ${money(cur.spaceUnderFirstApron)} from the first apron.`;
      break;
    case 'firstApron':
      score = 40;
      blurb =
        'First apron — limited to the taxpayer MLE, no bi-annual or sign-and-trade in, and tighter (≤125%) salary matching.';
      break;
    default: // secondApron
      score = 22;
      blurb = `Second apron — no MLE at all, can't aggregate salaries in a trade, and your ${frozen} first-rounder is frozen.`;
      break;
  }
  return { label: 'This offseason', grade: toGrade(score), blurb };
}

function futureHorizon(team: Team): FlexHorizon {
  const fs = CURRENT_SEASON + 2; // the "two years out" planning anchor
  const cap = getSeasonCap(fs);
  const committed = committedFor(team, fs);
  const anchor = anchorContract(team, fs);
  const anchorTail = anchor ? ` ${anchor.name} is on the books through ${anchor.through}.` : '';

  let score: number;
  let blurb: string;
  if (committed <= 0.8 * cap.salaryCap) {
    score = 90;
    blurb = `Books open up — projected ~${money(cap.salaryCap - committed)} under the ${fs} cap, room to add a big piece.`;
  } else if (committed <= cap.salaryCap) {
    score = 74;
    blurb = `Flexible mid-term — near the ${fs} cap with exceptions intact.${anchorTail}`;
  } else if (committed <= cap.luxuryTax) {
    score = 56;
    blurb = `Middling — committed into the tax in ${fs}.${anchorTail}`;
  } else if (committed <= cap.firstApron) {
    score = 40;
    blurb = `Tight — over the first apron in ${fs}; few ways to add.${anchorTail}`;
  } else {
    score = 24;
    blurb = `Locked in — committed above the first apron in ${fs}; relief only as deals expire.${anchorTail}`;
  }
  return { label: 'Future books · ' + fs, grade: toGrade(score), blurb };
}

export function financialFlexibility(team: Team): FinancialFlex {
  const trajectory: FlexPoint[] = [];
  for (let i = 0; i < 5; i++) {
    const season = CURRENT_SEASON + i;
    const cap = getSeasonCap(season);
    const committed = committedFor(team, season);
    trajectory.push({
      season,
      committed,
      tier: classifyTier(committed, cap),
      fillToSecondApron: Math.max(0, Math.min(1, committed / cap.secondApron)),
    });
  }
  return { now: nowHorizon(team), future: futureHorizon(team), trajectory };
}
