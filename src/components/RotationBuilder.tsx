import { useEffect, useMemo, useState } from 'react';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { summarizeTeamSeason } from '../lib/apron';
import { darkoFor } from '../lib/darko';
import { getRosterStatus, useTeams, useSelectedTeam, setSelectedTeam } from '../lib/teamStore';
import {
  TOTAL_ROTATION_MINUTES,
  allocation,
  rotationPlayers,
  seedMinutes,
  setMinutes,
  setTeamMinutes,
  resetTeamMinutes,
  hasMinuteOverrides,
  useMinutesVersion,
} from '../lib/minutesStore';
import { rankForDpm, tierForRank, TIER_META } from '../lib/teamTalent';
import { positionGroup, POSITION_TARGETS, POS_LABEL, POS_ORDER, type PosGroup } from '../lib/position';
import { archetype } from '../lib/archetype';
import { rookieInfo } from '../lib/rookies';
import { diagnoseLineup } from '../lib/lineupDiagnostics';
import { optimizeRotation, type OptimizeResult } from '../lib/optimizeRotation';
import { PlayerName } from './PlayerName';

// ---------------------------------------------------------------------------
// Rotation Builder: hand out a team's 240 game-minutes (current season) and see
// exactly how the allocation moves team value (DARKO net rating) and league /
// conference rank versus the DARKO baseline. Big steppers, minimal text.
// ---------------------------------------------------------------------------

const netFmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
const CONF_SIZE = 15;

interface Row {
  id: string;
  name: string;
  pos: string;
  grp: PosGroup | null;
  arch: string | null;
  dpm: number | null;
  min: number;
  contrib: number; // dpm × min/48 — this player's share of team net rating
}

type SortKey = 'min' | 'dpm' | 'name' | 'pos';
const SORT_LABEL: Record<SortKey, string> = { min: 'Minutes', dpm: 'DPM', name: 'Name', pos: 'Position' };
const GROUP_ORDER: Record<string, number> = { G: 0, F: 1, C: 2 };

