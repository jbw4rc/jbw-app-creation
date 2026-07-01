import type {
  ContractOption,
  ContractYear,
  DraftPick,
  Player,
  Team,
} from '../types';
import { DATA_START_SEASON } from './leagueConstants';

// ---------------------------------------------------------------------------
// Sample league data.
//
// These rosters are illustrative and hand-built to exercise every apron tier —
// from a cap-space rebuilder to a team buried in the second apron. Salary
// figures are realistic-order-of-magnitude but not a live feed; the whole
// dataset is meant to be edited freely. Numbers are in whole dollars.
// ---------------------------------------------------------------------------

type Entry = number | [number, ContractOption] | 'ufa' | 'rfa' | null;

/**
 * Build a contract from an array of per-season entries starting at `start`.
 *   42_000_000              -> fully guaranteed
 *   [42_000_000, 'player']  -> player option, etc.
 *   'ufa' / 'rfa'           -> free agent that season (no cap hit)
 *   null                    -> no entry (unsigned)
 */
function contract(entries: Entry[], start = DATA_START_SEASON): ContractYear[] {
  const years: ContractYear[] = [];
  entries.forEach((e, i) => {
    const season = start + i;
    if (e === null) return;
    if (e === 'ufa' || e === 'rfa') {
      years.push({ season, salary: 0, option: e });
      return;
    }
    if (Array.isArray(e)) {
      years.push({ season, salary: e[0], option: e[1] });
      return;
    }
    years.push({ season, salary: e, option: 'guaranteed' });
  });
  return years;
}

let uid = 0;
function player(
  name: string,
  position: string,
  age: number,
  entries: Entry[]
): Player {
  uid += 1;
  return {
    id: `p${uid}`,
    name,
    position,
    age,
    contract: contract(entries),
  };
}

function pick(
  year: number,
  round: 1 | 2,
  originalTeam: string,
  notes?: string,
  encumbered = false
): DraftPick {
  return { year, round, originalTeam, notes, encumbered };
}

// --- Phoenix Suns: buried in the second apron, stripped of draft capital -----
const suns: Team = {
  abbreviation: 'PHX',
  name: 'Phoenix Suns',
  conference: 'West',
  players: [
    player('Devin Booker', 'SG', 28, [
      49_205_800,
      53_142_264,
      57_078_728,
      [61_015_192, 'player'],
      'ufa',
    ]),
    player('Kevin Durant', 'PF', 36, [47_649_433, [51_179_020, 'player'], 'ufa']),
    player('Bradley Beal', 'SG', 31, [
      50_203_930,
      53_668_720,
      [57_133_510, 'player'],
      'ufa',
    ]),
    player('Jusuf Nurkic', 'C', 30, [18_125_000, 19_375_000, 'ufa']),
    player('Grayson Allen', 'SG', 29, [8_000_000, 9_000_000, 9_925_000, 10_850_000]),
    player('Nassir Little', 'SF', 24, [6_250_000, 6_770_000, [7_290_000, 'team'], 'ufa']),
    player('Josh Okogie', 'SG', 26, [7_750_000, [8_297_000, 'player'], 'ufa']),
    player('Drew Eubanks', 'C', 27, [4_700_000, [5_000_000, 'player'], 'ufa']),
    player('Bol Bol', 'C', 25, [2_200_000, 'ufa']),
    player('Keita Bates-Diop', 'SF', 28, [2_700_000, 'ufa']),
  ],
  draftCapital: [
    pick(2025, 2, 'PHX'),
    pick(2031, 1, 'PHX', 'Only tradable first-rounder; earlier firsts owed to prior deals', true),
    pick(2032, 1, 'PHX'),
  ],
};

// --- Boston Celtics: over the second apron, but with picks --------------------
const celtics: Team = {
  abbreviation: 'BOS',
  name: 'Boston Celtics',
  conference: 'East',
  players: [
    player('Jayson Tatum', 'SF', 27, [
      34_848_340,
      54_126_450,
      58_456_566,
      62_786_682,
      [67_116_798, 'player'],
    ]),
    player('Jaylen Brown', 'SG', 28, [
      49_205_800,
      53_142_264,
      57_078_728,
      61_015_192,
      [64_951_656, 'player'],
    ]),
    player('Kristaps Porzingis', 'C', 29, [29_268_293, 30_731_707, 'ufa']),
    player('Jrue Holiday', 'PG', 34, [
      30_000_000,
      32_400_000,
      34_800_000,
      [37_200_000, 'player'],
    ]),
    player('Derrick White', 'PG', 30, [
      19_437_120,
      28_000_000,
      30_240_000,
      [32_480_000, 'player'],
    ]),
    player('Sam Hauser', 'SF', 27, [10_000_000, 10_800_000, 11_600_000, 12_400_000]),
    player('Al Horford', 'C', 38, [9_500_000, 'ufa']),
    player('Payton Pritchard', 'PG', 27, [6_696_429, 7_232_143, 7_767_857, 8_303_571]),
    player('Luke Kornet', 'C', 29, [2_413_304, 'ufa']),
    player('Neemias Queta', 'C', 25, [2_296_274, [2_400_000, 'team'], 'ufa']),
  ],
  draftCapital: [
    pick(2025, 1, 'BOS'),
    pick(2026, 1, 'BOS'),
    pick(2027, 1, 'BOS'),
    pick(2028, 1, 'BOS'),
    pick(2029, 1, 'SAS', 'Via prior trade; top-1 protected', true),
    pick(2030, 1, 'BOS'),
    pick(2032, 1, 'BOS'),
  ],
};

