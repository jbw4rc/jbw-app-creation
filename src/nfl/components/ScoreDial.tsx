// The Sharp Score, as a bar. Deliberately not a gauge or a donut — the only
// question a bettor asks here is "is this bigger than the one below it", and
// a bar answers that in one glance across a stacked list.
import { scoreBand } from '../lib/sharp';

export function ScoreDial({ score, compact = false }: { score: number; compact?: boolean }) {
  const band = scoreBand(score);
  return (
    <div className={`score ${compact ? 'score--compact' : ''}`} data-tone={band.tone}>
      <div className="score__num">{Math.round(score)}</div>
      <div className="score__bar">
        <div className="score__fill" style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      {!compact && <div className="score__band">{band.label}</div>}
    </div>
  );
}
