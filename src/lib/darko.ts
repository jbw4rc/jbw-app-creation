import { SEEDED_DARKO, type DarkoInfo } from '../data/seededDarko';

// Join key: lowercase, strip accents/punctuation and Jr/Sr/II/III/IV suffixes
// (matches how the DARKO seed is keyed).
export function darkoNorm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** DARKO DPM / value info for a player, by name (undefined if no match). */
export function darkoFor(name: string): DarkoInfo | undefined {
  return SEEDED_DARKO[darkoNorm(name)];
}
