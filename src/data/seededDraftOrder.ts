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
  "asOf": "2026-08-11T13:07:17.217Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "MIL": 3,
    "MEM": 4,
    "LAC": 5,
    "CHI": 6,
    "NOP": 7,
    "DAL": 8,
    "WAS": 9,
    "CHA": 10,
    "UTA": 11,
    "PHX": 12,
    "ATL": 13,
    "ORL": 14,
    "GSW": 15,
    "IND": 16,
    "POR": 17,
    "MIA": 18,
    "LAL": 19,
    "HOU": 20,
    "TOR": 21,
    "CLE": 22,
    "MIN": 23,
    "DET": 24,
    "DEN": 25,
    "PHI": 26,
    "BOS": 27,
    "NYK": 28,
    "SAS": 29,
    "OKC": 30
  }
};
