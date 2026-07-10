import type { Team } from '../types';
import { getTeams, rosterStoreVersion } from './teamStore';
import { rotationPlayers, allocation, minutesVersion } from './minutesStore';
import { darkoFor } from './darko';
import { positionGroup } from './position';

// ---------------------------------------------------------------------------
// Team profile — a league-RELATIVE strength/weakness read.
//
// The lineup diagnostics (spacing, rim, …) fire on absolute thresholds, so they
// can tell you a rotation is "unhealthy" but never where you rank. This does the
// opposite: it scores each axis against the other 29 teams and reports a
// percentile, so a bar can read "3rd in the league (elite)" or "28th (a hole)".
//
// Two kinds of axes:
//  • Impact (Offense / Defense): minutes-weighted O-DPM / D-DPM — the same
//    on-court-share weighting team value uses, split into its two halves.
//  • Construction (spacing, perimeter D, rim, playmaking, shot balance,
//    rebounding): the expected count of players-with-attribute on the floor,
//    Σ(minutes × attribute) / 48, exactly like the diagnostics.
// Every axis is oriented so HIGHER IS BETTER (shot balance negates congestion).
// ---------------------------------------------------------------------------

const ON = 48;

export type ProfileTone = 'strength' | 'solid' | 'weak';
export type ProfileGroup = 'offense' | 'defense';

export interface ProfileDim {
  key: string;
  label: string;
  group: ProfileGroup;
  value: number; // raw team value (impact number or on-floor count)
  pct: number; // 0..100 percentile vs the league (100 = best)
  rank: number; // 1..30 (1 = best)
  tone: ProfileTone;
  targetArchetype: string | null; // archetype to acquire when this axis is weak
  detail: string;
}

interface DimMeta {
  key: keyof Raw;
  label: string;
  group: ProfileGroup;
  arch: string | null; // what to go get if you're weak here
  strong: string; // blurb when it's a strength
  weakMsg: string; // blurb when it's a weakness
}

// Order shown top-to-bottom: offense axes, then defense axes.
const DIMS: DimMeta[] = [
  { key: 'offense', label: 'Offense', group: 'offense', arch: 'Offensive Engine',
    strong: 'high-end shot-making across the rotation', weakMsg: 'struggles to generate efficient offense' },
  { key: 'spacing', label: 'Spacing', group: 'offense', arch: 'Floor Spacer',
    strong: 'shooters keep the floor open', weakMsg: 'defenses can pack the paint' },
  { key: 'playmaking', label: 'Playmaking', group: 'offense', arch: 'Primary Ballhandler',
    strong: 'plenty of ball-movement and creation', weakMsg: 'thin on initiators to run the offense' },
  { key: 'shotBalance', label: 'Shot balance', group: 'offense', arch: null,
    strong: 'usage is well distributed', weakMsg: 'too many mouths to feed — one ball' },
  { key: 'defense', label: 'Defense', group: 'defense', arch: '3-and-D Wing',
    strong: 'gets stops across the rotation', weakMsg: 'gives up too much on defense' },
  { key: 'poa', label: 'Perimeter D', group: 'defense', arch: '3-and-D Wing',
    strong: 'on-ball defenders wall off the point of attack', weakMsg: 'quick guards get downhill at will' },
  { key: 'rim', label: 'Rim protection', group: 'defense', arch: 'Rim Protector',
    strong: 'the paint is well protected', weakMsg: 'little rim protection behind the defense' },
  { key: 'defGlass', label: 'Def. rebounding', group: 'defense', arch: 'Interior Big',
    strong: 'closes out possessions on the defensive glass', weakMsg: 'gives up second chances on the defensive glass' },
  { key: 'offGlass', label: 'Off. rebounding', group: 'offense', arch: 'Interior Big',
    strong: 'crashes the offensive glass for second-chance points', weakMsg: "doesn't crash the offensive boards" },
];

interface Raw {
  offense: number;
  defense: number;
  spacing: number;
  poa: number;
  rim: number;
  playmaking: number;
  offGlass: number; // minutes-weighted offensive rebounds per 100 (DARKO)
  defGlass: number; // minutes-weighted defensive rebounds per 100 (DARKO)
  shotBalance: number;
}

