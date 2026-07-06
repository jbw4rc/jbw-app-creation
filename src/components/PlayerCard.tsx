import { useEffect } from 'react';
import { SEEDED_STATS } from '../data/seededStats';
import type { PlayerStats } from '../data/statsTypes';
import { darkoFor, darkoNorm } from '../lib/darko';
import { archetype } from '../lib/archetype';
import { rookieInfo } from '../lib/rookies';
import { getTeams } from '../lib/teamStore';
import { usePlayerCard, closePlayerCard } from '../lib/playerCardStore';

// ---------------------------------------------------------------------------
// Player stat card — a modal that any view opens by name (see playerCardStore).
// Joins Basketball-Reference per-game / advanced stats with DARKO impact & the
// derived archetype, all keyed by normalized name.
// ---------------------------------------------------------------------------

const STATS_BY_NAME: Record<string, PlayerStats> = {};
for (const p of SEEDED_STATS.players) {
  const k = darkoNorm(p.name);
  if (!(k in STATS_BY_NAME)) STATS_BY_NAME[k] = p;
}

const one = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(1));
const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : (n * 100).toFixed(1));
const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(1)}M`);
const signed = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`);

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="pc-tile">
      <span className="pc-tile-label">{label}</span>
      <span className={`pc-tile-val${tone ? ' pc-' + tone : ''}`}>{value}</span>
    </div>
  );
}

export function PlayerCard() {
  const name = usePlayerCard();

  useEffect(() => {
    if (!name) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePlayerCard();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [name]);

  if (!name) return null;
  const s = STATS_BY_NAME[darkoNorm(name)];
  const d = darkoFor(name);
  const arch = archetype(d);
  const b = d?.box;
  // For a first-year player with no DARKO, pull the rookie projection.
  const rook = d
    ? null
    : (() => {
        const key = darkoNorm(name);
        for (const t of getTeams()) {
          const p = t.players.find((x) => darkoNorm(x.name) === key);
          if (p) return rookieInfo(p);
        }
        return null;
      })();

  return (
    <div className="pc-backdrop" onClick={closePlayerCard} role="dialog" aria-modal="true">
      <div className="pc-card" onClick={(e) => e.stopPropagation()}>
        <button className="pc-close" onClick={closePlayerCard} aria-label="Close">
          ×
        </button>
        <div className="pc-header">
          <h3 className="pc-name">{s?.name ?? name}</h3>
          <div className="pc-meta">
            {s?.pos ?? d?.pos ?? '—'}
            {(s?.age ?? d?.age) != null && <> · {s?.age ?? d?.age} yrs</>}
            {arch && <span className="pc-arch">{arch}</span>}
            {rook && <span className="pc-arch">{rook.label}</span>}
          </div>
        </div>

        {/* Impact & role */}
        <div className="pc-tiles">
          <Tile
            label={rook ? 'Exp. DPM' : 'DPM'}
            value={signed(d?.dpm ?? rook?.dpm)}
            tone={(d?.dpm ?? rook?.dpm) != null ? ((d?.dpm ?? rook?.dpm)! >= 0 ? 'pos' : 'neg') : undefined}
          />
          <Tile label="O-DPM" value={signed(d?.odpm)} />
          <Tile label="D-DPM" value={signed(d?.ddpm)} />
          <Tile label="Proj MPG" value={(d?.min ?? rook?.min) != null ? String(Math.round((d?.min ?? rook?.min)!)) : '—'} />
          <Tile label="Market value" value={money(d?.value)} />
          <Tile label="Surplus" value={signed(d?.surplus == null ? null : d.surplus)} tone={d?.surplus != null ? (d.surplus >= 0 ? 'pos' : 'neg') : undefined} />
        </div>

        {rook && (
          <div className="pc-rookie-note">
            No NBA history yet — projected from draft slot. Value develops in later seasons.
          </div>
        )}

        {s ? (
          <>
            <div className="pc-section-label">Per game · {s.g} G, {one(s.mpg)} MPG</div>
            <div className="pc-tiles pc-tiles-sm">
              <Tile label="PTS" value={one(s.pts)} />
              <Tile label="REB" value={one(s.trb)} />
              <Tile label="AST" value={one(s.ast)} />
              <Tile label="STL" value={one(s.stl)} />
              <Tile label="BLK" value={one(s.blk)} />
              <Tile label="TOV" value={one(s.tov)} />
            </div>
            <div className="pc-section-label">Shooting &amp; usage</div>
            <div className="pc-tiles pc-tiles-sm">
              <Tile label="FG%" value={pct(s.fgPct)} />
              <Tile label="3P%" value={pct(s.fg3Pct)} />
              <Tile label="FT%" value={pct(s.ftPct)} />
              <Tile label="TS%" value={pct(s.tsPct)} />
              <Tile label="USG%" value={pct(s.usgPct / 100)} />
              <Tile label="PER" value={one(s.per)} />
            </div>
            <div className="pc-section-label">Value</div>
            <div className="pc-tiles pc-tiles-sm">
              <Tile label="WS" value={one(s.ws)} />
              <Tile label="WS/48" value={s.ws48 != null ? s.ws48.toFixed(3) : '—'} />
              <Tile label="BPM" value={signed(s.bpm)} />
              <Tile label="VORP" value={one(s.vorp)} />
            </div>
          </>
        ) : b ? (
          <>
            <div className="pc-section-label">Projected per 100 possessions (DARKO)</div>
            <div className="pc-tiles pc-tiles-sm">
              <Tile label="PTS" value={one(b.pts)} />
              <Tile label="REB" value={one(b.reb)} />
              <Tile label="AST" value={one(b.ast)} />
              <Tile label="STL" value={one(b.stl)} />
              <Tile label="BLK" value={one(b.blk)} />
              <Tile label="3PA" value={one(b.fg3a)} />
            </div>
          </>
        ) : (
          <p className="pc-nostats">No box-score stats on file for this player.</p>
        )}

        <p className="pc-foot">
          Per-game &amp; advanced: Basketball-Reference. DPM / value / archetype: DARKO.
        </p>
      </div>
    </div>
  );
}
