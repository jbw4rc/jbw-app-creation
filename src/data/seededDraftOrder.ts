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
  "asOf": "2026-10-31T16:56:20.487Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "CHI": 3,
    "LAC": 4,
    "UTA": 5,
    "MIL": 6,
    "NOP": 7,
    "PHX": 8,
    "IND": 9,
    "NYK": 10,
    "MIA": 11,
    "ORL": 12,
    "GSW": 13,
    "DEN": 14,
    "CHA": 15,
    "SAS": 16,
    "WAS": 17,
    "ATL": 18,
    "CLE": 19,
    "TOR": 20,
    "LAL": 21,
    "MIN": 22,
    "DAL": 23,
    "POR": 24,
    "OKC": 25,
    "BOS": 26,
    "HOU": 27,
    "DET": 28,
    "PHI": 29,
    "MEM": 30
  }
};
