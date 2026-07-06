import { useMemo } from 'react';
import {
  useTeams,
  useSession,
  useSelectedTeam,
  setSelectedTeam,
  getTeams,
  commitSessionMove,
  rosterStoreVersion,
} from '../lib/teamStore';
import { useMinutesVersion } from '../lib/minutesStore';
import { findTradeTargets, type TradeTarget } from '../lib/tradeTargets';
import { darkoFor } from '../lib/darko';
import { archetype } from '../lib/archetype';
import { PlayerName } from './PlayerName';
import { money } from '../lib/format';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { summarizeTeamSeason } from '../lib/apron';
import { getRosterStatus } from '../lib/teamStore';

// ---------------------------------------------------------------------------
// Trade Targets — needs-driven, cap-legal deal finder. For each of your team's
// weaknesses it surfaces fair trades (value-matched, salary-matched, both aprons
// respected) that fill it. "Propose" commits the deal to your GM session.
// ---------------------------------------------------------------------------

const netFmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

export function TradeTargets() {
  const teams = useTeams();
  const session = useSession();
  const selected = useSelectedTeam();
  const minutesVer = useMinutesVersion(); // recompute when minutes change
  const abbr = session?.myTeam ?? selected;
  const team = teams.find((t) => t.abbreviation === abbr);

  // Heavy: recompute only when the team or the rosters/minutes change.
  const groups = useMemo(
    () => findTradeTargets(abbr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abbr, rosterStoreVersion(), minutesVer]
  );

  const propose = (t: TradeTarget) => {
    const all = getTeams();
    const from = all.find((x) => x.abbreviation === t.fromTeam);
    const mine = all.find((x) => x.abbreviation === abbr);
    if (!from || !mine) return;
    const outIds = new Set(t.outgoing.map((p) => p.id));
    const rosterChanges: Record<string, import('../types').Player[]> = {
      [abbr]: [...mine.players.filter((p) => p.id !== t.incoming.id && !outIds.has(p.id)), t.incoming],
      [t.fromTeam]: [...from.players.filter((p) => p.id !== t.incoming.id), ...t.outgoing],
    };
    const summary = `${abbr} ← ${t.incoming.name} · ${t.fromTeam} ← ${t.outgoing.map((p) => p.name).join(', ')}`;
    commitSessionMove(rosterChanges, { kind: 'trade', summary, teams: [abbr, t.fromTeam] }, abbr);
  };

  return (
    <div className="trade-targets">
      <div className="tt-head">
        <span className="cs-kicker">Trade Targets</span>
        <h2 className="tt-title">Fill {team?.name ?? abbr}'s needs</h2>
        <p className="tt-lede">
          Cap- and apron-legal trades that address your rotation's weak spots, priced at fair
          market value so the other side would actually say yes. Propose one and it lands in your
          GM session.
        </p>
      </div>

      {!session && (
        <div className="team-picker tt-picker">
          {teams.map((t) => {
            const s = summarizeTeamSeason(t, CURRENT_SEASON);
            return (
              <button
                key={t.abbreviation}
                className={`team-chip tier-border-${s.tier}${t.abbreviation === abbr ? ' active' : ''}`}
                onClick={() => setSelectedTeam(t.abbreviation)}
              >
                <span className="chip-abbr">{t.abbreviation}</span>
                {getRosterStatus(t.abbreviation).imported && <span className="chip-imported">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="tt-empty">
          No pressing needs with a clean, fair deal available. Either this roster is well-rounded,
          or the holes can't be filled without overpaying — try the rotation or a free agent instead.
        </div>
      ) : (
        <div className="tt-groups">
          {groups.map((g) => (
            <div className="tt-group" key={g.need.key}>
              <div className="tt-group-head">
                <span className={`tt-need-dot tt-${g.need.severity}`} aria-hidden />
                <span className="tt-need-label">{g.need.label}</span>
                <span className="tt-need-tag">{g.need.severity === 'critical' ? 'critical' : 'watch'}</span>
                <span className="tt-need-detail">{g.need.detail}</span>
              </div>

              <div className="tt-cards">
                {g.targets.map((t) => {
                  const d = darkoFor(t.incoming.name);
                  const arch = archetype(d);
                  return (
                    <div className="tt-card" key={t.incoming.id}>
                      <div className="tt-card-top">
                        <div className="tt-get">
                          <span className="tt-get-label">Acquire</span>
                          <PlayerName name={t.incoming.name} className="tt-get-name" />
                          <span className="tt-get-meta">
                            {t.fromTeam}
                            {arch && <span className="tt-arch">{arch}</span>}
                            <span className={t.incomingDpm >= 0 ? 'rp-pos' : 'rp-neg'}>
                              {' '}
                              {netFmt(t.incomingDpm)} DPM
                            </span>
                          </span>
                        </div>
                        <div className="tt-gain">
                          <span className="tt-gain-val">{netFmt(t.valueGain)}</span>
                          <span className="tt-gain-label">team value</span>
                        </div>
                      </div>
                      <div className="tt-send">
                        <span className="tt-send-label">Send</span>
                        <span className="tt-send-players">
                          {t.outgoing.map((p, i) => (
                            <span key={p.id}>
                              {i > 0 && ', '}
                              <PlayerName name={p.name} />
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className="tt-card-foot">
                        <span className="tt-route">
                          ✓ Legal · out {money(t.outSalary)} / in {money(t.inSalary)}
                        </span>
                        <button className="tt-propose" onClick={() => propose(t)}>
                          Propose
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="tt-foot">
        Value is DARKO market value; legality is checked by the same engine as the Trade Machine
        (salary matching + both aprons). Draft picks aren't part of these packages yet — add them
        in the Trade Machine to balance a deal.
      </p>
    </div>
  );
}
