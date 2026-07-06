// Position grouping into Guard / Forward / Center.
//
// We classify off the roster's position string (e.g. "SF, PF") first — it's
// accurate — and fall back to DARKO's position_num only when no string exists.
// DARKO's position_num is unreliable on its own (it tags several wings/forwards
// as ~1.5, i.e. guards), so it must not take precedence.

export type PosGroup = 'G' | 'F' | 'C';

// PG=1 … C=5; bare G/F sit at the middle of their range.
const RANK: Record<string, number> = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5, G: 1.5, F: 3.5 };

function bucket(avg: number): PosGroup {
  return avg < 2.5 ? 'G' : avg < 4.5 ? 'F' : 'C';
}

/** Guard / forward / center for a player, from position string then DARKO posNum. */
export function positionGroup(
  position?: string | null,
  posNum?: number | null,
  darkoPos?: string | null
): PosGroup | null {
  const toks = (position ?? '').toUpperCase().match(/PG|SG|SF|PF|C|G|F/g);
  if (toks && toks.length) {
    let g = bucket(toks.reduce((s, t) => s + (RANK[t] ?? 3), 0) / toks.length);
    // Forward-first dual listings like "PF, C" average to center, but the player
    // really plays the 4 (Mobley). When the FIRST-listed slot is a forward and
    // DARKO agrees it's a forward, count them as a forward. Center-first listings
    // ("C, PF" — Adebayo, Portis) stay centers, as do clean "C" listings.
    const primaryForward = toks[0] === 'PF' || toks[0] === 'SF' || toks[0] === 'F';
    if (g === 'C' && primaryForward && darkoPos) {
      const dp = darkoPos.toUpperCase();
      if (dp === 'F' || dp === 'F-C' || dp === 'SF' || dp === 'PF') g = 'F';
    }
    return g;
  }
  if (posNum != null && Number.isFinite(posNum)) return bucket(posNum);
  return null;
}

// Conventional lineup target: 2 guards (96) + 2 forwards (96) + 1 center (48) = 240.
export const POSITION_TARGETS: Record<PosGroup, number> = { G: 96, F: 96, C: 48 };
export const POS_LABEL: Record<PosGroup, string> = { G: 'Guards', F: 'Forwards', C: 'Centers' };
export const POS_ORDER: PosGroup[] = ['G', 'F', 'C'];