export function RotationBuilder() {
  const teams = useTeams();
  useMinutesVersion(); // re-render on edits
  const abbr = useSelectedTeam();
  const team = teams.find((t) => t.abbreviation === abbr) ?? teams[0];
  const [sortKey, setSortKey] = useState<SortKey>('min');
  const [sortNonce, setSortNonce] = useState(0);
  const [preview, setPreview] = useState<OptimizeResult | null>(null);
  // Drop any pending optimize preview when the team changes.
  useEffect(() => setPreview(null), [abbr]);

  const rotation = useMemo(() => rotationPlayers(team.players), [team]);
  const seed = useMemo(() => seedMinutes(rotation), [rotation]);
  const mins = allocation(abbr, rotation);

  // Live per-player data (values update as you edit).
  const rows: Row[] = rotation.map((p) => {
    const d = darkoFor(p.name);
    const min = mins[p.id] ?? 0;
    const rook = rookieInfo(p);
    const dpm = d?.dpm ?? rook?.dpm ?? null;
    return {
      id: p.id,
      name: p.name,
      pos: p.position || '—',
      grp: positionGroup(p.position, d?.posNum, d?.pos),
      arch: archetype(d) ?? rook?.label ?? null,
      dpm,
      min,
      contrib: (dpm ?? 0) * (min / 48),
    };
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  // Frozen display order: only re-sorted on an explicit sort (or team change),
  // NOT while minutes are edited — so rows don't jump around as you adjust.
  const order = useMemo(() => {
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      min: (a, b) => b.min - a.min,
      dpm: (a, b) => (b.dpm ?? -99) - (a.dpm ?? -99),
      name: (a, b) => a.name.localeCompare(b.name),
      pos: (a, b) =>
        (GROUP_ORDER[a.grp ?? 'F'] - GROUP_ORDER[b.grp ?? 'F']) ||
        b.min - a.min,
    };
    return [...rows].sort(cmp[sortKey]).map((r) => r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abbr, rotation, sortKey, sortNonce]);
  const orderedRows = order.map((id) => rowById.get(id)).filter((r): r is Row => !!r);

  const allocated = rows.reduce((s, r) => s + r.min, 0);
  const remaining = TOTAL_ROTATION_MINUTES - allocated;

  // Minutes by position vs the conventional 2G / 2F / 1C targets.
  const posTotals: Record<PosGroup, number> = { G: 0, F: 0, C: 0 };
  let posUnknown = 0;
  for (const r of rows) {
    const g = r.grp;
    if (g) posTotals[g] += r.min;
    else posUnknown += r.min;
  }

  // Team value now vs the DARKO baseline (seed allocation), and the rank each slots into.
  const currentDpm = rows.reduce((s, r) => s + r.contrib, 0);
  const baselineDpm = rotation.reduce(
    (s, p) => s + (darkoFor(p.name)?.dpm ?? 0) * ((seed[p.id] ?? 0) / 48),
    0
  );
  const cur = rankForDpm(abbr, currentDpm);
  const base = rankForDpm(abbr, baselineDpm);
  const tier = tierForRank(cur.overall);
  const conf = team.conference;
  const valDelta = currentDpm - baselineDpm;
  const rankDelta = base.overall - cur.overall; // >0 = climbed
  const edited = hasMinuteOverrides(abbr);

  // Structural flags (spacing, rim protection, playmaking, shot distribution,
  // rebounding) — kept entirely separate from the DPM talent number above.
  const diag = diagnoseLineup(rotation, mins);

  // Cap the total at 240: a player can rise only into the minutes still free.
  const setMin = (id: string, next: number) => {
    const curMin = mins[id] ?? 0;
    const headroom = TOTAL_ROTATION_MINUTES - (allocated - curMin);
    setMinutes(abbr, id, Math.max(0, Math.min(48, Math.min(next, headroom))));
  };

  // Optimize preview data (rank & flag/minute deltas vs the current allocation).
  const pvBeforeRank = preview ? rankForDpm(abbr, preview.before.dpm) : null;
  const pvAfterRank = preview ? rankForDpm(abbr, preview.after.dpm) : null;
  const pvValDelta = preview ? preview.after.dpm - preview.before.dpm : 0;
  const pvRankDelta = preview && pvBeforeRank && pvAfterRank ? pvBeforeRank.overall - pvAfterRank.overall : 0;
  const pvFlagChanges = preview
    ? preview.after.flags
        .map((f, i) => ({ f, b: preview.before.flags[i] }))
        .filter((x) => x.b.level !== x.f.level)
    : [];
  const pvMovers = preview
    ? rotation
        .map((p) => ({ name: p.name, delta: (preview.minutes[p.id] ?? 0) - (mins[p.id] ?? 0) }))
        .filter((x) => x.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];
  const applyPreview = () => {
    if (preview) setTeamMinutes(abbr, preview.minutes);
    setPreview(null);
  };
  const LEVEL_RANK: Record<string, number> = { alert: 0, watch: 1, good: 2 };

  return (
    <div className="rotation-builder">
      <div className="team-picker">
        {teams.map((t) => {
          const s = summarizeTeamSeason(t, CURRENT_SEASON);
          return (
            <button
              key={t.abbreviation}
              className={`team-chip tier-border-${s.tier}${t.abbreviation === abbr ? ' active' : ''}`}
              onClick={() => setSelectedTeam(t.abbreviation)}
            >
              <span className="chip-abbr">{t.abbreviation}</span>
              {getRosterStatus(t.abbreviation).imported && (
                <span className="chip-imported" title="Imported data">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Impact panel — value & rank vs the DARKO baseline */}
      <div className="rb-impact">
        <div className="rb-stat rb-stat-hero">
          <span className="rb-stat-label">Team value (net rating)</span>
          <span className="rb-stat-value">{netFmt(currentDpm)}</span>
          <span className={`rb-stat-delta ${valDelta > 0.05 ? 'rb-up' : valDelta < -0.05 ? 'rb-down' : ''}`}>
            baseline {netFmt(baselineDpm)} · Δ {netFmt(valDelta)}
          </span>
        </div>
        <div className="rb-stat">
          <span className="rb-stat-label">League rank</span>
          <span className="rb-stat-value">
            #{cur.overall} <span className="rb-of">/ 30</span>
          </span>
          <span className={`rb-stat-delta ${rankDelta > 0 ? 'rb-up' : rankDelta < 0 ? 'rb-down' : ''}`}>
            {rankDelta === 0 ? `baseline #${base.overall}` : `${rankDelta > 0 ? '▲' : '▼'} ${Math.abs(rankDelta)} vs #${base.overall}`}
          </span>
        </div>
        <div className="rb-stat">
          <span className="rb-stat-label">{conf} rank</span>
          <span className="rb-stat-value">
            #{cur.conf} <span className="rb-of">/ {CONF_SIZE}</span>
          </span>
          <span className={`tier-badge tier-${TIER_META[tier].color}`}>{TIER_META[tier].label}</span>
        </div>
        <div className="rb-stat">
          <span className="rb-stat-label">Minutes allocated</span>
          <span className="rb-stat-value">
            {allocated} <span className="rb-of">/ 240</span>
          </span>
          <span className={`rb-stat-delta ${remaining > 0 ? 'rb-remain' : 'rb-full'}`}>
            {remaining > 0 ? `${remaining} left to allocate` : 'fully allocated'}
          </span>
        </div>
      </div>

      {/* Minutes by position vs the conventional 2G / 2F / 1C split */}
      <div className="rb-positions">
        <span className="rb-pos-title">By position</span>
        {POS_ORDER.map((g) => {
          const a = posTotals[g];
          const target = POSITION_TARGETS[g];
          const diff = a - target;
          return (
            <span className="rb-pos" key={g}>
              <span className="rb-pos-label">{POS_LABEL[g]}</span>
              <span className="rb-pos-val">
                <strong>{a}</strong> <span className="rb-of">/ {target}</span>
              </span>
              <span className={`rb-pos-diff ${diff > 0 ? 'rb-over' : diff < 0 ? 'rb-under' : 'rb-on'}`}>
                {diff === 0 ? 'on target' : `${diff > 0 ? '+' : ''}${diff}`}
              </span>
            </span>
          );
        })}
        {posUnknown > 0 && (
          <span className="rb-pos">
            <span className="rb-pos-label">Unlisted</span>
            <span className="rb-pos-val">
              <strong>{posUnknown}</strong>
            </span>
          </span>
        )}
      </div>

      {/* Lineup diagnostics — construction flags, independent of the DPM talent
          number. Reads "expected players with X on the floor" from your minutes. */}
      <div className="rb-diag">
        <div className="rb-diag-head">
          <span className="rb-diag-title">Lineup diagnostics</span>
          <span className="rb-diag-sub">structural fit — separate from talent (DPM)</span>
        </div>
        <div className="rb-diag-grid">
          {diag.flags.map((f) => (
            <div className={`rb-flag rb-flag-${f.level}`} key={f.key}>
              <span className="rb-flag-top">
                <span className={`rb-flag-dot rb-dot-${f.level}`} aria-hidden />
                <span className="rb-flag-label">{f.label}</span>
                <span className="rb-flag-val">{f.onFloor.toFixed(1)}</span>
              </span>
              <span className="rb-flag-target">healthy {f.target}</span>
              <span className="rb-flag-detail">{f.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Optimize rotation — one click to maximize team value under realistic
          caps, keeping positions balanced and never adding a red flag. */}
      {!preview ? (
        <div className="rb-optimize-bar">
          <button
            className="rb-optimize"
            onClick={() => setPreview(optimizeRotation(rotation, mins))}
            disabled={rotation.length === 0}
          >
            ✨ Optimize rotation
          </button>
          <span className="rb-optimize-hint">
            Maximizes team value with realistic minutes — never lowers value or adds a red flag.
          </span>
        </div>
      ) : (
        <div className="rb-preview">
          <div className="rb-preview-head">
            <span className="rb-preview-title">Optimized rotation</span>
            {!preview.changed && <span className="rb-preview-none">Already optimal — no changes</span>}
          </div>
          {preview.changed && (
            <>
              <div className="rb-preview-stats">
                <div className="rb-pv-stat">
                  <span className="rb-pv-label">Team value</span>
                  <span className="rb-pv-move">
                    {netFmt(preview.before.dpm)} <span className="rb-pv-arrow">→</span>{' '}
                    <strong>{netFmt(preview.after.dpm)}</strong>
                  </span>
                  <span className={`rb-pv-delta ${pvValDelta > 0.05 ? 'rb-up' : ''}`}>
                    {pvValDelta > 0.05 ? `▲ ${netFmt(pvValDelta)}` : 'no change'}
                  </span>
                </div>
                <div className="rb-pv-stat">
                  <span className="rb-pv-label">League rank</span>
                  <span className="rb-pv-move">
                    #{pvBeforeRank?.overall} <span className="rb-pv-arrow">→</span>{' '}
                    <strong>#{pvAfterRank?.overall}</strong>
                  </span>
                  <span className={`rb-pv-delta ${pvRankDelta > 0 ? 'rb-up' : ''}`}>
                    {pvRankDelta > 0 ? `▲ ${pvRankDelta} spot${pvRankDelta > 1 ? 's' : ''}` : 'no change'}
                  </span>
                </div>
              </div>

              {pvFlagChanges.length > 0 && (
                <div className="rb-preview-flags">
                  {pvFlagChanges.map(({ f, b }) => {
                    const better = LEVEL_RANK[f.level] > LEVEL_RANK[b.level];
                    return (
                      <span className={`rb-pv-flag ${better ? 'rb-up' : 'rb-down'}`} key={f.key}>
                        {better ? '▲' : '▼'} {f.label}: {b.level} → {f.level}
                      </span>
                    );
                  })}
                </div>
              )}

              {pvMovers.length > 0 && (
                <div className="rb-preview-movers">
                  <span className="rb-pv-label">Minute changes</span>
                  <div className="rb-pv-mover-list">
                    {pvMovers.slice(0, 8).map((m) => (
                      <span className={`rb-pv-mover ${m.delta > 0 ? 'rb-up' : 'rb-down'}`} key={m.name}>
                        {m.delta > 0 ? '+' : '−'}
                        {Math.abs(m.delta)} {m.name.split(' ').slice(-1)[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="rb-preview-actions">
            {preview.changed && (
              <button className="rb-apply" onClick={applyPreview}>
                Apply
              </button>
            )}
            <button className="rp-reset" onClick={() => setPreview(null)}>
              {preview.changed ? 'Discard' : 'Close'}
            </button>
          </div>
        </div>
      )}

      <div className="rb-toolbar">
        <div className="rb-sort">
          <label>
            Sort by{' '}
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rp-reset"
            onClick={() => setSortNonce((n) => n + 1)}
            title="Re-apply the sort to the current minutes"
          >
            Re-sort
          </button>
        </div>
        {edited && (
          <button className="rp-reset" onClick={() => resetTeamMinutes(abbr)}>
            Reset to DARKO baseline
          </button>
        )}
      </div>

      {/* Player rows — order stays put while you edit; use Sort / Re-sort to reorder. */}
      <div className="rb-list">
        {orderedRows.map((r) => (
          <div className="rb-row" key={r.id}>
            <div className="rb-player">
              <span className="rb-nameline">
                <PlayerName name={r.name} className="rb-name" />
                {r.arch && <span className="rb-arch">{r.arch}</span>}
              </span>
              <span className="rb-meta">
                {r.pos}
                {r.dpm != null && (
                  <>
                    {' · '}
                    <span className={r.dpm >= 0 ? 'rp-pos' : 'rp-neg'}>{netFmt(r.dpm)} DPM</span>
                  </>
                )}
              </span>
            </div>
            <div className="rb-control">
              <button
                type="button"
                className="rb-step"
                onClick={() => setMin(r.id, r.min - 1)}
                disabled={r.min <= 0}
                aria-label={`Decrease minutes for ${r.name}`}
              >
                −
              </button>
              <input
                className="rb-min"
                type="number"
                inputMode="numeric"
                min={0}
                max={48}
                value={r.min}
                onChange={(e) => setMin(r.id, parseInt(e.target.value, 10))}
                aria-label={`Minutes for ${r.name}`}
              />
              <button
                type="button"
                className="rb-step"
                onClick={() => setMin(r.id, r.min + 1)}
                disabled={remaining <= 0}
                aria-label={`Increase minutes for ${r.name}`}
              >
                +
              </button>
            </div>
            <div className={`rb-contrib ${r.contrib >= 0 ? 'rp-pos' : 'rp-neg'}`}>
              {netFmt(r.contrib)}
              <span className="rb-contrib-label">to value</span>
            </div>
          </div>
        ))}
        {orderedRows.length === 0 && <div className="rp-empty">No players on the books this season.</div>}
      </div>

      <p className="rp-foot">
        A game has 240 player-minutes (5 on court × 48). Minutes are seeded from DARKO
        (scaled to 240) and capped there; your allocation sets each player's share of team
        value and flows into the Trade Machine and Signings. Current season only.
      </p>
    </div>
  );
}
