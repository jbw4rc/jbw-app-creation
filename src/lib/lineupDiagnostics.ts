import type { Player } from '../types';
import { darkoFor } from './darko';
import { positionGroup } from './position';

// ---------------------------------------------------------------------------
// Lineup diagnostics — structural flags, kept entirely separate from DPM.
//
// DPM measures TALENT. These flags measure CONSTRUCTION: given how you've handed
// out the 240 minutes, does your rotation actually function (spacing, rim
// protection, playmaking, shot distribution, rebounding)?
//
// Core trick: there are 240 minutes and 5 players on the floor at any instant,
// so for any attribute,  Σ(player_minutes × has_attribute) / 48  is the expected
// number of players with that attribute on the floor at a random moment. That
// turns "did you build a coherent rotation" into concrete on-floor counts, with
// no need to know the exact 5-man units.
// ---------------------------------------------------------------------------

const ON_COURT = 48; // Σ minutes / 48 = 5 = players on the floor at once.

export type FlagLevel = 'good' | 'watch' | 'alert';

export interface LineupFlag {
  key: string;
  label: string;
  onFloor: number; // expected count on the floor (or a rate, for congestion)
  target: string; // human-readable healthy band, e.g. "≥ 2.5"
  level: FlagLevel;
  detail: string; // plain-English "why", names culprits where useful
}

export interface LineupDiagnostics {
  flags: LineupFlag[];
  allocated: number;
}

// Per-player attributes derived from DARKO's projected per-100 box line.
interface Attr {
  name: string;
  min: number;
  grp: ReturnType<typeof positionGroup>;
  usage: number;
  shooter: boolean;
  creator: boolean;
  rim: boolean;
  poa: boolean; // point-of-attack / perimeter defender
  rebounder: boolean;
  highUsage: boolean;
}

function attrsFor(rotation: Player[], mins: Record<string, number>): Attr[] {
  const out: Attr[] = [];
  for (const p of rotation) {
    const min = mins[p.id] ?? 0;
    if (min <= 0) continue;
    const d = darkoFor(p.name);
    const b = d?.box;
    const grp = positionGroup(p.position, d?.posNum, d?.pos);
    const v = (x: number | null | undefined) => x ?? 0;
    const usage = b ? v(b.fga) + 0.44 * v(b.fta) : 0;
    out.push({
      name: p.name,
      min,
      grp,
      usage,
      // A real floor-spacing threat: enough volume from three at a respectable clip.
      // NOTE: DARKO's *projected* 3P% is regressed toward the mean — the league
      // distribution peaks near .34 (even elite shooters project ~.355), so .34 is
      // the right "respects the shooter" line here, not the real-world ~.36.
      shooter: !!b && v(b.fg3a) >= 4 && v(b.fg3pct) >= 0.34,
      // A ball-mover who can initiate offense.
      creator: !!b && v(b.ast) >= 5,
      // Rim protection needs shot-blocking AND size (guards don't protect the rim).
      rim: !!b && v(b.blk) >= 1.6 && (grp === 'C' || grp === 'F'),
      // Point-of-attack defender: a guard/wing who defends (positive D-DPM) and
      // gets after it on the ball (steals). This is the perimeter stopper that
      // keeps quick guards out of the paint — the thing block-based rim
      // protection can't measure.
      poa: !!b && (d?.ddpm ?? 0) >= 0.5 && v(b.stl) >= 1.5 && (grp === 'G' || grp === 'F'),
      rebounder: !!b && v(b.reb) >= 9,
      highUsage: usage >= 22,
    });
  }
  return out;
}

// Expected count on the floor for a boolean attribute.
const onFloor = (a: Attr[], pick: (x: Attr) => boolean) =>
  a.reduce((s, x) => s + (pick(x) ? x.min : 0), 0) / ON_COURT;

// Level from a value against (good, watch) thresholds. `invert` flips the sense
// for metrics where MORE is worse (shot congestion).
function levelFor(value: number, good: number, watch: number, invert = false): FlagLevel {
  if (invert) return value <= good ? 'good' : value <= watch ? 'watch' : 'alert';
  return value >= good ? 'good' : value >= watch ? 'watch' : 'alert';
}

// Highest-minutes player matching a predicate (for naming culprits).
function topBy(a: Attr[], pick: (x: Attr) => boolean): Attr | undefined {
  return a.filter(pick).sort((x, y) => y.min - x.min)[0];
}

const one = (n: number) => n.toFixed(1);

