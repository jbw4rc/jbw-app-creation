// AUTO-GENERATED cap holds from SalarySwish team pages.
// Regenerate: node scripts/build-salaries.mjs
//
// A cap hold is a placeholder charge that counts against a team's SALARY CAP
// (but not the tax/aprons) for an unsigned free agent or draft pick the team
// still controls. Split into veteran FA, restricted FA, and rookie-scale holds.

export type CapHoldType = 'veteran' | 'rfa' | 'draftPick';

export interface CapHold {
  player: string;
  /** Hold amount charged to the cap this season, in dollars. */
  amount: number;
  type: CapHoldType;
  /** SalarySwish "Terms"/status note (e.g. Bird, RFA, 120% RSC Hold). */
  terms?: string;
  age?: number;
}

// Keyed by team abbreviation.
export const SEEDED_CAP_HOLDS: Record<string, CapHold[]> = {
  "DEN": [
    {
      "player": "Bruce Brown Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Justin Holiday",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Vlatko Cancar",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Troy Daniels",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "DeMarcus Cousins",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Richard Jefferson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 46
    },
    {
      "player": "Markus Howard",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    }
  ],
  "NYK": [
    {
      "player": "Petteri Koponen",
      "amount": 2926800,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 38
    },
    {
      "player": "P.J. Tucker",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    }
  ],
  "ORL": [
    {
      "player": "Cory Joseph",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Trevelin Queen",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    }
  ],
  "GSW": [
    {
      "player": "Andre Iguodala",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 42
    },
    {
      "player": "Seth Curry",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "JaMychal Green",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Nemanja Bjelica",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Andrew Bogut",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    },
    {
      "player": "Anthony Lamb",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Usman Garuba",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    },
    {
      "player": "Matt Barnes",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 46
    },
    {
      "player": "Jonas Jerebko",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 39
    },
    {
      "player": "David West",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 46
    },
    {
      "player": "Jerome Robinson",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Nico Mannion",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Taran Armstrong",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "PHX": [
    {
      "player": "Thaddeus Young",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Terrence Ross",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Bol Bol",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
    {
      "player": "Damion Lee",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Amir Coffey",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Isaiah Thomas",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Udoka Azubuike",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
    {
      "player": "Saben Lee",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Ish Wainright",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Gabriel Lundberg",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    }
  ],
  "OKC": [
    {
      "player": "Alex Ducas",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    }
  ],
  "PHI": [
    {
      "player": "Kyle Lowry",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Jeff Dowtin",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Jalen Hood-Schifino",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    }
  ],
  "MIN": [
    {
      "player": "Evan Turner",
      "amount": 27909834,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Austin Rivers",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Joe Ingles",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Greg Monroe",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Aaron Brooks",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    }
  ],
  "NOP": [
    {
      "player": "Willy Hernangomez",
      "amount": 4642804,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 32
    },
    {
      "player": "Elfrid Payton",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 32
    },
    {
      "player": "Tony Snell",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Brandon Boston Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    },
    {
      "player": "Gary Clark",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Jared Harper",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "James Nunnally",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Keion Brooks Jr.",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    }
  ],
  "IND": [
    {
      "player": "James Johnson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 39
    },
    {
      "player": "Gabe York",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    }
  ],
  "CLE": [
    {
      "player": "Damian Jones",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Tristan Thompson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Raul Neto",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Rajon Rondo",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Ed Davis",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Chuma Okeke",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    }
  ],
  "MIA": [
    {
      "player": "Udonis Haslem",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 46
    },
    {
      "player": "Alec Burks",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Dwyane Wade",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 44
    },
    {
      "player": "Jordan Mickey",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 32
    },
    {
      "player": "Jahmir Young",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Josh Christopher",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "LAL": [],
  "HOU": [
    {
      "player": "Reggie Bullock",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Boban Marjanovic",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Jeff Green",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    }
  ],
  "SAS": [
    {
      "player": "Kelly Olynyk",
      "amount": 25545732,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Bismack Biyombo",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Mason Plumlee",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Lindy Waters III",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    }
  ],
  "TOR": [
    {
      "player": "Jordan Nwora",
      "amount": 5700000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Garrett Temple",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Will Barton",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "A.J. Lawson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    }
  ],
  "BOS": [
    {
      "player": "Blake Griffin",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Torrey Craig",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Mfiondu Kabengele",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Max Shulga",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "SAC": [
    {
      "player": "Jae Crowder",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Doug McDermott",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "JaVale McGee",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Drew Eubanks",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Killian Hayes",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Mason Jones",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Jordan Ford",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    }
  ],
  "ATL": [
    {
      "player": "Gabe Vincent",
      "amount": 21850000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Wesley Matthews",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 39
    },
    {
      "player": "Tony Bradley",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Trent Forrest",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Keaton Wallace",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Dylan Windler",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    }
  ],
  "POR": [
    {
      "player": "Rondae Hollis-Jefferson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Ben McLemore",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Blake Wesley",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    },
    {
      "player": "T.J. Leaf",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Keljin Blevins",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Ashton Hagans",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    }
  ],
  "WAS": [
    {
      "player": "Ian Mahinmi",
      "amount": 23175077,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 39
    },
    {
      "player": "Kendrick Nunn",
      "amount": 6825000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Tomas Satoransky",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Shabazz Napier",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Anthony Gill",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Ty Lawson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Ramon Sessions",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Cassius Winston",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "JT Thor",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "LAC": [
    {
      "player": "Nicolas Batum",
      "amount": 7282080,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Ben Simmons",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Rodney Hood",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Patty Mills",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Xavier Moon",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    }
  ],
  "DET": [
    {
      "player": "Jalen Duren",
      "amount": 19449432,
      "type": "rfa",
      "terms": "RFA",
      "age": 22
    },
    {
      "player": "Malik Beasley",
      "amount": 7200000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Wendell Moore Jr",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "UTA": [
    {
      "player": "Kevin Love",
      "amount": 7885000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Bez Mbeng",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "MIL": [],
  "DAL": [
    {
      "player": "Dwight Powell",
      "amount": 7600000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Nicolo Melli",
      "amount": 5066667,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Theo Pinson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Kai Jones",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Greg Brown III",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "McKinley Wright IV",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Moses Wright",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    }
  ],
  "CHA": [
    {
      "player": "Xavier Tillman Sr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    }
  ],
  "CHI": [],
  "MEM": [],
  "BKN": []
};
