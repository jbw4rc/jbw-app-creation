// AUTO-GENERATED projected draft order from Tankathon.
// Regenerate: node scripts/build-draftorder.mjs
//
// order: origin-team abbreviation -> projected first-round board slot (1-30)
// for the upcoming draft. Tankathon orders by projected standings and updates
// live during the season. When fewer than 25 teams parse, order is left empty
// and the draft-value engine falls back to a DARKO team-strength ranking.

export interface DraftOrderSeed {
  season: string;
  asOf: string;
  source: string;
  order: Record<string, number>;
}

export const SEEDED_DRAFT_ORDER: DraftOrderSeed = {
  "season": "2027",
  "asOf": "2026-11-08T17:42:52.938Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "LAC": 3,
    "CHI": 4,
    "ORL": 5,
    "UTA": 6,
    "BKN": 7,
    "IND": 8,
    "PHX": 9,
    "NOP": 10,
    "CHA": 11,
    "MIA": 12,
    "DAL": 13,
    "DEN": 14,
    "WAS": 15,
    "POR": 16,
    "CLE": 17,
    "TOR": 18,
    "NYK": 19,
    "ATL": 20,
    "MEM": 21,
    "HOU": 22,
    "MIN": 23,
    "GSW": 24,
    "DET": 25,
    "BOS": 26,
    "PHI": 27,
    "LAL": 28,
    "OKC": 29,
    "SAS": 30
  }
};
