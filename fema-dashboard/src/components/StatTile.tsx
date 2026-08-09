import type { IndicatorSummary } from '../lib/indicators';
import { money, count as fmtCount } from '../lib/format';
import { Sparkline } from './charts/plots';

/** A tile answers six things at once: how many, how much, how bad, trend, what it is, and where to click. */
export function ExceptionTile({ summary, onOpen }: { summary: IndicatorSummary; onOpen: () => void }) {
  const flow = summary.flow;
  const series = flow.map((f) => f.openAtEnd);
  const prior = series.length > 1 ? series[series.length - 2] : series[series.length - 1] ?? 0;
  const delta = summary.headlineCount - prior;
  const worst = summary.severityCounts.critical > 0 ? 'critical' : summary.severityCounts.serious > 0 ? 'serious' : summary.severityCounts.warning > 0 ? 'warning' : 'clear';

  // For readiness and prioritization queues a bigger number is good news, so the
  // delta color has to follow meaning, not direction.
  const upIsBad = !['small-project-closeout', 'cat-z-closeout', 'account-closeout', 'validation-priority', 'closeout-priority'].includes(summary.def.id);

  // A severity count is only meaningful where severity means "breach". On a
  // readiness queue every unmet criterion would read as critical, which is just
  // work in progress — so those tiles carry a distance-to-done chip instead.
  const chip = (() => {
    if (['small-project-closeout', 'cat-z-closeout', 'account-closeout'].includes(summary.def.id)) {
      return { tone: 'neutral', label: `${fmtCount(summary.rows.length - summary.headlineCount)} still blocked` };
    }
    if (['validation-priority', 'closeout-priority'].includes(summary.def.id)) {
      return { tone: 'neutral', label: `${new Set(summary.rows.map((r) => r.applicantName)).size} applicants` };
    }
    return {
      tone: worst,
      label:
        worst === 'clear'
          ? 'none flagged'
          : `${fmtCount(summary.severityCounts[worst as 'critical' | 'serious' | 'warning'])} ${worst}`,
    };
  })();
  const deltaClass = delta === 0 ? 'flat' : (delta > 0) === upIsBad ? 'up-bad' : 'down-good';

  return (
    <button type="button" className="tile" onClick={onOpen}>
      <div className="tile-head">
        <span className="tile-num">{summary.def.number}</span>
        <span className="tile-label" title={summary.def.shortTitle}>
          {summary.def.shortTitle}
        </span>
      </div>
      <div className="tile-value">{fmtCount(summary.headlineCount)}</div>
      <div className="tile-money">{money(summary.headlineDollars)}</div>
      <div className="tile-sub">{summary.headlineLabel}</div>
      <div className="tile-foot">
        <span className={`delta ${deltaClass}`}>
          {delta === 0 ? '±0' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}`}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs last week</span>
        </span>
        <Sparkline points={series} invertGood={upIsBad} />
      </div>
      <div className="tile-foot" style={{ marginTop: 6 }}>
        <span className="sev-chip">
          <span className={`sev-dot ${chip.tone}`} aria-hidden="true" />
          {chip.label}
        </span>
      </div>
    </button>
  );
}
