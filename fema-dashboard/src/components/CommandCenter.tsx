import { useMemo, useState } from 'react';
import type { IndicatorId } from '../types';
import type { AllIndicators } from '../lib/indicators';
import { combineFlow } from '../lib/indicators';
import { HORIZON_BUCKETS } from '../config/thresholds';
import { money, count as fmtCount } from '../lib/format';
import { ChartFrame } from './charts/primitives';
import { FlowColumns, FunnelBars, HorizonColumns } from './charts/bars';
import { ExceptionTile } from './StatTile';

export function CommandCenter({ all, onOpen }: { all: AllIndicators; onOpen: (id: IndicatorId) => void }) {
  const [horizonMetric, setHorizonMetric] = useState<'count' | 'dollars'>('count');

  const flow = useMemo(() => combineFlow(all.order.map((id) => all.byId[id].flow)), [all]);
  const lastWeek = flow[flow.length - 1];
  const priorWeek = flow[flow.length - 2];
  const netChange = lastWeek && priorWeek ? lastWeek.openAtEnd - priorWeek.openAtEnd : 0;

  // Deadline horizon combines indicators 4 and 11 — both are date-driven risk,
  // and staffing decisions are made against the combined wave, not each alone.
  const horizon = useMemo(() => {
    const buckets = HORIZON_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0, dollars: 0 }));
    for (const d of all.deadlines) {
      if (d.hasExtension) continue;
      const b =
        d.daysUntil < 0 ? 'past' : d.daysUntil < 30 ? 'd30' : d.daysUntil < 60 ? 'd60' : d.daysUntil < 90 ? 'd90' : 'later';
      const slot = buckets.find((x) => x.key === b)!;
      slot.count += 1;
      slot.dollars += d.dollars;
    }
    return buckets;
  }, [all]);

  // Only queues where "critical" means a breached deadline or a wrong number.
  // On readiness queues an unmet criterion is work in progress, not a breach,
  // and folding those in would make the headline meaningless.
  const BREACH_QUEUES: IndicatorId[] = [
    'rfi-misalignment',
    'rfr-aging',
    'large-project-validation',
    'time-extensions',
    'withdrawn-misalignment',
    'closeout-extensions',
  ];
  const criticalTotal = BREACH_QUEUES.reduce((s, id) => s + all.byId[id].severityCounts.critical, 0);
  const readyDollars =
    all.byId['small-project-closeout'].headlineDollars +
    all.byId['cat-z-closeout'].headlineDollars +
    all.byId['account-closeout'].headlineDollars;

  return (
    <>
      <div className="hero">
        <div>
          <div className="hero-figure">{money(all.totalDollarsHeld)}</div>
          <div className="hero-label">
            held up across the six queues where a dollar is genuinely blocked — validation, reimbursement, extensions,
            withdrawals and closeout readiness
          </div>
        </div>
        <div className="hero-split">
          <div>
            <div className="hero-stat-value">{fmtCount(all.totalExceptionCount)}</div>
            <div className="hero-stat-label">open items across 11 queues</div>
          </div>
          <div>
            <div className="hero-stat-value" style={{ color: criticalTotal > 0 ? 'var(--status-critical)' : undefined }}>
              {fmtCount(criticalTotal)}
            </div>
            <div className="hero-stat-label">critical — deadline or compliance breach</div>
          </div>
          <div>
            <div className="hero-stat-value">{money(readyDollars)}</div>
            <div className="hero-stat-label">ready to close today</div>
          </div>
          <div>
            <div className="hero-stat-value" style={{ color: netChange > 0 ? 'var(--status-critical)' : 'var(--status-good-text)' }}>
              {netChange > 0 ? `+${netChange}` : netChange}
            </div>
            <div className="hero-stat-label">net backlog change this week</div>
          </div>
        </div>
      </div>

      <div className="section-title">Where the money is stuck</div>
      <div className="grid grid-2">
        <ChartFrame
          title="Dollars in motion"
          subtitle="Obligated funds by the furthest stage they have reached. Each gap is money sitting at a gate — click through to the queue that clears it."
          table={{
            columns: ['Stage', 'Dollars', 'Projects'],
            rows: all.funnel.map((s) => [s.label, money(s.dollars), s.count]),
          }}
          note="A project only advances when every earlier gate is satisfied, so the funnel can never widen left to right."
        >
          {(w) => <FunnelBars width={w} stages={all.funnel} />}
        </ChartFrame>

        <ChartFrame
          title="Deadline horizon"
          subtitle="Period-of-performance and closeout (PoP + 180d) deadlines with no extension on file, indicators 4 and 11 combined. This is the staffing view."
          actions={
            <>
              <button type="button" className="mini-btn" aria-pressed={horizonMetric === 'count'} onClick={() => setHorizonMetric('count')}>
                Count
              </button>
              <button type="button" className="mini-btn" aria-pressed={horizonMetric === 'dollars'} onClick={() => setHorizonMetric('dollars')}>
                Dollars
              </button>
            </>
          }
          table={{
            columns: ['Window', 'Deadlines', 'Dollars'],
            rows: horizon.map((b) => [b.label, b.count, money(b.dollars)]),
          }}
          note="Past-due is a compliance breach; the remaining bars are lead time you still control."
        >
          {(w) => <HorizonColumns width={w} buckets={horizon} metric={horizonMetric} />}
        </ChartFrame>
      </div>

      <div className="section-title">The eleven queues</div>
      <div className="grid grid-3">
        {all.order.map((id) => (
          <ExceptionTile key={id} summary={all.byId[id]} onOpen={() => onOpen(id)} />
        ))}
      </div>

      <div className="section-title">Are we gaining on it?</div>
      <div className="grid">
        <ChartFrame
          title="Exception flow — new vs. resolved per week"
          subtitle="Every other view shows a snapshot. This one shows direction: when the orange columns beat the green ones, the backlog is growing regardless of how good today's numbers look."
          legend={[
            { label: 'New exceptions', color: 'var(--series-2)' },
            { label: 'Resolved', color: 'var(--series-3)' },
          ]}
          table={{
            columns: ['Week of', 'New', 'Resolved', 'Open at week end'],
            rows: flow.map((f) => [f.weekStart, f.opened, f.resolved, f.openAtEnd]),
          }}
          note="In production this series builds itself: cache each parsed workbook snapshot in IndexedDB and the history accumulates without a database."
        >
          {(w) => <FlowColumns width={w} weeks={flow} />}
        </ChartFrame>
      </div>
    </>
  );
}
