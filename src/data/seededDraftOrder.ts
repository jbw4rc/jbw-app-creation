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
  "asOf": "2026-11-07T17:31:30.805Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "LAC": 3,
    "CHI": 4,
    "ORL": 5,
    "UTA": 6,
    "BKN": 7,
    "PHX": 8,
    "CHA": 9,
    "NOP": 10,
    "MIA": 11,
    "IND": 12,
    "DAL": 13,
    "DEN": 14,
    "WAS": 15,
    "GSW": 16,
    "NYK": 17,
    "CLE": 18,
    "TOR": 19,
    "ATL": 20,
    "MEM": 21,
    "MIN": 22,
    "POR": 23,
    "DET": 24,
    "HOU": 25,
    "BOS": 26,
    "OKC": 27,
    "SAS": 28,
    "PHI": 29,
    "LAL": 30
  }
};
