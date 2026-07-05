import { useMemo, useState } from 'react';
import type { ContractOption, Player, Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { capGrowth, retentionFactor } from '../lib/contract';
import { darkoFor } from '../lib/darko';
import { money, seasonLabel } from '../lib/format';

// Forward-looking roster explorer: pick a season and see each player's projected
// line — age, that year's salary, and DARKO value / surplus / DPM aged forward.
//
// Projection basis (consistent with the Trade Machine):
//   value_year  = DARKO value × aging retention (DARKO's per-player curve) × cap growth
//   surplus     = value_year − that year's salary
//   DPM/O/D     = current × aging retention
// Year 1 (current season) is DARKO's live number (retention = 1, cap growth = 1).

const OPTION_ABBR: Record<ContractOption, string> = {
  guaranteed: '',
  team: 'TO',
  player: 'PO',
  nonGuaranteed: 'NG',
  ufa: 'UFA',
  rfa: 'RFA',
};

// Seasons offered in the dropdown (covers the contract horizon).
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_SEASON + i);

interface ProjRow {
  player: Player;
  option: ContractOption;
  age: number | null;
  min: number | null; // DARKO projected minutes per game (current season only)
  salary: number; // nominal $ that season
  value: number | null; // $M projected market value
  surplus: number | null; // $M
  dpm: number | null;
  odpm: number | null;
  ddpm: number | null;
  matched: boolean;
}

type SortKey = 'name' | 'age' | 'min' | 'salary' | 'value' | 'surplus' | 'dpm' | 'odpm' | 'ddpm';

function buildRows(team: Team, season: number): ProjRow[] {
  const k = season - CURRENT_SEASON;
  const cg = capGrowth(season);
  const rows: ProjRow[] = [];
  for (const p of team.players) {
    const cy = p.contract.find((c) => c.season === season);
    // On the books only: has a salaried year that isn't a free-agent placeholder.
    if (!cy || cy.option === 'ufa' || cy.option === 'rfa' || cy.salary <= 0) continue;
    if (p.twoWay) continue; // two-way deals don't count toward the roster
    const d = darkoFor(p.name);
    const baseAge = d?.age ?? p.age;
    const ret = retentionFactor(baseAge, k, d?.decline, d?.dpm);
    const value = d?.value != null ? d.value * ret * cg : null;
    rows.push({
      player: p,
      option: cy.option,
      age: baseAge != null ? Math.round(baseAge + k) : null,
      // DARKO projects a single (current-season) minutes figure; we don't
      // forecast future-year minutes, so it's shown only for the current year.
      min: k === 0 ? d?.min ?? null : null,
      salary: cy.salary,
      value,
      surplus: value != null ? value - cy.salary / 1_000_000 : null,
      dpm: d?.dpm != null ? d.dpm * ret : null,
      odpm: d?.odpm != null ? d.odpm * ret : null,
      ddpm: d?.ddpm != null ? d.ddpm * ret : null,
      matched: d != null,
    });
  }
  return rows;
}

const dpmFmt = (n: number | null) =>
  n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
const mFmt = (n: number | null) => (n == null ? '—' : `$${n.toFixed(1)}M`);
const minFmt = (n: number | null) => (n == null ? '—' : n.toFixed(1));
const surFmt = (n: number | null) =>
  n == null ? '—' : `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(1)}M`;

