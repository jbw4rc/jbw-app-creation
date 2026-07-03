import type { ContractOption, Player } from '../types';

// ---------------------------------------------------------------------------
// Contract term + cost-control valuation.
//
// Trade value isn't just this season: teams covet long, cost-controlled assets
// and shun long bad money. This module reads a player's multi-year contract to
// (a) describe its remaining term/option and (b) value the surplus a team keeps
// over the years it actually controls the player.
// ---------------------------------------------------------------------------

const CONTROL_ENDS = (o: ContractOption) => o === 'ufa' || o === 'rfa';

// Per-year discount on future surplus (time value + projection uncertainty).
const DISCOUNT = 0.8;
const HORIZON = 8;

export interface ContractTerm {
  /** Last season the team controls (salary > 0, not UFA/RFA); null if none. */
  through: number | null;
  /** Option type on that final controlled year. */
  endOption: ContractOption | null;
  /** Number of controlled seasons counting from `from`. */
  years: number;
  /** Compact chip, e.g. "'30", "'28 PO", "'29 TO", "exp". */
  label: string;
}

function twoDigit(calendarYear: number): string {
  return `'${String(calendarYear).slice(2)}`;
}

/** Contract entries from `from` forward, in season order (tolerates data gaps). */
function futureYears(player: Player, from: number) {
  return player.contract
    .filter((c) => c.season >= from && c.season < from + HORIZON)
    .sort((a, b) => a.season - b.season);
}

/** Remaining term/option for a player, viewed from season `from`. */
export function contractTerm(player: Player, from: number): ContractTerm {
  let years = 0;
  let through: number | null = null;
  let endOption: ContractOption | null = null;
  for (const cy of futureYears(player, from)) {
    // A missing intermediate season is a data gap, not the end of control; only
    // an explicit UFA/RFA (or a $0 non-option year) actually ends the deal.
    if (CONTROL_ENDS(cy.option) || cy.salary <= 0) break;
    years++;
    through = cy.season;
    endOption = cy.option;
  }

  let label: string;
  if (years <= 1 || through == null) {
    label = 'exp';
  } else {
    // The season "2029" is 2029-30; the deal's end (FA) year is that + 1.
    const suffix =
      endOption === 'player'
        ? ' PO'
        : endOption === 'team'
          ? ' TO'
          : endOption === 'nonGuaranteed'
            ? ' NG'
            : '';
    label = `${twoDigit(through + 1)}${suffix}`;
  }
  return { through, endOption, years, label };
}

/**
 * Surplus ($M) a team keeps over the years it controls the player, holding his
 * market value flat and discounting future years. Options are priced by who
 * holds them: team options keep only positive years, player options leave the
 * team only the negative ones (the player opts out of the good ones).
 */
export function controlledSurplus(player: Player, from: number, value: number): number {
  let total = 0;
  for (const cy of futureYears(player, from)) {
    if (CONTROL_ENDS(cy.option) || cy.salary <= 0) break;
    const k = cy.season - from;
    const seasonSurplus = value - cy.salary / 1_000_000;
    const w = Math.pow(DISCOUNT, k);
    if (cy.option === 'team') {
      total += w * Math.max(seasonSurplus, 0);
    } else if (cy.option === 'player' && k > 0) {
      total += w * Math.min(seasonSurplus, 0);
    } else {
      total += w * seasonSurplus;
    }
  }
  return total;
}