// --- Minnesota Timberwolves: right at the second apron ------------------------
const wolves: Team = {
  abbreviation: 'MIN',
  name: 'Minnesota Timberwolves',
  conference: 'West',
  players: [
    player('Anthony Edwards', 'SG', 23, [
      42_176_400,
      45_550_512,
      48_924_624,
      52_298_736,
      [55_672_848, 'player'],
    ]),
    player('Rudy Gobert', 'C', 32, [43_827_586, 46_641_379, [49_455_172, 'player'], 'ufa']),
    player('Julius Randle', 'PF', 30, [28_939_998, [30_935_520, 'player'], 'ufa']),
    player('Mike Conley', 'PG', 37, [10_000_000, 'ufa']),
    player('Naz Reid', 'C', 25, [13_935_000, 14_888_000, [15_000_000, 'player'], 'ufa']),
    player('Jaden McDaniels', 'SF', 24, [
      23_000_000,
      24_840_000,
      26_680_000,
      28_520_000,
    ]),
    player('Donte DiVincenzo', 'SG', 28, [11_445_000, 12_182_400, 12_919_800, [13_657_200, 'player']]),
    player('Rob Dillingham', 'PG', 20, [5_100_000, 5_355_000, [5_610_000, 'team'], [7_100_000, 'team']]),
    player('Terrence Shannon Jr.', 'SG', 24, [2_400_000, 2_520_000, [2_640_000, 'team'], 'rfa']),
    player('Josh Minott', 'PF', 22, [2_200_000, 'rfa']),
  ],
  draftCapital: [
    pick(2025, 1, 'MIN'),
    pick(2025, 2, 'MIN'),
    pick(2029, 1, 'MIN'),
    pick(2031, 1, 'MIN'),
    pick(2032, 1, 'MIN'),
  ],
};

// --- Denver Nuggets: luxury tax, pressing against the first apron -------------
const nuggets: Team = {
  abbreviation: 'DEN',
  name: 'Denver Nuggets',
  conference: 'West',
  players: [
    player('Nikola Jokic', 'C', 30, [
      51_415_938,
      55_224_526,
      59_033_114,
      [62_841_702, 'player'],
    ]),
    player('Jamal Murray', 'PG', 28, [
      36_000_000,
      46_078_899,
      49_765_211,
      53_451_523,
      [57_137_835, 'player'],
    ]),
    player('Michael Porter Jr.', 'SF', 26, [35_859_950, 38_333_050, 40_806_150, 'ufa']),
    player('Aaron Gordon', 'PF', 29, [22_841_455, 22_841_455, [24_000_000, 'player'], 'ufa']),
    player('Christian Braun', 'SG', 23, [4_943_520, 'rfa']),
    player('Peyton Watson', 'SF', 22, [3_356_760, [4_336_366, 'team'], 'rfa']),
    player('Julian Strawther', 'SG', 23, [2_776_680, 2_916_240, [4_000_000, 'team'], 'rfa']),
    player('Zeke Nnaji', 'PF', 24, [8_888_889, 9_679_012, [10_469_136, 'player'], 'ufa']),
    player('DaRon Holmes II', 'C', 22, [2_800_000, 2_940_000, [3_080_000, 'team'], 'rfa']),
  ],
  draftCapital: [
    pick(2025, 1, 'DEN'),
    pick(2026, 2, 'DEN'),
    pick(2027, 1, 'DEN'),
    pick(2031, 1, 'DEN'),
    pick(2032, 1, 'DEN'),
  ],
};

// --- New York Knicks: over the tax, deep draft cupboard ----------------------
const knicks: Team = {
  abbreviation: 'NYK',
  name: 'New York Knicks',
  conference: 'East',
  players: [
    player('Jalen Brunson', 'PG', 28, [
      24_960_001,
      34_944_001,
      37_742_721,
      40_541_441,
      [43_340_161, 'player'],
    ]),
    player('Karl-Anthony Towns', 'C', 29, [
      49_205_800,
      53_142_264,
      57_078_728,
      [61_015_192, 'player'],
    ]),
    player('OG Anunoby', 'SF', 27, [
      36_600_000,
      39_600_000,
      42_600_000,
      [45_600_000, 'player'],
    ]),
    player('Mikal Bridges', 'SF', 28, [24_900_000, 'ufa']),
    player('Josh Hart', 'SG', 29, [19_536_363, 20_965_517, [22_394_671, 'player'], 'ufa']),
    player('Mitchell Robinson', 'C', 26, [13_000_000, 14_318_182, 'ufa']),
    player('Miles McBride', 'PG', 24, [4_337_000, 4_687_000, 5_037_000, [5_387_000, 'team']]),
    player('Precious Achiuwa', 'C', 25, [6_000_000, 'ufa']),
  ],
  draftCapital: [
    pick(2025, 1, 'NYK'),
    pick(2026, 1, 'NYK'),
    pick(2028, 1, 'NYK'),
    pick(2030, 1, 'NYK'),
    pick(2025, 2, 'WAS', 'Acquired'),
    pick(2027, 2, 'DET', 'Acquired'),
    pick(2032, 1, 'NYK'),
  ],
};