export function RosterProjection({ team }: { team: Team }) {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const list = buildRows(team, season);
    const d = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === 'name') return a.player.name.localeCompare(b.player.name) * d;
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      return (av - bv) * d;
    });
  }, [team, season, sortKey, dir]);

  const totals = useMemo(() => {
    const salary = rows.reduce((s, r) => s + r.salary, 0);
    const value = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    const surplus = rows.reduce((s, r) => s + (r.surplus ?? 0), 0);
    const min = rows.reduce((s, r) => s + (r.min ?? 0), 0);
    return { salary, value, surplus, min, count: rows.length };
  }, [rows]);

  const sortBy = (key: SortKey, higherFirst = true) => {
    if (sortKey === key) setDir((x) => (x === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDir(higherFirst ? 'desc' : 'asc');
    }
  };

  const k = season - CURRENT_SEASON;
  const arrow = (key: SortKey) =>
    sortKey === key ? <span className="rp-arrow">{dir === 'asc' ? '▲' : '▼'}</span> : null;

  return (
    <div className="roster-proj">
      <div className="rp-head">
        <div>
          <span className="cs-kicker">Projected Roster</span>
          <h3 className="rp-title">Explore the roster by year</h3>
        </div>
        <label className="rp-year">
          <span>Season</span>
          <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {seasonLabel(y)}
                {y === CURRENT_SEASON ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead>
            <tr>
              <th className="rp-name sortable" onClick={() => sortBy('name', false)}>
                Player {arrow('name')}
              </th>
              <th className="sortable" onClick={() => sortBy('age')} title="Age that season">
                Age {arrow('age')}
              </th>
              <th className="sortable" onClick={() => sortBy('min')} title="DARKO projected minutes per game (current season)">
                Min {arrow('min')}
              </th>
              <th className="sortable" onClick={() => sortBy('salary')} title="Cap hit that season">
                Salary {arrow('salary')}
              </th>
              <th className="sortable" onClick={() => sortBy('value')} title="Projected DARKO market value (aged, cap-adjusted)">
                Proj Value {arrow('value')}
              </th>
              <th className="sortable" onClick={() => sortBy('surplus')} title="Projected value minus salary">
                Surplus {arrow('surplus')}
              </th>
              <th className="sortable" onClick={() => sortBy('dpm')} title="Projected DARKO Daily Plus-Minus">
                DPM {arrow('dpm')}
              </th>
              <th className="sortable" onClick={() => sortBy('odpm')} title="Projected offensive DPM">
                O-DPM {arrow('odpm')}
              </th>
              <th className="sortable" onClick={() => sortBy('ddpm')} title="Projected defensive DPM">
                D-DPM {arrow('ddpm')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tag = OPTION_ABBR[r.option];
              return (
                <tr key={r.player.id}>
                  <td className="rp-name">
                    {r.player.name}
                    {tag && <span className={`opt-tag opt-${r.option}`}>{tag}</span>}
                    {!r.matched && <span className="rp-nomatch" title="No DARKO match"> ~</span>}
                  </td>
                  <td>{r.age ?? '—'}</td>
                  <td>{minFmt(r.min)}</td>
                  <td>{money(r.salary)}</td>
                  <td>{mFmt(r.value)}</td>
                  <td className={r.surplus == null ? '' : r.surplus >= 0 ? 'rp-pos' : 'rp-neg'}>
                    {surFmt(r.surplus)}
                  </td>
                  <td className={r.dpm == null ? '' : r.dpm >= 0 ? 'rp-pos' : 'rp-neg'}>{dpmFmt(r.dpm)}</td>
                  <td>{dpmFmt(r.odpm)}</td>
                  <td>{dpmFmt(r.ddpm)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="rp-empty">No players under contract this season.</td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="rp-name">{totals.count} on the books</td>
                <td />
                <td title={k === 0 ? 'Sum of projected minutes; a game has 240 to allocate' : undefined}>
                  {k === 0 && totals.min > 0 ? `${totals.min.toFixed(0)}/240` : ''}
                </td>
                <td>{money(totals.salary)}</td>
                <td>{mFmt(totals.value)}</td>
                <td className={totals.surplus >= 0 ? 'rp-pos' : 'rp-neg'}>{surFmt(totals.surplus)}</td>
                <td />
                <td />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="rp-foot">
        {k === 0
          ? 'Current season — DARKO live values. Min is DARKO’s projected minutes per game (its current-season role; not re-forecast for offseason moves).'
          : `Projected ${k} year${k > 1 ? 's' : ''} out: value aged by the empirical DARKO curve (pre-peak players can appreciate, veterans decline) and grown with the cap; DPM aged the same way. Minutes aren’t projected for future years. Salary is the contracted figure.`}
      </p>
    </div>
  );
}
