import { useEffect, useState } from 'react';
import type { ExceptionRow, IndicatorId } from '../types';
import type { AllIndicators } from '../lib/indicators';
import { money } from '../lib/format';
import type { Annotation, AnnotationMap } from '../lib/localState';

/**
 * The cross-indicator view. A project that shows up in three queues at once is
 * the single thing eleven separate Excel tables cannot tell you today.
 */
export function RecordDrawer({
  row,
  all,
  annotations,
  onAnnotate,
  onClose,
  onJump,
}: {
  row: ExceptionRow;
  all: AllIndicators;
  annotations: AnnotationMap;
  onAnnotate: (id: string, patch: Partial<Annotation>) => void;
  onClose: () => void;
  onJump: (indicator: IndicatorId) => void;
}) {
  const ann = annotations[row.id];
  const [note, setNote] = useState(ann?.note ?? '');

  useEffect(() => setNote(annotations[row.id]?.note ?? ''), [row.id, annotations]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Where else does this project / account appear?
  const alsoIn = all.order
    .filter((id) => id !== row.indicator)
    .map((id) => {
      const hits = all.byId[id].rows.filter((r) =>
        row.projectId ? r.projectId === row.projectId : r.accountId === row.accountId,
      );
      return { id, hits };
    })
    .filter((x) => x.hits.length > 0);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Detail for ${row.entity}`}>
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">{row.entity}</h2>
            <p className="drawer-sub">
              {row.entityDetail}
              <br />
              {row.applicantName} · {row.disasterId}
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="callout">
          <h4>Next action</h4>
          {row.nextAction}
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            {money(row.dollars)} · {all.byId[row.indicator].def.dollarLabel.toLowerCase()}
            {row.ageDays !== null ? ` · ${row.ageDays} days old` : ''}
          </div>
        </div>

        <div className="drawer-section">
          <h3>Record detail</h3>
          <dl className="detail-grid">
            {row.detail.map((d) => (
              <div key={d.label} style={{ display: 'contents' }}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="drawer-section">
          <h3>Also appears in</h3>
          {alsoIn.length === 0 ? (
            <p className="result-count">This record is not flagged by any other indicator.</p>
          ) : (
            <div className="cross-ref">
              {alsoIn.map((x) => (
                <button key={x.id} type="button" className="cross-chip" onClick={() => onJump(x.id)}>
                  <span className="tile-num">{all.byId[x.id].def.number}</span>
                  {all.byId[x.id].def.shortTitle}
                  <span style={{ color: 'var(--text-muted)' }}>{x.hits.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h3>Notes (saved in this browser only)</h3>
          <textarea
            value={note}
            placeholder="Why this is being worked, who owns it, what you're waiting on…"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onAnnotate(row.id, { note: note.trim() || undefined })}
          />
          <div className="chart-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="ghost-btn"
              aria-pressed={Boolean(ann?.dismissed)}
              onClick={() => onAnnotate(row.id, { dismissed: !ann?.dismissed })}
            >
              {ann?.dismissed ? 'Restore to queue' : 'Dismiss as false positive'}
            </button>
          </div>
          <p className="result-count" style={{ marginTop: 8 }}>
            Notes and dismissals live in this browser. Teammates will not see them — use{' '}
            <strong>Export annotations</strong> in the header to share a list.
          </p>
        </div>
      </aside>
    </>
  );
}
