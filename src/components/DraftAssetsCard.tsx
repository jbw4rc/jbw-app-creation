import type { Team } from '../types';
import { draftAssets, barrenFirstYears, type PickItem } from '../lib/draftAssets';
import { GradePill } from './FinancialCard';

// Draft-assets card: a league-relative grade + composition summary, then each
// controlled first-rounder with its origin (own / via TEAM), a conditional tag
// where it carries a protection or swap, and value — making the pick complexity
// visible (conveyance phase 1).

const MAX_ROWS = 6;

function PickRow({ it }: { it: PickItem }) {
  return (
    <div className="da-pick" title={it.note}>
      <span className="da-pick-yr">{it.label}</span>
      <span className={`da-origin ${it.from ? 'da-incoming' : ''}`}>{it.from ? `via ${it.from}` : 'own'}</span>
      {it.conditional && <span className="da-cond">cond.</span>}
      <span className="da-pick-val">${it.value.toFixed(1)}M</span>
    </div>
  );
}

export function DraftAssetsCard({ team }: { team: Team }) {
  const a = draftAssets(team);
  const barren = barrenFirstYears(team);
  const shown = a.items.slice(0, MAX_ROWS);
  const extra = a.items.length - shown.length;
  return (
    <div className="gm-card">
      <div className="gm-card-head">
        <span className="gm-card-title">Draft assets</span>
        <span className="gm-card-sub">controllable picks, valued vs the league</span>
      </div>
      <div className="ff-horizon">
        <GradePill grade={a.grade} />
        <div className="ff-horizon-body">
          <span className="ff-horizon-label">#{a.rank} of 30 in draft capital</span>
          <span className="ff-horizon-blurb">{a.summary}.</span>
        </div>
      </div>
      <div className="da-picks">
        {a.items.length === 0 ? (
          <span className="gm-none">No first-round picks controlled.</span>
        ) : (
          <>
            {shown.map((it, i) => <PickRow key={`${it.year}-${it.from ?? 'own'}-${i}`} it={it} />)}
            {extra > 0 && <span className="da-more">+{extra} more first{extra === 1 ? '' : 's'}</span>}
          </>
        )}
      </div>
      {barren.length > 0 && (
        <span className="da-stepien">
          No first controlled in {barren.join(', ')} — Stepien-limited.
        </span>
      )}
    </div>
  );
}
