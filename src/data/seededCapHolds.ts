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
      "player": "Curtis Jones",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
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
      "age": 34
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
    }
  ],
  "PHX": [
    {
      "player": "Isaiah Livers",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 27
    },
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
  "ORL": [
    {
      "player": "Jett Howard",
      "amount": 41240250,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 22
    },
    {
      "player": "Cory Joseph",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
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
      "player": "Norchad Omier",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
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
      "age": 29
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
  "IND": [
    {
      "player": "Jalen Slawson",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
    {
      "player": "Kobe Brown",
      "amount": 41240250,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
    },
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
  "NYK": [
    {
      "player": "Petteri Koponen",
      "amount": 2926800,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 38
    },
    {
      "player": "Mohamed Diawara",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 21
    },
    {
      "player": "Trey Jemison",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
    {
      "player": "Dillon Jones",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "Kevin McCullar Jr.",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "P.J. Tucker",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    },
    {
      "player": "Jordan Clarkson",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Jeremy Sochan",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 23
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
  "MIA": [
    {
      "player": "Vladislav Goldin",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Trevor Keels",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 22
    },
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
      "age": 34
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
      "age": 31
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
    }
  ],
  "BOS": [
    {
      "player": "John Tonje",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
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
      "player": "Max Shulga",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "BKN": [
    {
      "player": "Joshua Jefferson",
      "amount": 2969520,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 22
    },
    {
      "player": "Ochai Agbaji",
      "amount": 19150575,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
    {
      "player": "Jalen Wilson",
      "amount": 2449421,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "E.J. Liddell",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Ziaire Williams",
      "amount": 11875000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    },
    {
      "player": "Tyson Etienne",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 26
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
      "age": 25
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
      "age": 27
    },
    {
      "player": "Jordan Ford",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    }
  ],
  "LAL": [
    {
      "player": "Drew Timme",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "LeBron James",
      "amount": 57736350,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 41
    },
    {
      "player": "Maxi Kleber",
      "amount": 20900000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Wayne Ellington",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 38
    },
    {
      "player": "Avery Bradley",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 35
    },
    {
      "player": "Jared Dudley",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Dwight Howard",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 40
    },
    {
      "player": "Markieff Morris",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 36
    },
    {
      "player": "Dion Waiters",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Carmelo Anthony",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 42
    },
    {
      "player": "Nick Smith Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 22
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
      "player": "Jordan McLaughlin",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
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
  "GSW": [
    {
      "player": "Nate Williams",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 27
    },
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
      "player": "Charles Bassey",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
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
      "player": "Taran Armstrong",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "NOP": [
    {
      "player": "Hunter Dickinson",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Josh Oduro",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Kevon Looney",
      "amount": 9600000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
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
      "age": 35
    }
  ],
  "ATL": [
    {
      "player": "Keaton Wallace",
      "amount": 2449421,
      "type": "rfa",
      "terms": "RFA",
      "age": 27
    },
    {
      "player": "Christian Koloko",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
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
      "player": "Dylan Windler",
      "amount": 2185116,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    }
  ],
  "POR": [
    {
      "player": "Matisse Thybulle",
      "amount": 21945000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 29
    },
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
      "age": 26
    }
  ],
  "WAS": [
    {
      "player": "Sharife Cooper",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
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
      "age": 34
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
    }
  ],
  "CHI": [
    {
      "player": "Yuki Kawamura",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Mac McClung",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 27
    },
    {
      "player": "Nick Richards",
      "amount": 9500000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
    },
    {
      "player": "Guerschon Yabusele",
      "amount": 6600000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 30
    },
    {
      "player": "Matt Thomas",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Talen Horton-Tucker",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 25
    }
  ],
  "CLE": [
    {
      "player": "Olivier Sarr",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 27
    },
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
      "player": "Larry Nance Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
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
      "player": "Thomas Bryant",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 28
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
    }
  ],
  "MIL": [
    {
      "player": "Nate Ament",
      "amount": 5502000,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 19
    },
    {
      "player": "Alex Antetokounmpo",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 24
    },
    {
      "player": "Gary Trent Jr.",
      "amount": 4806238,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
    },
    {
      "player": "Thanasis Antetokounmpo",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 33
    },
    {
      "player": "Andre Jackson Jr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 24
    }
  ],
  "DAL": [
    {
      "player": "Moussa Cissé",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 23
    },
    {
      "player": "Khris Middleton",
      "amount": 54777776,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
    },
    {
      "player": "Dwight Powell",
      "amount": 7600000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 34
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
  "CHA": [
    {
      "player": "Tosan Evbuomwan",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Antonio Reeves",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 25
    },
    {
      "player": "Xavier Tillman Sr.",
      "amount": 2449421,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 27
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
  "UTA": [
    {
      "player": "Elijah Harkless",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
    {
      "player": "Oscar Tshiebwe",
      "amount": 2185116,
      "type": "rfa",
      "terms": "RFA",
      "age": 26
    },
    {
      "player": "Jusuf Nurkic",
      "amount": 29062500,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 31
    },
    {
      "player": "Kevin Love",
      "amount": 7885000,
      "type": "veteran",
      "terms": "FA Cap Hold",
      "age": 37
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
  "MEM": [
    {
      "player": "Cameron Boozer",
      "amount": 11849760,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 18
    },
    {
      "player": "Karim Lopez",
      "amount": 3746760,
      "type": "draftPick",
      "terms": "120% RSC Hold",
      "age": 19
    }
  ]
};
