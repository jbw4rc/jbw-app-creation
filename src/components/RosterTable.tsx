import type { ContractOption, Player, Team } from '../types';
import { SEASONS } from '../data/leagueConstants';
import { playerSalaryForSeason, teamSalaryForSeason } from '../lib/apron';
import { money, seasonLabel } from '../lib/format';

// Roster grid: one row per player, one column per season in the horizon, with
// option types color-coded and per-season team totals in the footer.

const OPTION_ABBR: Record<ContractOption, string> = {
  guaranteed: '',
  team: 'TO',
  player: 'PO',
  nonGuaranteed: 'NG',
  ufa: 'UFA',
  rfa: 'RFA',
};

function cellFor(player: Player, season: number) {
  const year = player.contract.find((c) => c.season === season);
  if (!year) return <span className="cell-empty">—</span>;
  if (year.option === 'ufa' || year.option === 'rfa') {
    return <span className={`cell-fa fa-${year.option}`}>{OPTION_ABBR[year.option]}</span>;
  }
  const tag = OPTION_ABBR[year.option];
  return (
    <span className="cell-salary">
      {money(year.salary)}
      {tag && <span className={`opt-tag opt-${year.option}`}>{tag}</span>}
    </span>
  );
}

export function RosterTable({ team }: { team: Team }) {
  const sorted = [...team.players].sort(
    (a, b) =>
      playerSalaryForSeason(b, SEASONS[0]) - playerSalaryForSeason(a, SEASONS[0])
  );

  return (
    <div className="roster-wrap">
      <table className="roster-table">
        <thead>
          <tr>
            <th className="col-player">Player</th>
            <th className="col-pos">Pos</th>
            {SEASONS.map((s) => (
              <th key={s} className="col-season">
                {seasonLabel(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td className="col-player">
                <span className="player-name">{p.name}</span>
                {p.twoWay && <span className="player-tw" title="Two-way (does not count against the cap)">TW</span>}
                {p.age > 0 && <span className="player-age">{p.age}</span>}
              </td>
              <td className="col-pos">{p.position}</td>
              {SEASONS.map((s) => (
                <td key={s} className="col-season">
                  {cellFor(p, s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="col-player">Team Total</td>
            <td className="col-pos" />
            {SEASONS.map((s) => (
              <td key={s} className="col-season total-cell">
                {money(teamSalaryForSeason(team, s))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <div className="roster-key">
        <span><i className="dot opt-player" /> PO player option</span>
        <span><i className="dot opt-team" /> TO team option</span>
        <span><i className="dot fa-ufa" /> UFA</span>
        <span><i className="dot fa-rfa" /> RFA</span>
      </div>
    </div>
  );
}
