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
  "asOf": "2026-11-13T19:18:56.196Z",
  "source": "Tankathon (projected)",
  "order": {
    "MIL": 1,
    "SAC": 2,
    "CHI": 3,
    "LAC": 4,
    "BKN": 5,
    "UTA": 6,
    "WAS": 7,
    "NOP": 8,
    "PHX": 10,
    "CHA": 11,
    "ORL": 12,
    "DAL": 13,
    "DEN": 14,
    "TOR": 15,
    "MEM": 16,
    "MIA": 17,
    "CLE": 18,
    "NYK": 19,
    "ATL": 20,
    "OKC": 21,
    "POR": 23,
    "HOU": 25,
    "PHI": 27,
    "BOS": 28,
    "LAL": 30
  }
};
