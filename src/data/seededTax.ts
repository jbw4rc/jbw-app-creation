// AUTO-GENERATED luxury-tax schedule + repeater flags from SalarySwish.
// Regenerate: node scripts/build-salaries.mjs
export interface TaxSchedule {
  bracketWidth: number;
  standard: number[];
  repeater: number[];
  repeaters: Record<string, boolean>;
}

export const SEEDED_TAX: TaxSchedule = {
  "bracketWidth": 6064000,
  "standard": [
    1,
    1.25,
    3.5,
    4.75,
    5.25,
    5.75,
    6.25,
    6.75,
    7.25,
    7.75
  ],
  "repeater": [
    3,
    3.25,
    5.5,
    6.75,
    7.25,
    7.75,
    8.25,
    8.75,
    9.25,
    9.75
  ],
  "repeaters": {
    "ATL": false,
    "BOS": true,
    "BKN": false,
    "CHA": false,
    "CHI": false,
    "CLE": false,
    "DAL": false,
    "DEN": true,
    "DET": false,
    "GSW": true,
    "HOU": false,
    "IND": false,
    "LAC": true,
    "LAL": true,
    "MEM": false,
    "MIA": false,
    "MIL": true,
    "MIN": false,
    "NOP": false,
    "NYK": false,
    "OKC": false,
    "ORL": false,
    "PHI": false,
    "PHX": true,
    "POR": false,
    "SAC": false,
    "SAS": false,
    "TOR": false,
    "UTA": false,
    "WAS": false
  }
};
