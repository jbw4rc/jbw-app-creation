import { useMemo, useState } from 'react';
import { SEEDED_STATS } from '../data/seededStats';
import { SEEDED_DARKO } from '../data/seededDarko';
import { STAT_COLUMNS, type PlayerStats, type StatColumn } from '../data/statsTypes';
import { useTeams } from '../lib/teamStore';

// A FanGraphs-style advanced-stats viewer: a sortable league leaderboard and a
// per-team split. Box/advanced/value stats come from the Basketball-Reference
// seed; DARKO Daily Plus-Minus is joined by name from darko.app. Both auto-pull.

type Mode = 'leaderboard' | 'team';
type Group = 'all' | 'darko' | 'box' | 'advanced' | 'value';

// Join key: lowercase, no accents/punctuation, suffixes dropped (matches the DARKO seed).
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Stats rows augmented with DARKO DPM (once, at module load).
const ROWS: PlayerStats[] = SEEDED_STATS.players.map((p) => {
  const d = SEEDED_DARKO[norm(p.name)];
  return d ? { ...p, dpm: d.dpm, odpm: d.odpm, ddpm: d.ddpm } : p;
});

const IDENTITY_COLS: { key: keyof PlayerStats; label: string; title: string }[] = [
  { key: 'age', label: 'Age', title: 'Age' },
  { key: 'g', label: 'G', title: 'Games played' },
  { key: 'mpg', label: 'MPG', title: 'Minutes per game' },
];

function fmt(p: PlayerStats, col: StatColumn): string {
  const v = p[col.key] as number;
  if (v == null || Number.isNaN(v)) return '—';
  if (col.percent) return (v * 100).toFixed(col.decimals);
  return v.toFixed(col.decimals);
}

export function StatsExplorer() {
  const bundle = SEEDED_STATS;
  const teams = useTeams();
  const [mode, setMode] = useState<Mode>('leaderboard');
  const [group, setGroup] = useState<Group>('darko');
  const [teamAbbr, setTeamAbbr] = useState('DEN');
  const [query, setQuery] = useState('');
  const [minGames, setMinGames] = useState(20);
  const [sortKey, setSortKey] = useState<keyof PlayerStats>('dpm');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const cols = useMemo(
    () => STAT_COLUMNS.filter((c) => group === 'all' || c.group === group),
    [group]
  );

  const rows = useMemo(() => {
    let list = ROWS;
    if (mode === 'team') {
      list = list.filter((p) => p.teams.includes(teamAbbr) || p.team === teamAbbr);
    } else {
      list = list.filter((p) => p.g >= minGames);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey] as number | string | null | undefined;
      const bv = b[sortKey] as number | string | null | undefined;
      // Missing values (e.g. no DARKO match) always sort last.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  }, [bundle.players, mode, teamAbbr, query, minGames, sortKey, sortDir]);

  const sortBy = (key: keyof PlayerStats, higherBetter = true) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(higherBetter ? 'desc' : 'asc');
    }
  };

  return (
    <div className="stats-explorer">
      <div className="stats-head">
        <div>
          <span className="cs-kicker">Advanced Stats</span>
          <h2 className="stats-title">
            {bundle.seasonLabel} · Regular Season
          </h2>
          <span className="stats-sub">
            {bundle.players.length} players · source {bundle.source}
          </span>
        </div>
        <div className="stats-modes">
          <button
            className={`seg${mode === 'leaderboard' ? ' on' : ''}`}
            onClick={() => setMode('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`seg${mode === 'team' ? ' on' : ''}`}
            onClick={() => setMode('team')}
          >
            By Team
          </button>
        </div>
      </div>

      <div className="stats-controls">
        {mode === 'team' ? (
          <label className="stats-field">
            <span>Team</span>
            <select value={teamAbbr} onChange={(e) => setTeamAbbr(e.target.value)}>
              {teams.map((t) => (
                <option key={t.abbreviation} value={t.abbreviation}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="stats-field">
            <span>Min games</span>
            <select value={minGames} onChange={(e) => setMinGames(Number(e.target.value))}>
              {[0, 10, 20, 30, 40, 50, 58].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="stats-field">
          <span>Columns</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            <option value="darko">DARKO DPM</option>
            <option value="advanced">Advanced</option>
            <option value="value">Value (BPM/WS/VORP)</option>
            <option value="box">Box score</option>
            <option value="all">All</option>
          </select>
        </label>

        <label className="stats-field stats-search">
          <span>Search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Player name…"
            spellCheck={false}
          />
        </label>
        <span className="stats-count">{rows.length} shown</span>
      </div>

      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-name sortable" onClick={() => sortBy('name', false)}>
                Player{sortArrow(sortKey === 'name', sortDir)}
              </th>
              <th className="col-team sortable" onClick={() => sortBy('team', false)}>
                Tm
              </th>
              <th className="col-pos">Pos</th>
              {IDENTITY_COLS.map((c) => (
                <th
                  key={c.key}
                  className="col-num sortable"
                  title={c.title}
                  onClick={() => sortBy(c.key)}
                >
                  {c.label}
                  {sortArrow(sortKey === c.key, sortDir)}
                </th>
              ))}
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="col-num sortable"
                  title={c.title}
                  onClick={() => sortBy(c.key, c.higherBetter !== false)}
                >
                  {c.label}
                  {sortArrow(sortKey === c.key, sortDir)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id}>
                <td className="col-rank">{i + 1}</td>
                <td className="col-name">
                  <a
                    href={`https://www.basketball-reference.com/players/${p.id[0]}/${p.id}.html`}
                    target="_blank"
                    rel="noreferrer"
                    className="stats-player-link"
                  >
                    {p.name}
                  </a>
                </td>
                <td className="col-team">
                  {p.team}
                  {p.teams.length > 1 && <span className="stats-multi" title={p.teams.join(', ')}> *</span>}
                </td>
                <td className="col-pos">{p.pos}</td>
                <td className="col-num">{p.age || '—'}</td>
                <td className="col-num">{p.g}</td>
                <td className="col-num">{p.mpg.toFixed(1)}</td>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`col-num${sortKey === c.key ? ' col-sorted' : ''}`}
                  >
                    {fmt(p, c)}
                    {c.percent ? '' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="stats-empty">No players match.</div>}
      </div>
      <p className="stats-foot">
        DPM / O-DPM / D-DPM are DARKO Daily Plus-Minus (darko.app); box &amp;
        advanced stats are Basketball-Reference. Percentages shown ×100. Traded
        players show their full-season combined line (
        <span className="stats-multi">*</span> = multiple teams).
      </p>
    </div>
  );
}

function sortArrow(active: boolean, dir: 'asc' | 'desc') {
  if (!active) return null;
  return <span className="sort-arrow"> {dir === 'asc' ? '▲' : '▼'}</span>;
}
