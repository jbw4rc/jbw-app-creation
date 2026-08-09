import { useMemo, useState } from 'react';
import type { IndicatorId } from '../types';
import type { AllIndicators } from '../lib/indicators';
import { money } from '../lib/format';
import { downloadCsv } from '../lib/exportCsv';

/**
 * The orthogonal spine. The eleven queues are organised by problem type; field
 * staff need the same data organised by who they have to call today.
 */
export function ApplicantScorecard({ all, onOpen }: { all: AllIndicators; onOpen: (id: IndicatorId) => void }) {
  const [sortBy, setSortBy] = useState<'exceptions' | 'dollars' | 'name'>('exceptions');

  const rows = useMemo(() => {
    const byAccount = new Map<
      string,
      { applicantName: string; disasterId: string; counts: Partial<Record<IndicatorId, number>>; dollars: number; total: number }
    >();

    for (const id of all.order) {
      // Prioritization queues restate items already counted elsewhere.
      if (id === 'validation-priority' || id === 'closeout-priority') continue;
      for (const r of all.byId[id].rows) {
        // Readiness queues: only "ready" rows are actionable, not the blocked ones.
        const readinessQueue = ['small-project-closeout', 'cat-z-closeout', 'account-closeout'].includes(id);
        if (readinessQueue && r.severity !== 'clear') continue;

        const cur = byAccount.get(r.accountId) ?? {
          applicantName: r.applicantName,
          disasterId: r.disasterId,
          counts: {},
          dollars: 0,
          total: 0,
        };
        cur.counts[id] = (cur.counts[id] ?? 0) + 1;
        cur.dollars += r.dollars;
        cur.total += 1;
        byAccount.set(r.accountId, cur);
      }
    }

    const list = [...byAccount.entries()].map(([accountId, v]) => ({ accountId, ...v }));
    return list.sort((a, b) => {
      if (sortBy === 'name') return a.applicantName.localeCompare(b.applicantName);
      if (sortBy === 'dollars') return b.dollars - a.dollars;
      return b.total - a.total;
    });
  }, [all, sortBy]);

  const shownIndicators = all.order.filter((id) => id !== 'validation-priority' && id !== 'closeout-priority');

  return (
    <>
      <div className="callout">
        <h4>How to read this</h4>
        A chip is the number of open items for that indicator on that applicant-disaster account. Blank means nothing
        flagged. The prioritization queues (9 and 10) are left out because they restate items already counted in the
        other columns.
      </div>

      <div className="table-toolbar">
        <span className="result-count">{rows.length.toLocaleString()} accounts with at least one open item</span>
        <div className="chart-actions">
          <button type="button" className="mini-btn" aria-pressed={sortBy === 'exceptions'} onClick={() => setSortBy('exceptions')}>
            Most items
          </button>
          <button type="button" className="mini-btn" aria-pressed={sortBy === 'dollars'} onClick={() => setSortBy('dollars')}>
            Most dollars
          </button>
          <button type="button" className="mini-btn" aria-pressed={sortBy === 'name'} onClick={() => setSortBy('name')}>
            A–Z
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              downloadCsv(
                `applicant-scorecard-${all.ds.asOf}.csv`,
                ['Applicant', 'Disaster', ...shownIndicators.map((id) => `${all.byId[id].def.number}. ${all.byId[id].def.shortTitle}`), 'Total items', 'Dollars'],
                rows.map((r) => [
                  r.applicantName,
                  r.disasterId,
                  ...shownIndicators.map((id) => r.counts[id] ?? 0),
                  r.total,
                  r.dollars,
                ]),
              )
            }
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Disaster</th>
              {shownIndicators.map((id) => (
                <th key={id} className="num" title={all.byId[id].def.title}>
                  <button type="button" className="row-btn" onClick={() => onOpen(id)} style={{ color: 'inherit' }}>
                    {all.byId[id].def.number}
                  </button>
                </th>
              ))}
              <th className="num">Total</th>
              <th className="num">Dollars</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.accountId}>
                <td>{r.applicantName}</td>
                <td className="cell-sub">{r.disasterId}</td>
                {shownIndicators.map((id) => (
                  <td key={id} className="num">
                    {r.counts[id] ? <span className="scorecard-chip">{r.counts[id]}</span> : <span style={{ color: 'var(--text-muted)' }}>·</span>}
                  </td>
                ))}
                <td className="num">
                  <strong>{r.total}</strong>
                </td>
                <td className="num">{money(r.dollars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 200 ? (
        <p className="result-count" style={{ marginTop: 8 }}>
          Showing the first 200 accounts. Export to CSV for the full list.
        </p>
      ) : null}
    </>
  );
}
