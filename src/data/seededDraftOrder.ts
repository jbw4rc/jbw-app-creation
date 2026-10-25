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
  "asOf": "2026-10-25T15:41:30.173Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "NOP": 2,
    "GSW": 3,
    "MIA": 4,
    "SAC": 5,
    "BKN": 6,
    "ORL": 7,
    "NYK": 8,
    "DAL": 9,
    "SAS": 10,
    "CHI": 11,
    "IND": 12,
    "UTA": 13,
    "PHX": 14,
    "CLE": 15,
    "DEN": 16,
    "LAC": 17,
    "BOS": 18,
    "ATL": 19,
    "WAS": 20,
    "CHA": 21,
    "MEM": 22,
    "POR": 23,
    "LAL": 24,
    "TOR": 25,
    "MIN": 26,
    "DET": 27,
    "OKC": 28,
    "HOU": 29,
    "PHI": 30
  }
};
