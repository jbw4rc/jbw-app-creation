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
  "asOf": "2026-11-10T19:25:01.063Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "CHI": 3,
    "BKN": 4,
    "ORL": 5,
    "UTA": 6,
    "LAC": 7,
    "IND": 8,
    "PHX": 9,
    "NOP": 10,
    "WAS": 11,
    "CHA": 12,
    "DEN": 13,
    "DAL": 14,
    "MIA": 15,
    "POR": 16,
    "CLE": 17,
    "TOR": 18,
    "NYK": 19,
    "ATL": 20,
    "MEM": 21,
    "DET": 22,
    "HOU": 23,
    "MIN": 24,
    "GSW": 25,
    "BOS": 26,
    "OKC": 27,
    "PHI": 28,
    "SAS": 29,
    "LAL": 30
  }
};
