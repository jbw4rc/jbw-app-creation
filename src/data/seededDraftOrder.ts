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
  "asOf": "2026-10-23T16:37:21.352Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "MIL": 3,
    "CHI": 4,
    "NOP": 5,
    "DAL": 6,
    "UTA": 7,
    "PHX": 8,
    "ORL": 9,
    "MIA": 10,
    "GSW": 11,
    "CLE": 12,
    "DEN": 13,
    "BOS": 14,
    "NYK": 15,
    "SAS": 16,
    "MEM": 17,
    "LAC": 18,
    "WAS": 19,
    "CHA": 20,
    "POR": 21,
    "ATL": 22,
    "IND": 23,
    "LAL": 24,
    "HOU": 25,
    "TOR": 26,
    "MIN": 27,
    "DET": 28,
    "PHI": 29,
    "OKC": 30
  }
};
