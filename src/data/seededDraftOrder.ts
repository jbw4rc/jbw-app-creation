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
  "asOf": "2026-11-17T20:32:58.611Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "BKN": 3,
    "WAS": 5,
    "UTA": 6,
    "CHA": 7,
    "NOP": 8,
    "PHX": 10,
    "IND": 11,
    "TOR": 12,
    "DAL": 13,
    "GSW": 14,
    "ORL": 15,
    "DEN": 16,
    "CLE": 17,
    "NYK": 18,
    "ATL": 19,
    "OKC": 21,
    "DET": 22,
    "POR": 23,
    "MIN": 24,
    "HOU": 26,
    "BOS": 27,
    "PHI": 28,
    "LAL": 29
  }
};
