import { useMemo, useState } from 'react';
import type { ExceptionRow, IndicatorId } from '../types';
import type { AllIndicators } from '../lib/indicators';
import { RFI_INTERNAL_STATES, RFI_SOR_STATES } from '../lib/indicators';
import { AGING_BANDS, CLOSEOUT, HORIZON_BUCKETS, VALIDATION } from '../config/thresholds';
import { money, count as fmtCount, pct } from '../lib/format';
import { formatDate } from '../lib/dates';
import { ChartFrame } from './charts/primitives';
import { BlockerBars, BulletRows, HorizonColumns, Meter, ParetoPanels, StackedBarRows } from './charts/bars';
import { CliffChart, DumbbellChart, QuadrantScatter, ValueEffortScatter } from './charts/plots';
import { AgreementMatrix, ReadinessMatrix } from './charts/grids';
import { QueueTable } from './QueueTable';
import type { AnnotationMap } from '../lib/localState';

const BAND_COLORS: Record<string, string> = {
  within: 'var(--neutral-mark)',
  over1: 'var(--status-warning)',
  over2: 'var(--status-serious)',
  over3: 'var(--status-critical)',
};

export function IndicatorView({
  id,
  all,
  annotations,
  onSelectRow,
}: {
  id: IndicatorId;
  all: AllIndicators;
  annotations: AnnotationMap;
  onSelectRow: (row: ExceptionRow) => void;
}) {
  const summary = all.byId[id];
  const def = summary.def;
  const [showDismissed, setShowDismissed] = useState(false);

  const rowById = useMemo(() => new Map(summary.rows.map((r) => [r.id, r])), [summary.rows]);
  const selectById = (rid: string) => {
    const row = rowById.get(rid);
    if (row) onSelectRow(row);
  };

  return (
    <>
      <div className="logic-grid">
        <div className="callout">
          <h4>How this is calculated</h4>
          <ul>
            {def.logic.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div className="callout assumption">
          <h4>Assumptions to confirm</h4>
          <ul>
            {def.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      <Charts id={id} all={all} onSelect={selectById} />

      <div className="section-title">Work queue</div>
      <QueueTable
        def={def}
        rows={summary.rows}
        asOf={all.ds.asOf}
        annotations={annotations}
        onSelect={onSelectRow}
        showDismissed={showDismissed}
        onToggleDismissed={() => setShowDismissed((v) => !v)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ charts */

function Charts({ id, all, onSelect }: { id: IndicatorId; all: AllIndicators; onSelect: (rowId: string) => void }) {
  const [metric, setMetric] = useState<'count' | 'dollars'>('count');
  // A matrix of eighteen all-green rows tells you nothing. The default view is
  // the actionable middle — items one criterion from done.
  const [readiness, setReadiness] = useState<'one' | 'ready' | 'blocked' | 'all'>('one');

  const metricToggle = (
    <>
      <button type="button" className="mini-btn" aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>
        Count
      </button>
      <button type="button" className="mini-btn" aria-pressed={metric === 'dollars'} onClick={() => setMetric('dollars')}>
        Dollars
      </button>
    </>
  );

  switch (id) {
    /* ------------------------------------------------------------------ 1 */
    case 'rfi-misalignment': {
      const { rfi } = all;
      const directions = rfi.matrix
        .filter((c) => !c.aligned && c.count > 0)
        .sort((a, b) => (metric === 'count' ? b.count - a.count : b.dollars - a.dollars))
        .map((c) => ({
          label: `${c.internal} → ${c.sor}`,
          segments: [
            {
              key: `${c.internal}|${c.sor}`,
              label: 'Exceptions',
              value: metric === 'count' ? c.count : c.dollars,
              color: 'var(--seq-450)',
              tipLines: [`${c.count} RFIs`, money(c.dollars)],
            },
          ],
        }));

      return (
        <div className="grid grid-2">
          <ChartFrame
            title="Status agreement — internal tracker vs. client system of record"
            subtitle="The direction of a disagreement decides who fixes it. An RFI live in the client system that we are not tracking is a missed-deadline risk; a stale internal row is housekeeping. A single mismatch count hides both."
            actions={metricToggle}
            table={{
              columns: ['Internal tracker', 'Client system', 'RFIs', 'Obligated $'],
              rows: rfi.matrix.filter((c) => c.count > 0).map((c) => [c.internal, c.sor, c.count, money(c.dollars)]),
            }}
            note={`${rfi.alignedCount} of ${rfi.totalCount} RFIs agree across both systems (${pct(rfi.alignedCount / Math.max(rfi.totalCount, 1))}).`}
          >
            {(w) => (
              <AgreementMatrix
                width={w}
                rowLabels={RFI_INTERNAL_STATES}
                colLabels={RFI_SOR_STATES}
                cells={rfi.matrix}
                metric={metric}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Exception types, ranked"
            subtitle="The same off-diagonal cells as a worklist. Each row is a distinct fix with a distinct owner — reading top-down tells you which conversation to have first."
            actions={metricToggle}
            table={{
              columns: ['Internal → Client', 'RFIs', 'Obligated $'],
              rows: rfi.matrix
                .filter((c) => !c.aligned && c.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((c) => [`${c.internal} → ${c.sor}`, c.count, money(c.dollars)]),
            }}
            note="Read as: internal tracker status → client system status."
          >
            {(w) => <StackedBarRows width={w} rows={directions} labelWidth={168} valueFormat={metric === 'count' ? fmtCount : money} />}
          </ChartFrame>
        </div>
      );
    }

    /* ------------------------------------------------------------------ 2 */
    case 'rfr-aging': {
      const { rfr } = all;
      const rows = rfr.steps.map((s) => ({
        label: s.step,
        segments: AGING_BANDS.map((b) => ({
          key: b.key,
          label: b.label,
          value: metric === 'count' ? s.bands[b.key].count : s.bands[b.key].dollars,
          color: BAND_COLORS[b.key],
          tipLines: [`${s.bands[b.key].count} RFRs`, money(s.bands[b.key].dollars), `Step target ${s.target} days`],
        })),
      }));

      return (
        <div className="grid">
          <ChartFrame
            title="In-flight reimbursements by step and age"
            subtitle="Each bar is a process step; the colored mass to the right is what has blown its target. Toggle to dollars — one $3M reimbursement stuck 20 days outranks twelve $10K ones, and a count-only view gets that backwards."
            actions={metricToggle}
            legend={AGING_BANDS.map((b) => ({ label: b.label, color: BAND_COLORS[b.key] }))}
            table={{
              columns: ['Step', 'Target (days)', 'In flight', 'Dollars', 'Median days', '90th pct'],
              rows: rfr.steps.map((s) => [s.step, s.target, s.count, money(s.dollars), s.medianDays, s.p90Days]),
            }}
          >
            {(w) => <StackedBarRows width={w} rows={rows} labelWidth={156} valueFormat={metric === 'count' ? fmtCount : money} />}
          </ChartFrame>

          <ChartFrame
            title="Is the step slow, or is one record stuck?"
            subtitle="Median (solid) and 90th percentile (light) days in step against the target marker. A median past target means the step itself is under-resourced; a tight median with a long tail means a handful of records need chasing."
            legend={[
              { label: 'Median days in step', color: 'var(--seq-450)' },
              { label: '90th percentile', color: 'var(--seq-100)' },
              { label: 'Target', color: 'var(--text-primary)', shape: 'line' },
            ]}
            table={{
              columns: ['Step', 'Median days', '90th percentile', 'Target'],
              rows: rfr.steps.map((s) => [s.step, s.medianDays, s.p90Days, s.target]),
            }}
          >
            {(w) => <BulletRows width={w} rows={rfr.steps.map((s) => ({ label: s.step, median: s.medianDays, p90: s.p90Days, target: s.target }))} />}
          </ChartFrame>
        </div>
      );
    }

    /* ------------------------------------------------------------------ 3 */
    case 'large-project-validation': {
      const { validation } = all;
      const points = validation.points.map((p) => ({
        id: `VAL-${p.project.id}`,
        label: p.project.id,
        x: p.daysPostObligation,
        y: p.unvalidatedShare,
        size: p.project.obligatedAmount,
        flagX: p.flagDays,
        flagY: p.flagShare,
        sub: `${p.project.title} · ${money(p.unvalidatedDollars)} unvalidated`,
      }));
      const validatedShare = validation.portfolioValidated / Math.max(validation.portfolioObligated, 1);

      return (
        <div className="grid">
          <ChartFrame
            title="The validation rule, drawn"
            subtitle="Both halves of the rule on one plot: days since obligation across, share of funds still unvalidated up, bubble size the obligated amount. The shaded upper-right quadrant breaches both targets — that is the action list, and it is visible instead of buried in a formula."
            legend={[
              { label: 'Breaches both targets', color: 'var(--status-critical)', shape: 'dot' },
              { label: 'Past the day target only', color: 'var(--status-serious)', shape: 'dot' },
              { label: 'Over the unvalidated ceiling only', color: 'var(--status-warning)', shape: 'dot' },
              { label: 'Inside both targets', color: 'var(--neutral-mark)', shape: 'dot' },
            ]}
            table={{
              columns: ['Project', 'Days post-obligation', 'Unvalidated share', 'Unvalidated $'],
              rows: validation.points
                .slice()
                .sort((a, b) => b.unvalidatedDollars - a.unvalidatedDollars)
                .map((p) => [p.project.id, p.daysPostObligation, pct(p.unvalidatedShare), money(p.unvalidatedDollars)]),
            }}
            note="Click any bubble to open the project."
          >
            {(w) => (
              <QuadrantScatter
                width={w}
                points={points}
                targetX={VALIDATION.targetDaysPostObligation}
                targetY={VALIDATION.maxUnvalidatedShare}
                xLabel="Days since obligation"
                yLabel="Share of funds not yet validated"
                onSelect={onSelect}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Portfolio validation progress"
            subtitle="The single ratio behind indicator 3: how much of the obligated large-project money has been validated."
            table={{
              columns: ['Measure', 'Value'],
              rows: [
                ['Obligated (large projects)', money(validation.portfolioObligated)],
                ['Validated to date', money(validation.portfolioValidated)],
                ['Unvalidated', money(validation.portfolioObligated - validation.portfolioValidated)],
                ['Share validated', pct(validatedShare, 1)],
              ],
            }}
          >
            {(w) => (
              <Meter
                width={Math.min(w, 560)}
                value={validatedShare}
                target={1 - VALIDATION.maxUnvalidatedShare}
                valueLabel={`${pct(validatedShare, 1)} validated — ${money(validation.portfolioValidated)} of ${money(validation.portfolioObligated)}`}
                label="Unfilled track is the unvalidated balance"
              />
            )}
          </ChartFrame>
        </div>
      );
    }

    /* ------------------------------------------------------------------ 4 */
    case 'time-extensions': {
      const { extensions } = all;
      const rows = extensions.needs
        .slice()
        .sort((a, b) => a.daysUntilPop - b.daysUntilPop)
        .slice(0, 20)
        .map((n) => ({
          id: `TE-${n.project.id}`,
          label: n.project.id,
          sublabel: n.project.title,
          from: n.popEndDate,
          to: n.projectedCompletionDate,
          dollars: n.project.obligatedAmount,
        }));
      const horizon = HORIZON_BUCKETS.map((b) => {
        const hit = extensions.horizon.find((h) => h.key === b.key);
        return { key: b.key, label: b.label, count: hit?.count ?? 0, dollars: hit?.dollars ?? 0 };
      });

      return (
        <div className="grid">
          <ChartFrame
            title="How far past the period of performance the work actually runs"
            subtitle="One row per project: the left dot is the PoP end date in the system of record, the right dot is the completion date the applicant reported this quarter. The line between them is the extension you need to ask for — length is the size of the ask, position against today is the urgency."
            legend={[
              { label: 'PoP end (system of record)', color: 'var(--seq-550)', shape: 'dot' },
              { label: 'Projected completion (quarterly report)', color: 'var(--series-2)', shape: 'dot' },
              { label: 'Today', color: 'var(--text-primary)', shape: 'line' },
            ]}
            table={{
              columns: ['Project', 'PoP end', 'Projected completion', 'Gap (days)', 'Obligated $'],
              rows: extensions.needs
                .slice()
                .sort((a, b) => a.daysUntilPop - b.daysUntilPop)
                .map((n) => [n.project.id, n.popEndDate, n.projectedCompletionDate, n.gapDays, money(n.project.obligatedAmount)]),
            }}
            note={`Showing the ${rows.length} most urgent of ${extensions.needs.length}. Click a row to open the project.`}
          >
            {(w) => <DumbbellChart width={w} rows={rows} asOf={all.ds.asOf} onSelect={onSelect} />}
          </ChartFrame>

          <ChartFrame
            title="When the periods of performance end"
            subtitle="The submission schedule: how many extension requests have to be filed, and by when."
            actions={metricToggle}
            table={{
              columns: ['Window', 'Projects', 'Obligated $'],
              rows: horizon.map((h) => [h.label, h.count, money(h.dollars)]),
            }}
          >
            {(w) => <HorizonColumns width={w} buckets={horizon} metric={metric} />}
          </ChartFrame>
        </div>
      );
    }

    /* ------------------------------------------------------------------ 5 */
    case 'withdrawn-misalignment': {
      const { withdrawn } = all;
      const buckets = withdrawn.agingBuckets.map((b, i) => ({ key: `b${i}`, ...b }));
      const byDisaster = withdrawn.overstatedByDisaster.map((d) => ({
        label: d.disasterId,
        segments: [
          {
            key: d.disasterId,
            label: 'Overstated',
            value: d.dollars,
            color: 'var(--seq-450)',
            tipLines: [`${d.count} projects`, `${money(d.dollars)} overstated`],
          },
        ],
      }));

      return (
        <div className="grid grid-2">
          <ChartFrame
            title="How long the books have been wrong"
            subtitle="Aged from the FEMA withdrawal date. Every day in these bars is a day the client system reports funding that FEMA has already pulled back."
            actions={metricToggle}
            table={{
              columns: ['Age of mismatch', 'Projects', 'Overstated $'],
              rows: withdrawn.agingBuckets.map((b) => [b.label, b.count, money(b.dollars)]),
            }}
          >
            {(w) => <HorizonColumns width={w} buckets={buckets} metric={metric} />}
          </ChartFrame>

          <ChartFrame
            title="Overstatement by disaster"
            subtitle="Where the exposure concentrates. This is a financial-accuracy number, not a data-hygiene count — it is what an auditor would ask about first."
            table={{
              columns: ['Disaster', 'Projects', 'Overstated $'],
              rows: withdrawn.overstatedByDisaster.map((d) => [d.disasterId, d.count, money(d.dollars)]),
            }}
          >
            {(w) => <StackedBarRows width={w} rows={byDisaster} labelWidth={92} valueFormat={money} />}
          </ChartFrame>
        </div>
      );
    }

    /* ---------------------------------------------------------------- 6/7/8 */
    case 'small-project-closeout':
    case 'cat-z-closeout':
    case 'account-closeout': {
      const result =
        id === 'small-project-closeout' ? all.smallProjects : id === 'cat-z-closeout' ? all.catZ : all.accounts;
      const noun = id === 'account-closeout' ? 'accounts' : 'projects';
      const matrixItems = result.items.filter((i) =>
        readiness === 'all'
          ? true
          : readiness === 'ready'
            ? i.ready
            : readiness === 'one'
              ? i.unmet.length === 1
              : i.unmet.length >= 2,
      );
      const readinessToggle = (
        <>
          {(
            [
              ['ready', 'Ready'],
              ['one', 'One away'],
              ['blocked', '2+ blockers'],
              ['all', 'All'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" className="mini-btn" aria-pressed={readiness === key} onClick={() => setReadiness(key)}>
              {label}
            </button>
          ))}
        </>
      );

      return (
        <div className="grid">
          <div className="grid grid-3">
            <div className="card">
              <div className="tile-label">Ready to close now</div>
              <div className="tile-value">{fmtCount(result.readyCount)}</div>
              <div className="tile-money">{money(result.readyDollars)} released</div>
            </div>
            <div className="card">
              <div className="tile-label">One criterion away</div>
              <div className="tile-value">{fmtCount(result.oneAwayCount)}</div>
              <div className="tile-money">{money(result.oneAwayDollars)} behind a single blocker</div>
            </div>
            <div className="card">
              <div className="tile-label">Biggest single blocker</div>
              <div className="tile-value" style={{ fontSize: 20, lineHeight: 1.3 }}>
                {result.blockers[0]?.short ?? '—'}
              </div>
              <div className="tile-money">
                {result.blockers[0] ? `${money(result.blockers[0].dollars)} across ${result.blockers[0].count} ${noun}` : '—'}
              </div>
            </div>
          </div>

          <ChartFrame
            title="Readiness matrix"
            subtitle={`Every closeout criterion as a column, sorted so the ${noun} closest to done sit at the top. This turns the business logic into something you can audit and argue with, instead of a yes/no that comes out of a formula. The default view is the one-criterion-away set — that is the week's work plan.`}
            actions={readinessToggle}
            table={{
              columns: ['Record', 'Applicant', ...result.criteria.map((c) => c.short), 'Unlocks'],
              rows: result.items
                .slice()
                .sort((a, b) => a.unmet.length - b.unmet.length || b.dollars - a.dollars)
                .map((i) => [
                  i.entity,
                  i.applicantName,
                  ...result.criteria.map((c) => (i.met[c.key] === null ? 'n/a' : i.met[c.key] ? 'met' : 'BLOCKING')),
                  money(i.dollars),
                ]),
            }}
            note="Click any cell to open the record."
          >
            {(w) => (
              <ReadinessMatrix
                width={w}
                criteria={result.criteria}
                items={matrixItems}
                showApplicant={id !== 'account-closeout'}
                onSelect={onSelect}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="What is blocking the portfolio"
            subtitle="Ranked by dollars held behind each criterion. If most of the money traces to one missing item, that is a process fix — not a queue to work through one record at a time."
            actions={metricToggle}
            table={{
              columns: ['Criterion', `Blocked ${noun}`, 'Dollars held'],
              rows: result.blockers.map((b) => [b.label, b.count, money(b.dollars)]),
            }}
          >
            {(w) => <BlockerBars width={w} blockers={result.blockers} metric={metric} />}
          </ChartFrame>

          {id === 'account-closeout' ? (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Last mile — accounts with the fewest projects left</h3>
              </div>
              <p className="card-sub">
                A small push here closes an entire account. Sorted by projects remaining, then by dollars released.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Disaster</th>
                      <th className="num">Projects closed</th>
                      <th className="num">Remaining</th>
                      <th className="num">Unlocks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.accounts.accounts
                      .slice()
                      .sort((a, b) => a.openProjects - b.openProjects || b.dollars - a.dollars)
                      .slice(0, 12)
                      .map((a) => (
                        <tr key={a.id}>
                          <td>{a.applicantName}</td>
                          <td className="cell-sub">{a.disasterId}</td>
                          <td className="num">
                            {a.closedProjects} of {a.totalProjects}
                          </td>
                          <td className="num">{a.openProjects}</td>
                          <td className="num">{money(a.dollars)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    /* --------------------------------------------------------------- 9/10 */
    case 'validation-priority':
    case 'closeout-priority': {
      const result = id === 'validation-priority' ? all.validationPriority : all.closeoutPriority;
      const verb = id === 'validation-priority' ? 'validations' : 'closeouts';

      return (
        <div className="grid">
          <ChartFrame
            title={`Ranked by funding unlocked, with this month's capacity drawn in`}
            subtitle={`Top panel: dollars released per item, ranked. Bottom panel: the running total. The red line is capacity — ${result.capacity} ${verb} a month — so you can read straight off the chart what this month's throughput actually buys.`}
            legend={[
              { label: 'Inside capacity', color: 'var(--seq-450)' },
              { label: 'Below the cut line', color: 'var(--neutral-mark)' },
              { label: 'Cumulative unlocked', color: 'var(--series-2)', shape: 'line' },
            ]}
            table={{
              columns: ['Rank', 'Record', 'Applicant', 'Unlocks', 'Cumulative'],
              rows: result.candidates.map((c, i) => [i + 1, c.entity, c.applicantName, money(c.unlock), money(result.cumulative[i])]),
            }}
            note={`Working the top ${result.capacity} releases ${money(result.capacityUnlock)} of ${money(result.totalUnlock)} — ${pct(result.capacityUnlock / Math.max(result.totalUnlock, 1))} of the total from ${pct(Math.min(result.capacity, result.candidates.length) / Math.max(result.candidates.length, 1))} of the items.`}
          >
            {(w) => (
              <ParetoPanels
                width={w}
                items={result.candidates.map((c) => ({ label: c.entity, value: c.unlock, sub: `${c.applicantName} · ${c.effortLabel}` }))}
                cumulative={result.cumulative}
                capacity={result.capacity}
                capacityUnlock={result.capacityUnlock}
                totalUnlock={result.totalUnlock}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Value against effort"
            subtitle="Pure dollar ranking quietly hands you the expensive schedule. Bubble size is how many items sit at the same applicant — batching those is far cheaper per item than working the same dollars scattered across six applicants."
            table={{
              columns: ['Record', 'Applicant', 'Unlocks', 'Effort score', 'Batchable at applicant'],
              rows: result.candidates.map((c) => [c.entity, c.applicantName, money(c.unlock), c.effortScore, c.batchSize]),
            }}
            note="Click a bubble to open the record."
          >
            {(w) => (
              <ValueEffortScatter
                width={w}
                points={result.candidates.slice(0, 120).map((c) => ({
                  id: c.id,
                  label: c.entity,
                  effort: c.effortScore,
                  value: c.unlock,
                  batch: c.batchSize,
                  sub: `${c.applicantName} · ${c.effortLabel}`,
                }))}
                onSelect={onSelect}
              />
            )}
          </ChartFrame>

          <ChartFrame
            title="Batching — where the work clusters"
            subtitle="Total unlocked by applicant. Two or three trips can cover a surprising share of the queue."
            table={{
              columns: ['Applicant', 'Items', 'Unlocks'],
              rows: result.batches.map((b) => [b.applicantName, b.items, money(b.unlock)]),
            }}
          >
            {(w) => (
              <StackedBarRows
                width={w}
                labelWidth={210}
                valueFormat={money}
                rows={result.batches.slice(0, 12).map((b) => ({
                  label: b.applicantName,
                  segments: [
                    {
                      key: b.applicantName,
                      label: 'Unlocked',
                      value: b.unlock,
                      color: 'var(--seq-450)',
                      tipLines: [`${b.items} items`, money(b.unlock)],
                    },
                  ],
                }))}
              />
            )}
          </ChartFrame>
        </div>
      );
    }

    /* ----------------------------------------------------------------- 11 */
    case 'closeout-extensions': {
      const { closeoutExtensions } = all;
      const horizon = HORIZON_BUCKETS.map((b) => {
        const hit = closeoutExtensions.horizon.find((h) => h.key === b.key);
        return { key: b.key, label: b.label, count: hit?.count ?? 0, dollars: hit?.dollars ?? 0 };
      });

      return (
        <div className="grid">
          <ChartFrame
            title={`The closeout cliff — deadlines landing over the next 26 weeks`}
            subtitle={`Cumulative count of open projects crossing PoP + ${CLOSEOUT.daysAfterPop} days without an extension on file. This is not a status view, it is a staffing view: the wave is visible a month before it lands, which is the only point at which you can do anything about it.`}
            actions={
              <>
                <button type="button" className="mini-btn" aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>
                  Count
                </button>
                <button type="button" className="mini-btn" aria-pressed={metric === 'dollars'} onClick={() => setMetric('dollars')}>
                  Dollars
                </button>
              </>
            }
            table={{
              columns: ['Week of', 'Deadlines that week', 'Dollars', 'Cumulative', 'Cumulative $'],
              rows: closeoutExtensions.cliff.map((c) => [
                formatDate(c.weekStart),
                c.crossingCount,
                money(c.crossingDollars),
                c.cumulativeCount,
                money(c.cumulativeDollars),
              ]),
            }}
          >
            {(w) => <CliffChart width={w} weeks={closeoutExtensions.cliff} metric={metric} />}
          </ChartFrame>

          <ChartFrame
            title="Closeout deadline horizon"
            subtitle={`Projects with no closeout extension on the books, bucketed against the PoP + ${CLOSEOUT.daysAfterPop} day deadline. Anything in the first bar is already exposed.`}
            actions={
              <>
                <button type="button" className="mini-btn" aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>
                  Count
                </button>
                <button type="button" className="mini-btn" aria-pressed={metric === 'dollars'} onClick={() => setMetric('dollars')}>
                  Dollars
                </button>
              </>
            }
            table={{
              columns: ['Window', 'Projects', 'Obligated $'],
              rows: horizon.map((h) => [h.label, h.count, money(h.dollars)]),
            }}
            note="Each of these has two exits — extend it, or close it. The queue below carries closeout readiness alongside the deadline so the choice of lever is obvious."
          >
            {(w) => <HorizonColumns width={w} buckets={horizon} metric={metric} />}
          </ChartFrame>
        </div>
      );
    }
  }
}
