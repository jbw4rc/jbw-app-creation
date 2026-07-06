import type { Player, Team } from '../types';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { getTeams } from './teamStore';
import { rotationPlayers, allocation } from './minutesStore';
import { darkoFor } from './darko';
import type { DarkoInfo } from '../data/seededDarko';
import { positionGroup } from './position';
import { teamNeeds, type TeamNeed } from './teamNeeds';
import { rosterDpm } from './teamTalent';
import { playerSalaryForSeason, teamSalaryForSeason, classifyTier } from './apron';
import { evaluateMultiTeamTrade, maxIncomingFor, type MultiTeamSide } from './trade';
import { money } from './format';

// ---------------------------------------------------------------------------
// Trade Targets — for each of your team's needs, find players around the league
// who fill it, then build the cheapest cap/apron-LEGAL swap that lands them.
// Legality is confirmed by the same engine the Trade Machine uses, so a target
// is only ever surfaced if the deal actually clears the cap and both aprons.
// ---------------------------------------------------------------------------

export interface TradeTarget {
  incoming: Player;
  fromTeam: string;
  incomingDpm: number;
  outgoing: Player[];
  outSalary: number;
  inSalary: number;
  valueGain: number; // net team value (DPM) change
  route: string;
}

export interface NeedTargets {
  need: TeamNeed;
  targets: TradeTarget[];
}

// Does a player supply what a given need calls for? (from DARKO's box line)
function providesNeed(key: string, d: DarkoInfo): boolean {
  const b = d.box;
  if (!b) return false;
  const v = (x: number | null) => x ?? 0;
  const grp = positionGroup(d.pos, d.posNum, d.pos);
  switch (key) {
    case 'rim':
      return v(b.blk) >= 1.6 && (grp === 'C' || grp === 'F');
    case 'spacing':
      return v(b.fg3a) >= 4 && v(b.fg3pct) >= 0.34;
    case 'playmaking':
      return v(b.ast) >= 5;
    case 'rebounding':
      return v(b.reb) >= 9;
    case 'congestion': {
      // Shot-distribution relief = an efficient, low-usage complementary piece.
      const usage = v(b.fga) + 0.44 * v(b.fta);
      return usage < 18 && (d.dpm ?? -9) >= 1;
    }
    default:
      return false;
  }
}

// Size-1 and size-2 subsets of the outgoing pool.
function packages<T>(pool: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < pool.length; i++) {
    out.push([pool[i]]);
    for (let j = i + 1; j < pool.length; j++) out.push([pool[i], pool[j]]);
  }
  return out;
}

