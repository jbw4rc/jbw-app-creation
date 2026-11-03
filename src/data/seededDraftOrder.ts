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
  "asOf": "2026-11-03T19:11:44.642Z",
  "source": "Tankathon (projected)",
  "order": {
    "LAC": 1,
    "CHI": 2,
    "UTA": 3,
    "MIL": 4,
    "BKN": 5,
    "SAC": 6,
    "PHX": 7,
    "IND": 8,
    "ORL": 9,
    "NOP": 10,
    "MIA": 11,
    "CHA": 12,
    "DEN": 13,
    "DAL": 14,
    "NYK": 15,
    "MIN": 16,
    "ATL": 17,
    "CLE": 18,
    "TOR": 19,
    "WAS": 20,
    "GSW": 21,
    "BOS": 22,
    "OKC": 23,
    "SAS": 24,
    "LAL": 25,
    "POR": 26,
    "MEM": 27,
    "DET": 28,
    "HOU": 29,
    "PHI": 30
  }
};
