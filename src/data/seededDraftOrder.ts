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
  "asOf": "2026-10-27T17:37:04.894Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIA": 1,
    "SAC": 2,
    "BKN": 3,
    "NOP": 4,
    "NYK": 5,
    "CHI": 6,
    "UTA": 7,
    "MIL": 8,
    "GSW": 9,
    "PHX": 10,
    "DEN": 11,
    "ORL": 12,
    "SAS": 13,
    "WAS": 14,
    "LAC": 15,
    "IND": 16,
    "ATL": 17,
    "DAL": 18,
    "TOR": 19,
    "CLE": 20,
    "BOS": 21,
    "MIN": 22,
    "PHI": 23,
    "CHA": 24,
    "POR": 25,
    "LAL": 26,
    "DET": 27,
    "MEM": 28,
    "HOU": 29,
    "OKC": 30
  }
};