export function diagnoseLineup(rotation: Player[], mins: Record<string, number>): LineupDiagnostics {
  const a = attrsFor(rotation, mins);
  const allocated = a.reduce((s, x) => s + x.min, 0);
  const flags: LineupFlag[] = [];

  // --- Spacing -------------------------------------------------------------
  {
    const val = onFloor(a, (x) => x.shooter);
    const level = levelFor(val, 2.5, 1.8);
    const cramp = topBy(a, (x) => !x.shooter && (x.grp === 'G' || x.grp === 'F'));
    flags.push({
      key: 'spacing',
      label: 'Spacing',
      onFloor: val,
      target: '≥ 2.5 shooters',
      level,
      detail:
        level === 'good'
          ? `${one(val)} floor-spacers on average — defenses have to honor the perimeter.`
          : `${one(val)} shooters on the floor on average — defenses can pack the paint.` +
            (cramp ? ` Heavy minutes to non-shooters like ${cramp.name}.` : ''),
    });
  }

  // --- Rim protection ------------------------------------------------------
  {
    const val = onFloor(a, (x) => x.rim);
    const level = levelFor(val, 0.8, 0.4);
    const exposed = a
      .filter((x) => (x.grp === 'C' || x.grp === 'F') && !x.rim)
      .reduce((s, x) => s + x.min, 0);
    flags.push({
      key: 'rim',
      label: 'Rim protection',
      onFloor: val,
      target: '≥ 0.8 protectors',
      level,
      detail:
        level === 'good'
          ? `${one(val)} rim protectors on average — the paint is defended.`
          : `${one(val)} rim protectors on the floor on average.` +
            (exposed > 0 ? ` ${Math.round(exposed)} frontcourt minutes have no shot-blocking.` : ''),
    });
  }

  // --- Point-of-attack defense --------------------------------------------
  {
    const val = onFloor(a, (x) => x.poa);
    const level = levelFor(val, 1.0, 0.6);
    const leak = a
      .filter((x) => (x.grp === 'G' || x.grp === 'F') && !x.poa)
      .reduce((s, x) => s + x.min, 0);
    flags.push({
      key: 'poa',
      label: 'Perimeter defense',
      onFloor: val,
      target: '≥ 1.0 on-ball',
      level,
      detail:
        level === 'good'
          ? `${one(val)} on-ball defenders on average — the point of attack is covered.`
          : `${one(val)} perimeter stoppers on the floor on average — quick guards can get downhill.` +
            (leak > 0 ? ` ${Math.round(leak)} guard/wing minutes with no plus defender.` : ''),
    });
  }

  // --- Playmaking ----------------------------------------------------------
  {
    const val = onFloor(a, (x) => x.creator);
    const level = levelFor(val, 1.3, 0.8);
    flags.push({
      key: 'playmaking',
      label: 'Playmaking',
      onFloor: val,
      target: '≥ 1.3 initiators',
      level,
      detail:
        level === 'good'
          ? `${one(val)} initiators on average — the offense has ball-movers on the floor.`
          : `${one(val)} creators on the floor on average — stretches with no engine can stagnate.`,
    });
  }

  // --- Shot congestion ("one ball") ---------------------------------------
  {
    const val = onFloor(a, (x) => x.highUsage);
    const level = levelFor(val, 2.2, 2.8, true); // more is worse
    const hogs = a
      .filter((x) => x.highUsage)
      .sort((x, y) => y.usage - x.usage)
      .slice(0, 3)
      .map((x) => x.name);
    flags.push({
      key: 'congestion',
      label: 'Shot distribution',
      onFloor: val,
      target: '≤ 2.2 high-usage',
      level,
      detail:
        level === 'good'
          ? `${one(val)} high-usage players on average — one ball, enough to go around.`
          : `${one(val)} high-usage players on the floor on average — there's only one ball.` +
            (hogs.length ? ` Overlap: ${hogs.join(', ')}.` : ''),
    });
  }

  // --- Rebounding ----------------------------------------------------------
  {
    const val = onFloor(a, (x) => x.rebounder);
    const level = levelFor(val, 1.8, 1.2);
    flags.push({
      key: 'rebounding',
      label: 'Rebounding',
      onFloor: val,
      target: '≥ 1.8 rebounders',
      level,
      detail:
        level === 'good'
          ? `${one(val)} strong rebounders on average — the glass is covered.`
          : `${one(val)} strong rebounders on the floor on average — vulnerable on the glass.`,
    });
  }

  return { flags, allocated };
}
