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
  "asOf": "2026-11-01T17:42:46.868Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "CHI": 3,
    "UTA": 4,
    "MIL": 5,
    "LAC": 6,
    "PHX": 7,
    "IND": 8,
    "NYK": 9,
    "NOP": 10,
    "MIA": 11,
    "ORL": 12,
    "GSW": 13,
    "MIN": 14,
    "CHA": 15,
    "DEN": 16,
    "ATL": 17,
    "WAS": 18,
    "TOR": 19,
    "OKC": 20,
    "LAL": 21,
    "CLE": 22,
    "DAL": 23,
    "SAS": 24,
    "POR": 25,
    "BOS": 26,
    "DET": 27,
    "HOU": 28,
    "PHI": 29,
    "MEM": 30
  }
};
