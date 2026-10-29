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
  "asOf": "2026-10-29T18:08:25.475Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "NOP": 3,
    "CHI": 4,
    "UTA": 5,
    "MIL": 6,
    "MIA": 7,
    "LAC": 8,
    "ORL": 9,
    "PHX": 10,
    "WAS": 11,
    "IND": 12,
    "GSW": 13,
    "DEN": 14,
    "NYK": 15,
    "DAL": 16,
    "ATL": 17,
    "MIN": 18,
    "CHA": 19,
    "SAS": 20,
    "TOR": 21,
    "CLE": 22,
    "BOS": 23,
    "OKC": 24,
    "LAL": 25,
    "DET": 26,
    "PHI": 27,
    "POR": 28,
    "MEM": 29,
    "HOU": 30
  }
};
