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
  "asOf": "2026-10-21T16:46:06.358Z",
  "source": "Tankathon (projected)",
  "order": {
    "BOS": 1,
    "NYK": 2,
    "SAS": 3,
    "SAC": 4,
    "BKN": 5,
    "MIL": 6,
    "MEM": 7,
    "LAC": 8,
    "CHI": 9,
    "NOP": 10,
    "DAL": 11,
    "WAS": 12,
    "UTA": 13,
    "CHA": 14,
    "PHX": 15,
    "ATL": 16,
    "GSW": 17,
    "POR": 18,
    "ORL": 19,
    "IND": 20,
    "MIA": 21,
    "LAL": 22,
    "HOU": 23,
    "TOR": 24,
    "CLE": 25,
    "MIN": 26,
    "DEN": 27,
    "DET": 28,
    "PHI": 29,
    "OKC": 30
  }
};
