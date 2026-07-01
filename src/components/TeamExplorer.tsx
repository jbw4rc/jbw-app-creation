import { useState } from 'react';
import { getRosterStatus, useTeams } from '../lib/teamStore';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { summarizeTeamSeason } from '../lib/apron';
import { CapSummary } from './CapSummary';
import { SalaryTimeline } from './SalaryTimeline';
import { RestrictionPanel } from './RestrictionPanel';
import { FreeAgentQuiver } from './FreeAgentQuiver';
import { DraftCapital } from './DraftCapital';
import { TradeExceptions } from './TradeExceptions';
import { RosterTable } from './RosterTable';

// Read-only analysis of a single team: where its salary sits now and across the
// horizon, what apron restrictions apply, its picks, and the full roster.

export function TeamExplorer() {
  const teams = useTeams();
  const [abbr, setAbbr] = useState(teams[0].abbreviation);
  const team = teams.find((t) => t.abbreviation === abbr) ?? teams[0];
  const summary = summarizeTeamSeason(team, CURRENT_SEASON);

  return (
    <div className="explorer">
      <div className="team-picker">
        {teams.map((t) => {
          const s = summarizeTeamSeason(t, CURRENT_SEASON);
          return (
            <button
              key={t.abbreviation}
              className={`team-chip tier-border-${s.tier}${
                t.abbreviation === abbr ? ' active' : ''
              }`}
              onClick={() => setAbbr(t.abbreviation)}
            >
              <span className="chip-abbr">{t.abbreviation}</span>
              {getRosterStatus(t.abbreviation).imported && (
                <span className="chip-imported" title="Imported data">✓</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="explorer-grid">
        <section className="panel span-4">
          <CapSummary team={team} />
        </section>

        <section className="panel span-4">
          <SalaryTimeline team={team} />
        </section>

        <section className="panel span-2">
          <RestrictionPanel tier={summary.tier} />
        </section>

        <section className="panel span-2">
          <FreeAgentQuiver team={team} />
        </section>

        <section className="panel span-2">
          <DraftCapital team={team} />
        </section>

        <section className="panel span-2">
          <TradeExceptions team={team} />
        </section>

        <section className="panel span-4">
          <RosterTable team={team} />
        </section>
      </div>
    </div>
  );
}
