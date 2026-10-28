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
  "asOf": "2026-10-28T17:59:10.385Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "MIA": 3,
    "NOP": 4,
    "CHI": 5,
    "UTA": 6,
    "MIL": 7,
    "GSW": 8,
    "NYK": 9,
    "PHX": 10,
    "LAC": 11,
    "DEN": 12,
    "ORL": 13,
    "WAS": 14,
    "IND": 15,
    "DAL": 16,
    "ATL": 17,
    "SAS": 18,
    "TOR": 19,
    "CLE": 20,
    "LAL": 21,
    "DET": 22,
    "MIN": 23,
    "PHI": 24,
    "CHA": 25,
    "BOS": 26,
    "POR": 27,
    "MEM": 28,
    "HOU": 29,
    "OKC": 30
  }
};
