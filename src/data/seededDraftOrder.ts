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
  "asOf": "2026-10-24T15:31:41.999Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "MIL": 2,
    "NOP": 3,
    "GSW": 4,
    "ORL": 5,
    "MIA": 6,
    "NYK": 7,
    "SAS": 8,
    "BKN": 9,
    "PHX": 10,
    "CLE": 11,
    "DEN": 12,
    "CHA": 13,
    "DAL": 14,
    "CHI": 15,
    "UTA": 16,
    "LAC": 17,
    "WAS": 18,
    "IND": 19,
    "BOS": 20,
    "MEM": 21,
    "POR": 22,
    "ATL": 23,
    "LAL": 24,
    "HOU": 25,
    "TOR": 26,
    "MIN": 27,
    "DET": 28,
    "PHI": 29,
    "OKC": 30
  }
};
