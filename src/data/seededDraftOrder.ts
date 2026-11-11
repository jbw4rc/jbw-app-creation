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
  "asOf": "2026-11-11T19:19:37.215Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "CHI": 3,
    "BKN": 4,
    "LAC": 5,
    "UTA": 6,
    "IND": 7,
    "ORL": 8,
    "NOP": 9,
    "PHX": 10,
    "WAS": 11,
    "CHA": 12,
    "DEN": 13,
    "DAL": 14,
    "CLE": 15,
    "POR": 16,
    "MIA": 17,
    "TOR": 18,
    "ATL": 19,
    "NYK": 20,
    "MEM": 21,
    "DET": 22,
    "OKC": 23,
    "HOU": 24,
    "MIN": 25,
    "GSW": 26,
    "PHI": 27,
    "BOS": 28,
    "SAS": 29,
    "LAL": 30
  }
};