function rawFor(team: Team): Raw {
  const rot = rotationPlayers(team.players);
  const mins = allocation(team.abbreviation, rot);
  let offense = 0;
  let defense = 0;
  let offGlass = 0;
  let defGlass = 0;
  const parts: { min: number; shooter: boolean; poa: boolean; rim: boolean; creator: boolean; highUsage: boolean }[] = [];
  for (const p of rot) {
    const min = mins[p.id] ?? 0;
    if (min <= 0) continue;
    const d = darkoFor(p.name);
    const b = d?.box;
    const grp = positionGroup(p.position, d?.posNum, d?.pos, d?.xpos);
    const v = (x: number | null | undefined) => x ?? 0;
    const usage = b ? v(b.fga) + 0.44 * v(b.fta) : 0;
    offense += v(d?.odpm) * (min / ON);
    defense += v(d?.ddpm) * (min / ON);
    // Offensive/defensive glass as minutes-weighted rebounds per 100 — the two
    // rebounding skills modeled separately from DARKO's split.
    offGlass += v(b?.orb) * (min / ON);
    defGlass += v(b?.drb) * (min / ON);
    parts.push({
      min,
      shooter: !!b && v(b.fg3a) >= 4 && v(b.fg3pct) >= 0.34,
      poa: !!b && v(d?.ddpm) >= 0.5 && v(b.stl) >= 1.5 && (grp === 'G' || grp === 'F'),
      rim: !!b && v(b.blk) >= 1.6 && (grp === 'C' || grp === 'F'),
      creator: !!b && v(b.ast) >= 5,
      highUsage: usage >= 22,
    });
  }
  const onFloor = (pick: (x: (typeof parts)[number]) => boolean) =>
    parts.reduce((s, x) => s + (pick(x) ? x.min : 0), 0) / ON;
  return {
    offense,
    defense,
    spacing: onFloor((x) => x.shooter),
    poa: onFloor((x) => x.poa),
    rim: onFloor((x) => x.rim),
    playmaking: onFloor((x) => x.creator),
    offGlass,
    defGlass,
    shotBalance: -onFloor((x) => x.highUsage), // negate: fewer high-usage overlaps is better
  };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const m = n % 100;
  return n + (s[(m - 20) % 10] ?? s[m] ?? s[0]);
};

// League profile, recomputed only when the rosters or minutes change.
let cache: { ver: string; byTeam: Record<string, ProfileDim[]> } | null = null;

function build(): Record<string, ProfileDim[]> {
  const teams = getTeams();
  const raws = teams.map((t) => ({ abbr: t.abbreviation, raw: rawFor(t) }));
  const n = raws.length;
  const out: Record<string, ProfileDim[]> = {};
  for (const { abbr, raw } of raws) {
    out[abbr] = DIMS.map((dim) => {
      const val = raw[dim.key];
      const rank = 1 + raws.filter((r) => r.raw[dim.key] > val).length; // 1 = best
      const pct = n > 1 ? Math.round(((n - rank) / (n - 1)) * 100) : 50;
      const tone: ProfileTone = pct >= 66 ? 'strength' : pct <= 33 ? 'weak' : 'solid';
      const blurb = tone === 'weak' ? dim.weakMsg : dim.strong;
      return {
        key: dim.key,
        label: dim.label,
        group: dim.group,
        value: val,
        pct,
        rank,
        tone,
        targetArchetype: tone === 'weak' ? dim.arch : null,
        detail: `${ordinal(rank)} of ${n} — ${blurb}.`,
      };
    });
  }
  return out;
}

/** League-relative strength/weakness profile for a team (8 axes). */
export function teamProfile(abbr: string): ProfileDim[] {
  const ver = `${minutesVersion()}:${rosterStoreVersion()}`;
  if (!cache || cache.ver !== ver) cache = { ver, byTeam: build() };
  return cache.byTeam[abbr] ?? [];
}
