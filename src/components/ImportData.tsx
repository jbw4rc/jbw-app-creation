import { useMemo, useState } from 'react';
import {
  clearTeamOverride,
  isOverridden,
  setTeamPlayers,
  useTeams,
} from '../lib/teamStore';
import { parseContractsCsv } from '../lib/importCsv';
import { money, seasonLabel } from '../lib/format';
import { playerSalaryForSeason } from '../lib/apron';

// The CSV import pipeline: paste a Basketball-Reference contracts table (their
// "Get table as CSV" export), preview the parse, and apply it to a team. Applied
// data is stored locally and flows live into every other view.

export function ImportData() {
  const teams = useTeams();
  const [abbr, setAbbr] = useState(teams[0].abbreviation);
  const [csv, setCsv] = useState('');

  const parsed = useMemo(
    () => (csv.trim() ? parseContractsCsv(csv) : null),
    [csv]
  );
  const bbrefUrl = `https://www.basketball-reference.com/contracts/${abbr}.html`;
  const canApply = parsed !== null && parsed.players.length > 0;
  const previewSeasons = parsed?.seasons.slice(0, 6) ?? [];

  const apply = () => {
    if (!parsed || parsed.players.length === 0) return;
    setTeamPlayers(abbr, parsed.players);
    setCsv('');
  };

  return (
    <div className="import">
      <div className="import-head">
        <span className="cs-kicker">Data Pipeline</span>
        <h2 className="import-title">Import from Basketball-Reference</h2>
        <p className="import-lede">
          Paste a team's contracts table and it replaces the sample data
          everywhere — summary, trade machine, and free-agent machine — and is
          saved in your browser.
        </p>
      </div>

      <ol className="import-steps">
        <li>
          Pick a team and open its Basketball-Reference contracts page:{' '}
          <a href={bbrefUrl} target="_blank" rel="noreferrer" className="import-link">
            {bbrefUrl}
          </a>
        </li>
        <li>
          On that page, use <strong>Share &amp; Export → Get table as CSV</strong> on
          the salary table, then copy the CSV it shows.
        </li>
        <li>Paste it below and press <strong>Parse</strong>, then <strong>Apply</strong>.</li>
      </ol>

      <div className="import-controls">
        <label className="fa-field">
          <span>Apply to team</span>
          <select value={abbr} onChange={(e) => setAbbr(e.target.value)}>
            {teams.map((t) => (
              <option key={t.abbreviation} value={t.abbreviation}>
                {t.name}
                {isOverridden(t.abbreviation) ? ' — imported' : ''}
              </option>
            ))}
          </select>
        </label>
        {isOverridden(abbr) && (
          <button className="import-reset" onClick={() => clearTeamOverride(abbr)}>
            Reset {abbr} to sample data
          </button>
        )}
      </div>

      <textarea
        className="import-textarea"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={
          'Paste Basketball-Reference contracts CSV here, e.g.\n\nPlayer,2025-26,2026-27,2027-28\nJayson Tatum,$54,126,450,$58,456,566,$62,786,682\n...'
        }
        spellCheck={false}
      />

      {parsed && (
        <div className="import-preview">
          <div className="import-preview-head">
            <span>
              Parsed <strong>{parsed.players.length}</strong> player
              {parsed.players.length !== 1 ? 's' : ''}
              {parsed.seasons.length > 0 && (
                <> · seasons {parsed.seasons.map((s) => seasonLabel(s)).join(', ')}</>
              )}
            </span>
            <button className="import-apply" onClick={apply} disabled={!canApply}>
              Apply to {abbr}
            </button>
          </div>

          {parsed.players.length > 0 && (
            <div className="roster-wrap">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th className="col-player">Player</th>
                    {previewSeasons.map((s) => (
                      <th key={s} className="col-season">
                        {seasonLabel(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.players.map((p) => (
                    <tr key={p.id}>
                      <td className="col-player">
                        <span className="player-name">{p.name}</span>
                      </td>
                      {previewSeasons.map((s) => {
                        const sal = playerSalaryForSeason(p, s);
                        return (
                          <td key={s} className="col-season">
                            {sal > 0 ? money(sal) : <span className="cell-empty">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parsed.warnings.map((w, i) => (
            <div key={i} className="import-warning">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
