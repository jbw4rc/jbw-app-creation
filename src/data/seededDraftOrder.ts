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
  "asOf": "2026-11-02T21:28:24.003Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "LAC": 2,
    "CHI": 3,
    "UTA": 4,
    "MIL": 5,
    "BKN": 6,
    "PHX": 7,
    "IND": 8,
    "NYK": 9,
    "NOP": 10,
    "ORL": 11,
    "MIA": 12,
    "MIN": 13,
    "GSW": 14,
    "CHA": 15,
    "DEN": 16,
    "ATL": 17,
    "TOR": 18,
    "WAS": 19,
    "OKC": 20,
    "CLE": 21,
    "DAL": 22,
    "SAS": 23,
    "LAL": 24,
    "POR": 25,
    "DET": 26,
    "BOS": 27,
    "HOU": 28,
    "PHI": 29,
    "MEM": 30
  }
};
