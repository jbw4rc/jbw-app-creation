import { useMemo, useState } from 'react';
import type { ContractOption, Player, Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { capGrowth, retentionFactor } from '../lib/contract';
import { darkoFor } from '../lib/darko';
import { positionGroup, type PosGroup } from '../lib/position';
import { money, seasonLabel } from '../lib/format';

// Forward-looking roster explorer (Team Financials): pick a season and see each
// player's projected line — age, that year's salary, and DARKO value / surplus /
// DPM aged forward. Minutes allocation lives in the Rotation Builder tab.
//
// Projection basis (consistent with the Trade Machine):
//   value_year  = DARKO value × aging retention × cap growth
//   surplus     = value_year − that year's salary
//   DPM/O/D     = current × aging retention

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

type PosFilter = 'all' | PosGroup;

interface ProjRow {
  player: Player;
  option: ContractOption;
  position: string;
  age: number | null;
  salary: number; // nominal $ that season
  value: number | null; // $M projected market value
  surplus: number | null; // $M
  dpm: number | null;
  odpm: number | null;
  ddpm: number | null;
  matched: boolean;
}

type SortKey = 'name' | 'age' | 'salary' | 'value' | 'surplus' | 'dpm' | 'odpm' | 'ddpm';

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
      position: p.position || '—',
      age: baseAge != null ? Math.round(baseAge + k) : null,
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
const surFmt = (n: number | null) =>
  n == null ? '—' : `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(1)}M`;

export function RosterProjection({ team }: { team: Team }) {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [posFilter, setPosFilter] = useState<PosFilter>('all');

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

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          posFilter === 'all' ||
          positionGroup(r.player.position, undefined, darkoFor(r.player.name)?.pos) === posFilter
      ),
    [rows, posFilter]
  );

  const totals = useMemo(() => {
    const salary = shown.reduce((s, r) => s + r.salary, 0);
    const value = shown.reduce((s, r) => s + (r.value ?? 0), 0);
    const surplus = shown.reduce((s, r) => s + (r.surplus ?? 0), 0);
    return { salary, value, surplus, count: shown.length };
  }, [shown]);

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
        <div className="rp-controls">
          <label className="rp-year">
            <span>Position</span>
            <select value={posFilter} onChange={(e) => setPosFilter(e.target.value as PosFilter)}>
              <option value="all">All</option>
              <option value="G">Guards</option>
              <option value="F">Forwards</option>
              <option value="C">Centers</option>
            </select>
          </label>
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
      </div>

      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead>
            <tr>
              <th className="rp-name sortable" onClick={() => sortBy('name', false)}>
                Player {arrow('name')}
              </th>
              <th title="Position">Pos</th>
              <th className="sortable" onClick={() => sortBy('age')} title="Age that season">
                Age {arrow('age')}
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
            {shown.map((r) => {
              const tag = OPTION_ABBR[r.option];
              return (
                <tr key={r.player.id}>
                  <td className="rp-name">
                    {r.player.name}
                    {tag && <span className={`opt-tag opt-${r.option}`}>{tag}</span>}
                    {!r.matched && <span className="rp-nomatch" title="No DARKO match"> ~</span>}
                  </td>
                  <td className="rp-poscell">{r.position}</td>
                  <td>{r.age ?? '—'}</td>
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="rp-empty">
                  {rows.length ? 'No players match this position filter.' : 'No players under contract this season.'}
                </td>
              </tr>
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td className="rp-name">{totals.count} shown</td>
                <td />
                <td />
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
          ? 'Current season — DARKO live values. Allocate minutes in the Rotation Builder tab.'
          : `Projected ${k} year${k > 1 ? 's' : ''} out: value aged by the empirical DARKO curve (pre-peak players can appreciate, veterans decline) and grown with the cap; DPM aged the same way. Salary is the contracted figure.`}
      </p>
    </div>
  );
}
