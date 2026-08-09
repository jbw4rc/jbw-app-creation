import { useMemo, useState } from 'react';
import type { ExceptionRow, IndicatorDefinition, Severity } from '../types';
import { money, moneyFull } from '../lib/format';
import { daysBetween } from '../lib/dates';
import { downloadCsv } from '../lib/exportCsv';
import type { AnnotationMap } from '../lib/localState';

type SortKey = 'severity' | 'age' | 'dollars' | 'applicant' | 'entity';

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, clear: 3 };
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  serious: 'Serious',
  warning: 'Watch',
  clear: 'Ready',
};

export function QueueTable({
  def,
  rows,
  asOf,
  annotations,
  onSelect,
  showDismissed,
  onToggleDismissed,
}: {
  def: IndicatorDefinition;
  rows: ExceptionRow[];
  asOf: string;
  annotations: AnnotationMap;
  onSelect: (row: ExceptionRow) => void;
  showDismissed: boolean;
  onToggleDismissed: () => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'severity', dir: 'asc' });

  const visible = useMemo(() => {
    const filtered = showDismissed ? rows : rows.filter((r) => !annotations[r.id]?.dismissed);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'severity':
          return (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) * dir || b.dollars - a.dollars;
        case 'age':
          return ((a.ageDays ?? -1) - (b.ageDays ?? -1)) * dir;
        case 'dollars':
          return (a.dollars - b.dollars) * dir;
        case 'applicant':
          return a.applicantName.localeCompare(b.applicantName) * dir;
        case 'entity':
          return a.entity.localeCompare(b.entity) * dir;
      }
    });
  }, [rows, sort, annotations, showDismissed]);

  const dismissedCount = rows.filter((r) => annotations[r.id]?.dismissed).length;

  const header = (key: SortKey, label: string, numeric = false) => (
    <th
      className={`sortable${numeric ? ' num' : ''}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const exportRows = () =>
    downloadCsv(
      `${def.id}-${asOf}.csv`,
      ['ID', 'Entity', 'Detail', 'Applicant', 'Disaster', 'Severity', 'Age (days)', def.dollarLabel, 'Next action', 'Detected'],
      visible.map((r) => [
        r.id,
        r.entity,
        r.entityDetail,
        r.applicantName,
        r.disasterId,
        SEVERITY_LABEL[r.severity],
        r.ageDays ?? '',
        r.dollars,
        r.nextAction,
        r.detectedOn,
      ]),
    );

  return (
    <>
      <div className="table-toolbar">
        <span className="result-count">
          {visible.length.toLocaleString()} of {rows.length.toLocaleString()} rows · {money(visible.reduce((s, r) => s + r.dollars, 0))} · {def.dollarLabel.toLowerCase()}
        </span>
        <div className="chart-actions">
          {dismissedCount > 0 ? (
            <button type="button" className="mini-btn" aria-pressed={showDismissed} onClick={onToggleDismissed}>
              {showDismissed ? 'Hide' : 'Show'} {dismissedCount} dismissed
            </button>
          ) : null}
          <button type="button" className="ghost-btn" onClick={exportRows}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header('severity', 'Severity')}
              {header('entity', 'Record')}
              {header('applicant', 'Applicant')}
              <th>Disaster</th>
              {header('age', 'Age', true)}
              {header('dollars', def.dollarLabel, true)}
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Nothing in this queue for the current filter.</div>
                </td>
              </tr>
            ) : (
              visible.slice(0, 300).map((r) => {
                const isNew = daysBetween(r.detectedOn, asOf) <= 7 && daysBetween(r.detectedOn, asOf) >= 0;
                const ann = annotations[r.id];
                return (
                  <tr key={r.id} className={ann?.dismissed ? 'dismissed' : undefined}>
                    <td>
                      <span className="sev-chip">
                        <span className={`sev-dot ${r.severity}`} aria-hidden="true" />
                        {SEVERITY_LABEL[r.severity]}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="row-btn mono-id" onClick={() => onSelect(r)}>
                        {r.entity}
                      </button>
                      {isNew ? <span className="new-badge">new</span> : null}
                      <div className="cell-sub">{r.entityDetail}</div>
                      {ann?.note ? <div className="cell-sub">📝 {ann.note}</div> : null}
                    </td>
                    <td>{r.applicantName}</td>
                    <td className="cell-sub">{r.disasterId}</td>
                    <td className="num">{r.ageDays === null ? '—' : `${r.ageDays}d`}</td>
                    <td className="num" title={moneyFull(r.dollars)}>
                      {money(r.dollars)}
                    </td>
                    <td className="action-cell">{r.nextAction}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {visible.length > 300 ? (
        <p className="result-count" style={{ marginTop: 8 }}>
          Showing the first 300 rows. Narrow the filter or export to CSV for the full set.
        </p>
      ) : null}
    </>
  );
}
