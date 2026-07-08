import type { DraftPick, Team } from '../types';
import { getTeams, rosterStoreVersion } from './teamStore';
import { valuePick, valuePicks } from './draftValue';
import { toGrade, type Grade } from './grade';
import { CURRENT_SEASON } from '../data/leagueConstants';

// ---------------------------------------------------------------------------
// Draft assets — a graded, described war chest built on the existing pick
// valuation (draftValue.ts: team → projected finish → slot → $M).
//
// The grade is league-relative (percentile of total pick value vs the other 29
// teams). The description reads the COMPOSITION — how many clean first-rounders,
// which incoming picks come from teams projected to be bad (the valuable ones),
// and how much is tangled in swaps/protections.
//
// This is "conveyance phase 1": we surface each pick's status (own / incoming /
// swap / protected) and its terms so the complexity is visible, rather than the
// flat conditional haircut valuePick() applies under the hood. Modeling actual
// conveyance PROBABILITY (protection thresholds resolved against projected
// standings) is a later phase.
// ---------------------------------------------------------------------------

export interface PickItem {
  year: number;
  round: 1 | 2;
  label: string; // e.g. "2028 1st"
  from: string | null; // originating team if incoming, else null (own)
  conditional: boolean; // carries a protection or swap
  value: number; // $M (NPV-discounted, conditional haircut applied)
  slot: number; // projected slot
  note: string; // terms / valuation note (tooltip)
}

export interface DraftAssets {
  grade: Grade;
  totalValue: number; // $M
  rank: number; // 1..30 by total pick value
  firsts: number;
  seconds: number;
  summary: string;
  items: PickItem[]; // first-rounders, most valuable first (seconds summarized)
}

function isConditional(pick: DraftPick): boolean {
  return Boolean(pick.encumbered || (pick.notes && /protect|swap|contention/i.test(pick.notes)));
}

function itemFor(pick: DraftPick, abbr: string): PickItem {
  const val = valuePick(pick);
  return {
    year: pick.year,
    round: pick.round,
    label: `${pick.year} ${pick.round === 1 ? '1st' : '2nd'}`,
    from: pick.originalTeam !== abbr ? pick.originalTeam : null,
    conditional: isConditional(pick),
    value: val.value,
    slot: val.slot,
    note: pick.notes ?? val.note,
  };
}

// League table of total pick value, memoized (pick values don't move with the
// GM session, but key on the roster version to stay safe).
let cache: { ver: string; byTeam: Record<string, { total: number; rank: number }> } | null = null;
function leagueDraftValue(): Record<string, { total: number; rank: number }> {
  const ver = String(rosterStoreVersion());
  if (cache && cache.ver === ver) return cache.byTeam;
  const totals = getTeams().map((t) => ({ abbr: t.abbreviation, total: valuePicks(t.draftCapital) }));
  const byTeam: Record<string, { total: number; rank: number }> = {};
  for (const { abbr, total } of totals) {
    byTeam[abbr] = { total, rank: 1 + totals.filter((x) => x.total > total).length };
  }
  cache = { ver, byTeam };
  return byTeam;
}

export function draftAssets(team: Team): DraftAssets {
  const abbr = team.abbreviation;
  const picks = team.draftCapital;
  const firstsArr = picks.filter((p) => p.round === 1);
  const secondsArr = picks.filter((p) => p.round === 2);

  const items = firstsArr
    .map((p) => itemFor(p, abbr))
    .sort((a, b) => b.value - a.value);

  const league = leagueDraftValue();
  const mine = league[abbr] ?? { total: valuePicks(picks), rank: 30 };
  const n = getTeams().length || 30;
  const pct = n > 1 ? ((n - mine.rank) / (n - 1)) * 100 : 50;
  const grade = toGrade(pct);

  const clean = items.filter((i) => !i.conditional).length;
  const tangled = items.filter((i) => i.conditional).length;
  const incoming = items.filter((i) => i.from && !i.conditional);
  const bestIncoming = incoming[0];

  const parts: string[] = [];
  parts.push(
    `${firstsArr.length} first${firstsArr.length === 1 ? '' : 's'} · ${secondsArr.length} second${
      secondsArr.length === 1 ? '' : 's'
    } · ~$${mine.total.toFixed(0)}M in value`
  );
  if (bestIncoming) {
    parts.push(
      `best incoming: ${bestIncoming.from}'s ${bestIncoming.year} first (projected ~#${Math.round(bestIncoming.slot)})`
    );
  }
  if (grade.tone === 'strength') {
    parts.push(`${clean} clean first${clean === 1 ? '' : 's'} — enough to headline a star trade`);
  } else if (grade.tone === 'weak') {
    parts.push('thin — little to package for a real upgrade');
  } else if (tangled) {
    parts.push(`${tangled} tied up in swaps/protections`);
  }

  return {
    grade,
    totalValue: mine.total,
    rank: mine.rank,
    firsts: firstsArr.length,
    seconds: secondsArr.length,
    summary: parts.join(' · '),
    items,
  };
}

// The next few draft years where the team controls NO first-rounder — the
// Stepien-rule danger zones that cap what's tradeable.
export function barrenFirstYears(team: Team): number[] {
  const have = new Set(team.draftCapital.filter((p) => p.round === 1).map((p) => p.year));
  const out: number[] = [];
  for (let y = CURRENT_SEASON + 1; y <= CURRENT_SEASON + 7; y++) if (!have.has(y)) out.push(y);
  return out;
}
