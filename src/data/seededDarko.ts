// AUTO-GENERATED DARKO Daily Plus-Minus (DPM) from darko.app.
// Regenerate: node scripts/build-darko.mjs
export interface DarkoInfo {
  name: string;
  dpm: number;
  odpm: number | null;
  ddpm: number | null;
  value: number | null;
  surplus: number | null;
  rank: number | null;
}

// Keyed by normalized player name (lowercase, no accents/punctuation).
export const SEEDED_DARKO: Record<string, DarkoInfo> = {};
