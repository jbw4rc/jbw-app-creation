import { useMemo, useState } from 'react';
import {
  clearTeamOverride,
  isOverridden,
  setTeamPlayers,
  useTeams,
} from '../lib/teamStore';
import { parseContractsCsv } from '../lib/importCsv';
import {
  clearSignings,
  setSignings,
  signingsCount,
  useSignings,
} from '../lib/signingsStore';
import {
  clearTradeExceptions,
  setTradeExceptions,
  tpeCount,
  useTradeExceptions,
} from '../lib/tradeExceptionsStore';
import { money, seasonLabel } from '../lib/format';
import { playerSalaryForSeason } from '../lib/apron';

// The CSV import pipeline: paste a Basketball-Reference contracts table (their
// "Get table as CSV" export), preview the parse, and apply it to a team. Applied
// data is stored locally and flows live into every other view.

export function ImportData() {
  const teams = useTeams();
  const [abbr, setAbbr] = useState(teams[0].abbreviation);
  const [csv, setCsv] = useState('');
  const [signingsText, setSigningsText] = useState('');
  const [tpeText, setTpeText] = useState('');
  useSignings(); // subscribe so the counts update live
  useTradeExceptions();
  const signingsN = signingsCount();
  const tpeN = tpeCount();

  const applySignings = () => setSignings(signingsText);
  const applyTpes = () => setTradeExceptions(tpeText);

  const parsed = useMemo(
    () => (csv.trim() ? parseContractsCsv(csv) : null),
    [csv]
  );
  const bbrefUrl = `https://www.basketball-reference.com/contracts/${abbr}.html`;
  const swishUrl = 'https://salaryswish.com/';
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
        <h2 className="import-title">Import a salary table</h2>
        <p className="import-lede">
          Paste a team's salaries from <strong>SalarySwish</strong>,{' '}
          <strong>Basketball-Reference</strong>, or any similar table. The parser
          auto-detects the format (copied cells or CSV), pulls in positions and
          ages when present, and replaces the sample data everywhere — summary,
          trade machine, and free-agent machine — saved in your browser.
        </p>
      </div>

      <ol className="import-steps">
        <li>
          Open the team's page on{' '}
          <a href={swishUrl} target="_blank" rel="noreferrer" className="import-link">
            SalarySwish
          </a>{' '}
          or{' '}
          <a href={bbrefUrl} target="_blank" rel="noreferrer" className="import-link">
            Basketball-Reference
          </a>
          {' '}(BBRef: use <strong>Share &amp; Export → Get table as CSV</strong>).
        </li>
        <li>
          Select the salary table and copy it (or copy the CSV). Include the
          header row with the season columns.
        </li>
        <li>Paste it below — it parses live — then press <strong>Apply</strong>.</li>
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
          'Paste a salary table here — copied cells (tab-separated) or CSV. e.g.\n\nPlayer,Pos,Age,2026-27,2027-28,2028-29\nJayson Tatum,SF,28,$58,456,566,$62,786,682,$67,116,798\n...'
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

      <div className="signings-section">
        <div className="import-head">
          <span className="cs-kicker">This Offseason</span>
          <h2 className="import-title">Offseason Signings</h2>
          <p className="import-lede">
            Paste the offseason signings table (with <strong>Team</strong>,{' '}
            <strong>Method</strong>, and <strong>Date</strong> columns). The app
            reads the exception each team spent — MLE, taxpayer MLE, room,
            bi-annual — and lights up “Used” in the Free Agent Quiver. Bird
            re-signings, minimums, and two-ways are ignored; only signings on or
            after June 1 count.
          </p>
        </div>
        <textarea
          className="import-textarea signings-textarea"
          value={signingsText}
          onChange={(e) => setSigningsText(e.target.value)}
          placeholder={'PLAYER\tAGE\tPOS\tTEAM\tDATE\tTYPE\tMETHOD\t...\nDe’Anthony Melton\t28\tPG\t…GSW\tJul 1, 2026\tVeteran Contract\tMLE\t…'}
          spellCheck={false}
        />
        <div className="signings-controls">
          <button className="import-apply" onClick={applySignings}>
            Apply signings
          </button>
          {signingsN > 0 && (
            <>
              <span className="signings-count">{signingsN} exceptions tracked</span>
              <button className="import-reset" onClick={clearSignings}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div className="signings-section">
        <div className="import-head">
          <span className="cs-kicker">Assets</span>
          <h2 className="import-title">Trade Exceptions</h2>
          <p className="import-lede">
            Paste the trade-exception (TPE) table (with <strong>Team</strong>,{' '}
            <strong>Player</strong>, <strong>Remaining</strong>, and{' '}
            <strong>End Date</strong> columns). Live exceptions show in each team's
            asset breakdown; expired ones are set aside automatically.
          </p>
        </div>
        <textarea
          className="import-textarea signings-textarea"
          value={tpeText}
          onChange={(e) => setTpeText(e.target.value)}
          placeholder={'TEAM\tPLAYER\tEXCEPTION\tUSED\tREMAINING\tSTART DATE\tEND DATE\n…DEN\tMichael Porter Jr.\t$17,275,985\t$10,395,000\t$6,880,985\tJul 8, 2025\tJul 8, 2026'}
          spellCheck={false}
        />
        <div className="signings-controls">
          <button className="import-apply" onClick={applyTpes}>
            Apply trade exceptions
          </button>
          {tpeN > 0 && (
            <>
              <span className="signings-count">{tpeN} exceptions loaded</span>
              <button className="import-reset" onClick={clearTradeExceptions}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
