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
  "asOf": "2026-10-26T18:22:36.040Z",
  "source": "Tankathon (projected)",
  "order": {
    "SAC": 1,
    "BKN": 2,
    "MIL": 3,
    "NOP": 4,
    "GSW": 5,
    "MIA": 6,
    "NYK": 7,
    "CHI": 8,
    "DAL": 9,
    "UTA": 10,
    "LAC": 11,
    "ORL": 12,
    "SAS": 13,
    "CLE": 14,
    "PHX": 15,
    "BOS": 16,
    "DEN": 17,
    "ATL": 18,
    "TOR": 19,
    "WAS": 20,
    "CHA": 21,
    "IND": 22,
    "PHI": 23,
    "POR": 24,
    "MEM": 25,
    "LAL": 26,
    "HOU": 27,
    "MIN": 28,
    "DET": 29,
    "OKC": 30
  }
};