export function findTradeTargets(myAbbr: string): NeedTargets[] {
  const teams = getTeams();
  const me = teams.find((t) => t.abbreviation === myAbbr);
  if (!me) return [];
  const needs = teamNeeds(me).slice(0, 3); // top few needs
  if (needs.length === 0) return [];

  const cap = getSeasonCap(CURRENT_SEASON);
  const mySalary = teamSalaryForSeason(me, CURRENT_SEASON);
  const myTier = classifyTier(mySalary, cap);
  const myRoom = cap.salaryCap - mySalary;
  const baseVal = rosterDpm(myAbbr, me.players);

  // My movable pieces, each with salary and current minutes-weighted value.
  const myRot = rotationPlayers(me.players);
  const myMins = allocation(myAbbr, myRot);
  const contribOf = (p: Player) => {
    const inRot = myRot.find((r) => r.id === p.id);
    const d = darkoFor(p.name);
    return inRot && d?.dpm != null ? d.dpm * ((myMins[p.id] ?? 0) / 48) : 0;
  };
  // Market value ($M) — the currency of trade FAIRNESS (distinct from salary,
  // which is the cap-matching currency). Falls back to salary when DARKO has none.
  const marketVal = (p: Player) => {
    const d = darkoFor(p.name);
    return d?.value ?? playerSalaryForSeason(p, CURRENT_SEASON) / 1e6;
  };
  const myMoves = me.players
    .filter((p) => playerSalaryForSeason(p, CURRENT_SEASON) > 0)
    .map((p) => ({ p, sal: playerSalaryForSeason(p, CURRENT_SEASON), contrib: contribOf(p), val: marketVal(p) }));

  const legal = (pkg: Player[], target: Player, candTeam: Team): boolean => {
    const sides: MultiTeamSide[] = [
      {
        team: me,
        outgoingPlayerIds: pkg.map((p) => p.id),
        playerDest: Object.fromEntries(pkg.map((p) => [p.id, candTeam.abbreviation])),
        pickDest: [],
      },
      {
        team: candTeam,
        outgoingPlayerIds: [target.id],
        playerDest: { [target.id]: myAbbr },
        pickDest: [],
      },
    ];
    return evaluateMultiTeamTrade(sides, CURRENT_SEASON).legal;
  };

  const out: NeedTargets[] = [];
  const usedTargets = new Set<string>(); // don't repeat a player across needs

  for (const need of needs) {
    // Candidate acquisitions: rotation players on other teams who fill the need.
    const candidates: { player: Player; team: Team; dpm: number; sal: number }[] = [];
    for (const t of teams) {
      if (t.abbreviation === myAbbr) continue;
      const tSalary = teamSalaryForSeason(t, CURRENT_SEASON);
      const tTier = classifyTier(tSalary, cap);
      const tRoom = cap.salaryCap - tSalary;
      for (const p of rotationPlayers(t.players)) {
        if (usedTargets.has(p.name)) continue;
        const d = darkoFor(p.name);
        if (!d || (d.dpm ?? -9) < 0.5 || !providesNeed(need.key, d)) continue;
        candidates.push({ player: p, team: t, dpm: d.dpm, sal: playerSalaryForSeason(p, CURRENT_SEASON) });
        // stash tier/room on the team via closure below (recomputed in loop)
        void tTier;
        void tRoom;
      }
    }
    candidates.sort((a, b) => b.dpm - a.dpm);

    const targets: TradeTarget[] = [];
    for (const c of candidates) {
      if (targets.length >= 6) break; // evaluate enough to fill the top 3
      const Sx = c.sal;
      const Vin = marketVal(c.player); // target's market value
      const candTier = classifyTier(teamSalaryForSeason(c.team, CURRENT_SEASON), cap);
      const candRoom = cap.salaryCap - teamSalaryForSeason(c.team, CURRENT_SEASON);

      // Legal (salary-matched both ways) AND fair (the other team gets fair
      // market value back): send between 85% and 130% of the target's value.
      const pkgs = packages(myMoves)
        .map((pk) => ({
          pk,
          sout: pk.reduce((s, m) => s + m.sal, 0),
          vout: pk.reduce((s, m) => s + m.val, 0),
          lost: pk.reduce((s, m) => s + m.contrib, 0),
        }))
        .filter(
          ({ sout, vout }) =>
            maxIncomingFor(myTier, sout, myRoom) >= Sx - 1 &&
            maxIncomingFor(candTier, Sx, candRoom) >= sout - 1 &&
            vout >= Vin * 0.85 &&
            vout <= Vin * 1.3
        )
        // Send the least on-court value while staying fair (best deal for me).
        .sort((a, b) => a.lost - b.lost);

      let picked: { outgoing: Player[]; sout: number } | null = null;
      for (const { pk, sout } of pkgs.slice(0, 5)) {
        const players = pk.map((m) => m.p);
        if (legal(players, c.player, c.team)) {
          picked = { outgoing: players, sout };
          break;
        }
      }
      if (!picked) continue;

      const kept = me.players.filter((p) => !picked!.outgoing.some((o) => o.id === p.id));
      const afterVal = rosterDpm(myAbbr, [...kept, c.player]);
      const valueGain = afterVal - baseVal;
      if (valueGain <= 0.05) continue; // only surface upgrades

      usedTargets.add(c.player.name);
      targets.push({
        incoming: c.player,
        fromTeam: c.team.abbreviation,
        incomingDpm: c.dpm,
        outgoing: picked.outgoing,
        outSalary: picked.sout,
        inSalary: Sx,
        valueGain,
        route: `Salary-matched: send ${money(picked.sout)} for ${money(Sx)}`,
      });
      if (targets.length >= 3) break;
    }

    if (targets.length) out.push({ need, targets });
  }

  return out;
}
