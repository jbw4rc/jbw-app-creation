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
  "ORL": [
    {
      "player": "Cory Joseph",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
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
      "age": 33
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
    },
    {
      "player": "Julian Phillips",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 22
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
  "NYK": [
    {
      "player": "Petteri Koponen",
      "amount": 2926800,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 38
    },
    {
      "player": "Dillon Jones",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "P.J. Tucker",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    },
    {
      "player": "Jeremy Sochan",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    },
    {
      "player": "Trey Jemison",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
    {
      "player": "Kevin McCullar Jr.",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
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
      "player": "Isaiah Livers",
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
  "PHI": [
    {
      "player": "Lonnie Walker IV",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Trendon Watford",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Jeff Dowtin",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "MarJon Beauchamp",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Tyrese Martin",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Jalen Hood-Schifino",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    }
  ],
  "LAC": [
    {
      "player": "Bennedict Mathurin",
      "amount": 27562719,
      "type": "rfa",
      "terms": "RFA",
      "age": 23
    },
    {
      "player": "TyTy Washington Jr",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "Nicolas Batum",
      "amount": 7282080,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Bradley Beal",
      "amount": 6424800,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
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
      "age": 37
    },
    {
      "player": "Xavier Moon",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Norchad Omier",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "DEN": [
    {
      "player": "Peyton Watson",
      "amount": 13069428,
      "type": "rfa",
      "terms": "RFA",
      "age": 23
    },
    {
      "player": "Spencer Jones",
      "amount": 2449421,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "David Roddy",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Bruce Brown Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
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
      "age": 35
    },
    {
      "player": "Richard Jefferson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 46
    },
    {
      "player": "Jalen Pickett",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
    {
      "player": "Markus Howard",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Curtis Jones",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
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
      "age": 32
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
      "player": "Keshad Johnson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Jahmir Young",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Trevor Keels",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 22
    }
  ],
  "LAL": [],
  "TOR": [
    {
      "player": "Jordan Nwora",
      "amount": 5700000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
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
  "SAC": [
    {
      "player": "Patrick Baldwin Jr",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 23
    },
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
      "player": "Russell Westbrook",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
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
      "age": 24
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
      "player": "Jonathan Kuminga",
      "amount": 33750000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    },
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
    },
    {
      "player": "Christian Koloko",
      "amount": 2185116,
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
      "age": 28
    },
    {
      "player": "John Tonje",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Max Shulga",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "SAS": [
    {
      "player": "Harrison Ingram",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 23
    },
    {
      "player": "David Jones",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
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
      "age": 33
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
      "age": 28
    }
  ],
  "HOU": [
    {
      "player": "Isaiah Crawford",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "Reggie Bullock",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Aaron Holiday",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
    {
      "player": "Boban Marjanovic",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
    },
    {
      "player": "Jeff Green",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 39
    },
    {
      "player": "Jae’Sean Tate",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
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
      "player": "Josh Oduro",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
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
      "player": "Brandon Williams",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
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
      "age": 24
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
      "age": 30
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
      "player": "Johnathan Williams",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Cassius Winston",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Sharife Cooper",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    }
  ],
  "MIL": [
    {
      "player": "Thanasis Antetokounmpo",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Andre Jackson Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    },
    {
      "player": "Alex Antetokounmpo",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
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
      "player": "Wendell Moore Jr",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "Malik Beasley",
      "amount": 7200000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    }
  ],
  "GSW": [
    {
      "player": "Draymond Green",
      "amount": 38839286,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Andre Iguodala",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 42
    },
    {
      "player": "Gary Payton II",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Seth Curry",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
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
      "age": 45
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
      "player": "Nate Williams",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Taran Armstrong",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "CLE": [
    {
      "player": "James Harden",
      "amount": 57736350,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
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
      "age": 27
    },
    {
      "player": "Olivier Sarr",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
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
      "player": "Oscar Tshiebwe",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
    {
      "player": "Hayden Gray",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
    },
    {
      "player": "Bez Mbeng",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "CHA": [
    {
      "player": "Xavier Tillman Sr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Antonio Reeves",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    }
  ],
  "BKN": [
    {
      "player": "Jalen Wilson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "E.J. Liddell",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    },
    {
      "player": "Tyson Etienne",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    }
  ],
  "MEM": [
    {
      "player": "Karim Lopez",
      "amount": 3746760,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 19
    }
  ],
  "CHI": []
};
