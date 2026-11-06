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
  "asOf": "2026-11-06T18:59:14.993Z",
  "source": "Tankathon (projected)",
  "order": {
    "LAC": 1,
    "CHI": 2,
    "MIL": 3,
    "SAC": 4,
    "ORL": 5,
    "UTA": 6,
    "BKN": 7,
    "PHX": 8,
    "IND": 9,
    "DAL": 10,
    "CHA": 11,
    "MIA": 12,
    "NOP": 13,
    "DEN": 14,
    "WAS": 15,
    "MIN": 16,
    "CLE": 17,
    "TOR": 18,
    "NYK": 19,
    "ATL": 20,
    "GSW": 21,
    "MEM": 22,
    "DET": 23,
    "BOS": 24,
    "OKC": 25,
    "SAS": 26,
    "HOU": 27,
    "LAL": 28,
    "POR": 29,
    "PHI": 30
  }
};
