// AUTO-GENERATED cap holds from SalarySwish team pages.
// Regenerate: node scripts/build-salaries.mjs
//
// A cap hold is a placeholder charge that counts against a team's SALARY CAP
// (but not the tax/aprons) for an unsigned free agent or draft pick the team
// still controls. SalarySwish splits them into veteran FA holds, restricted FA
// holds, and unsigned first-round-pick (rookie-scale) holds.

export type CapHoldType = 'veteran' | 'rfa' | 'draftPick';

export interface CapHold {
  player: string;
  /** Hold amount charged to the cap this season, in dollars. */
  amount: number;
  type: CapHoldType;
  /** SalarySwish "Terms" note (e.g. Bird, Non-Bird, RSC), when present. */
  terms?: string;
  age?: number;
}

// Keyed by team abbreviation.
export const SEEDED_CAP_HOLDS: Record<string, CapHold[]> = {};
