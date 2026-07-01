// ---------------------------------------------------------------------------
// Core domain types for the NBA two-apron analyzer.
//
// All salary figures are stored in whole US dollars (e.g. 49_205_800).
// A "season" is identified by its starting year, e.g. 2024 => the 2024-25 NBA
// season. The app reasons about the current season plus the following four,
// for a five-year salary horizon.
// ---------------------------------------------------------------------------

/** The five salary-cap thresholds the league sets for a given season. */
export interface SeasonCap {
  /** Starting calendar year of the season, e.g. 2024 for 2024-25. */
  season: number;
  /** Whether these numbers are officially set by the league or projected. */
  projected: boolean;
  salaryCap: number;
  luxuryTax: number;
  firstApron: number;
  secondApron: number;
  /** Non-taxpayer mid-level exception amount for the season. */
  nonTaxpayerMLE: number;
  /** Taxpayer mid-level exception amount for the season. */
  taxpayerMLE: number;
  /** Bi-annual exception amount for the season. */
  biAnnualException: number;
  /** Minimum team salary (cap floor) teams must reach. */
  minTeamSalary: number;
}

/** How a contract year is guaranteed / who controls it. */
export type ContractOption =
  | 'guaranteed' // fully guaranteed salary
  | 'team' // team option
  | 'player' // player option
  | 'nonGuaranteed' // non-guaranteed / partially guaranteed
  | 'ufa' // player becomes an unrestricted free agent (no contract)
  | 'rfa'; // player becomes a restricted free agent (no contract)

/** A single season within a player's contract. */
export interface ContractYear {
  season: number;
  salary: number;
  option: ContractOption;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  /** Contract broken out by season. Seasons with no entry are unsigned. */
  contract: ContractYear[];
  /**
   * How the contract was created, per the source's "Terms" column
   * (e.g. "TP-MLE", "Room", "BAE", "Bird", "RSC", "Max"). Used to infer which
   * signing exceptions a team has already spent.
   */
  signedUsing?: string;
}

/** A draft pick a team controls (or has traded away). */
export interface DraftPick {
  /** Draft year, e.g. 2026. */
  year: number;
  round: 1 | 2;
  /**
   * The team the pick originally belongs to (abbreviation). A team's own pick
   * has originalTeam === the owning team's abbreviation.
   */
  originalTeam: string;
  /** Protection / swap notes shown to the user. */
  notes?: string;
  /**
   * True if the pick carries meaningful conditions (protections, swaps) that
   * limit its value or availability.
   */
  encumbered?: boolean;
}

export interface Team {
  abbreviation: string;
  name: string;
  conference: 'East' | 'West';
  players: Player[];
  /** Picks the team currently controls (its own plus acquired). */
  draftCapital: DraftPick[];
}

// --- Trade machine model -----------------------------------------------------

/** One team's side of a proposed trade. */
export interface TradeSide {
  teamAbbr: string;
  /** Player ids this team sends out. */
  outgoingPlayerIds: string[];
  /** Player ids this team takes back (populated from other sides). */
  incomingPlayerIds: string[];
  /** Cash sent out in the deal (dollars). */
  cashSent?: number;
}
