// Which books count as "sharp" and which are retail shops.
//
// This split is the backbone of the whole app. Sharp books run low margins and
// high limits: they move on money, take bets from winners, and their number is
// the closest thing to the market's true price. Retail books run high margins
// and low limits, and they shade their lines away from whatever the public is
// piling onto. So when the two disagree, the gap points straight at the public
// side — retail is the one that moved, and it moved to protect itself.

/**
 * 'other' is not a throwaway. A live pull returns two dozen books, most of them
 * European or low-limit offshore shops. Counting those as retail was letting
 * Betsson, NordicBet, PMU and Tipico outvote DraftKings and FanDuel in the
 * retail median — which corrupts the public-side read, since the public whose
 * money we are trying to locate bets at the US majors. Unrecognised books are
 * shown in the per-book table but kept out of both consensus numbers.
 */
export type BookTier = 'sharp' | 'retail' | 'other';

interface BookInfo {
  key: string;
  name: string;
  tier: BookTier;
}

// Keys match The Odds API's `bookmakers[].key`.
const BOOKS: BookInfo[] = [
  // Sharp / low-margin shops. Pinnacle is the reference price worldwide;
  // the others take sharp action and move in step with it.
  { key: 'pinnacle', name: 'Pinnacle', tier: 'sharp' },
  { key: 'circasports', name: 'Circa', tier: 'sharp' },
  { key: 'betonlineag', name: 'BetOnline', tier: 'sharp' },
  { key: 'lowvig', name: 'LowVig', tier: 'sharp' },
  { key: 'bookmaker', name: 'BookMaker', tier: 'sharp' },
  { key: 'betcris', name: 'Betcris', tier: 'sharp' },
  { key: 'matchbook', name: 'Matchbook', tier: 'sharp' },

  // Retail books — where the public bets, and where lines get shaded.
  { key: 'draftkings', name: 'DraftKings', tier: 'retail' },
  { key: 'fanduel', name: 'FanDuel', tier: 'retail' },
  { key: 'betmgm', name: 'BetMGM', tier: 'retail' },
  { key: 'williamhill_us', name: 'Caesars', tier: 'retail' },
  { key: 'espnbet', name: 'ESPN BET', tier: 'retail' },
  { key: 'fanatics', name: 'Fanatics', tier: 'retail' },
  { key: 'betrivers', name: 'BetRivers', tier: 'retail' },
  { key: 'hardrockbet', name: 'Hard Rock', tier: 'retail' },
  { key: 'bovada', name: 'Bovada', tier: 'retail' },
];

const BY_KEY = new Map(BOOKS.map((b) => [b.key, b]));

/**
 * Tier for a book key. Unknown books are 'other' and sit out of the maths.
 * Guessing a tier is worse than excluding: a book placed in the wrong bucket
 * does not add noise, it moves the signal.
 */
export function bookTier(key: string): BookTier {
  return BY_KEY.get(key)?.tier ?? 'other';
}

/** Display name for a book key, falling back to the raw key. */
export function bookName(key: string): string {
  return BY_KEY.get(key)?.name ?? key;
}

/** Every book key we know about, in display order. */
export function knownBooks(): readonly BookInfo[] {
  return BOOKS;
}
