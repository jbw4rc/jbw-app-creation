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
  "asOf": "2026-07-19T15:33:18.445Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "MEM": 2,
    "MIL": 3,
    "CHI": 4,
    "BKN": 5,
    "NOP": 6,
    "LAC": 7,
    "DAL": 8,
    "WAS": 9,
    "CHA": 10,
    "UTA": 11,
    "PHX": 12,
    "ORL": 13,
    "ATL": 14,
    "POR": 15,
    "PHI": 16,
    "LAL": 17,
    "MIA": 18,
    "GSW": 19,
    "HOU": 20,
    "IND": 21,
    "CLE": 22,
    "TOR": 23,
    "DEN": 24,
    "MIN": 25,
    "BOS": 26,
    "DET": 27,
    "NYK": 28,
    "SAS": 29,
    "OKC": 30
  }
};
