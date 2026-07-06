// The 2026 NBA draft class (first round) — a curated, fixed reference.
//
// A draft is a historical fact, so this list never needs regeneration. It does
// two jobs the SalarySwish cap-hold feed can't:
//
//  1. Draft-class-year filter. An unsigned rookie-scale hold on a team's cap is
//     almost always an incoming rookie who'll sign and play — but the same "1st
//     Rd Picks" section also carries ancient draft-and-stash rights (e.g. a 2007
//     pick still held years later). Membership in THIS list is what marks a hold
//     as the current (2026) incoming class; anything not here is an old stash we
//     don't pull into the rotation.
//  2. Position. Hold rows don't carry a position, so a pulled-in rookie would
//     otherwise default to forward. These are the drafted positions.
//
// Only players who currently appear as unsigned first-round cap holds need an
// entry (signed rookies are already on their roster with a real position).

// [display name, position]. Positions from the 2026 draft (per team/scouting
// listings): guards PG/SG, wings/bigs SF/PF, centers C.
const ENTRIES: Array<[string, string]> = [
  ['Cameron Boozer', 'PF'],
  ['Karim Lopez', 'SF'],
  ['Aday Mara', 'C'],
  ['Bennett Stirtz', 'PG'],
  ['Labaron Philon', 'PG'],
  ['Mikel Brown Jr.', 'PG'],
  ['Joshua Jefferson', 'PF'],
  ['Chris Cenac Jr.', 'C'],
  ['Cameron Carr', 'SG'],
  ['Keaton Wagler', 'SG'],
  ['Ebuka Okorie', 'PG'],
  ['Jayden Quaintance', 'C'],
  ['Tarris Reed Jr.', 'C'],
  ['Caleb Wilson', 'PF'],
  ['Dailyn Swain', 'SF'],
  ['Brayden Burries', 'SG'],
  ['Nate Ament', 'SF'],
  ['Hannes Steinbach', 'PF'],
  ['Christian Anderson', 'PG'],
  ['Morez Johnson', 'PF'],
  ['Sergio De Larrea', 'PG'],
];

/** Lowercased, accent-stripped, alpha-only, with Jr./Sr./III suffixes dropped. */
export function normalizeDraftName(name: string): string {
  // NFD splits accented letters (López → "lo"+◌́+"pez"); the final [^a-z] strip
  // then drops the combining marks along with spaces/periods.
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z]/g, '');
}

const BY_NAME: Record<string, string> = Object.fromEntries(
  ENTRIES.map(([name, pos]) => [normalizeDraftName(name), pos])
);

/** The drafted position for a 2026 first-rounder, or null if not in the class. */
export function draftClass2026Position(name: string): string | null {
  return BY_NAME[normalizeDraftName(name)] ?? null;
}

/** Whether a name belongs to the 2026 first-round draft class. */
export function isDraftClass2026(name: string): boolean {
  return normalizeDraftName(name) in BY_NAME;
}