// --- Oklahoma City Thunder: under the cap, a mountain of picks ----------------
const thunder: Team = {
  abbreviation: 'OKC',
  name: 'Oklahoma City Thunder',
  conference: 'West',
  players: [
    player('Shai Gilgeous-Alexander', 'PG', 26, [
      35_859_950,
      38_333_050,
      40_806_150,
      [43_279_250, 'player'],
    ]),
    player('Chet Holmgren', 'C', 22, [10_986_360, [13_666_000, 'team'], 'rfa']),
    player('Jalen Williams', 'SF', 23, [4_842_240, [6_591_924, 'team'], 'rfa']),
    player('Luguentz Dort', 'SG', 25, [17_192_982, 18_192_982, [19_192_982, 'player'], 'ufa']),
    player('Isaiah Hartenstein', 'C', 26, [28_500_000, 29_925_000, [31_350_000, 'team'], 'ufa']),
    player('Cason Wallace', 'PG', 21, [4_670_160, [4_903_668, 'team'], 'rfa']),
    player('Aaron Wiggins', 'SG', 26, [9_000_000, 9_720_000, 10_440_000, [11_160_000, 'player']]),
    player('Isaiah Joe', 'SG', 25, [11_600_000, 12_500_000, 13_400_000, [14_300_000, 'player']]),
    player('Ousmane Dieng', 'PF', 21, [7_600_000, [8_800_000, 'team'], 'rfa']),
  ],
  draftCapital: [
    pick(2025, 1, 'OKC'),
    pick(2025, 1, 'HOU', 'Least favorable of multiple firsts', true),
    pick(2026, 1, 'OKC'),
    pick(2026, 1, 'LAC', 'Acquired'),
    pick(2027, 1, 'OKC'),
    pick(2028, 1, 'OKC'),
    pick(2029, 1, 'OKC'),
    pick(2029, 1, 'DEN', 'Acquired, protected', true),
    pick(2030, 1, 'OKC'),
    pick(2031, 1, 'OKC'),
    pick(2032, 1, 'OKC'),
  ],
};

// --- Utah Jazz: rebuilding with cap space and picks --------------------------
const jazz: Team = {
  abbreviation: 'UTA',
  name: 'Utah Jazz',
  conference: 'West',
  players: [
    player('Lauri Markkanen', 'PF', 27, [
      42_176_400,
      46_394_040,
      50_611_680,
      [54_829_320, 'player'],
    ]),
    player('John Collins', 'PF', 27, [[26_580_000, 'player'], 'ufa']),
    player('Jordan Clarkson', 'SG', 32, [14_000_000, [14_300_000, 'player'], 'ufa']),
    player('Collin Sexton', 'PG', 26, [18_954_546, 'ufa']),
    player('Walker Kessler', 'C', 23, [4_902_960, [6_000_000, 'team'], 'rfa']),
    player('Keyonte George', 'PG', 21, [4_281_960, 4_496_050, [4_710_140, 'team'], 'rfa']),
    player('Taylor Hendricks', 'PF', 21, [4_483_800, 4_708_050, [6_000_000, 'team'], 'rfa']),
    player('Brice Sensabaugh', 'SF', 21, [2_500_000, [2_600_000, 'team'], 'rfa']),
  ],
  draftCapital: [
    pick(2025, 1, 'UTA'),
    pick(2025, 1, 'MIN', 'Acquired, top-5 protected', true),
    pick(2026, 1, 'UTA'),
    pick(2026, 1, 'CLE', 'Acquired', true),
    pick(2027, 1, 'UTA'),
    pick(2027, 1, 'LAL', 'Acquired, protected', true),
    pick(2028, 1, 'UTA'),
    pick(2029, 1, 'UTA'),
    pick(2029, 1, 'MIN', 'Acquired', true),
    pick(2032, 1, 'UTA'),
  ],
};

export const TEAMS: Team[] = [
  suns,
  celtics,
  wolves,
  nuggets,
  knicks,
  thunder,
  jazz,
];

const teamByAbbr = new Map(TEAMS.map((t) => [t.abbreviation, t]));

export function getTeam(abbr: string): Team {
  const t = teamByAbbr.get(abbr);
  if (!t) throw new Error(`Unknown team ${abbr}`);
  return t;
}
