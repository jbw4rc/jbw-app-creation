import { useEffect, useMemo, useState } from 'react';
import type { ExceptionRow, IndicatorId } from './types';
import { computeAll, filterDataset, type FilterState } from './lib/indicators';
import { generateDataset } from './data/generate';
import { formatDateTime } from './lib/dates';
import { count as fmtCount } from './lib/format';
import { CommandCenter } from './components/CommandCenter';
import { IndicatorView } from './components/IndicatorView';
import { ApplicantScorecard } from './components/ApplicantScorecard';
import { RecordDrawer } from './components/RecordDrawer';
import { downloadAnnotations, useAnnotations } from './lib/localState';

type View = { kind: 'command' } | { kind: 'indicator'; id: IndicatorId } | { kind: 'scorecard' };

const ARCHETYPE_GROUPS: Array<{ label: string; ids: IndicatorId[] }> = [
  { label: 'Reconciliation', ids: ['rfi-misalignment', 'time-extensions', 'withdrawn-misalignment'] },
  { label: 'Aging vs. target', ids: ['rfr-aging', 'large-project-validation', 'closeout-extensions'] },
  { label: 'Closeout readiness', ids: ['small-project-closeout', 'cat-z-closeout', 'account-closeout'] },
  { label: 'Prioritization', ids: ['validation-priority', 'closeout-priority'] },
];

export default function App() {
  const [view, setView] = useState<View>({ kind: 'command' });
  const [filter, setFilter] = useState<FilterState>({ disasterId: 'all', applicantQuery: '', newOnly: false });
  const [selected, setSelected] = useState<ExceptionRow | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const { annotations, update, importMap } = useAnnotations();

  const baseDataset = useMemo(() => generateDataset(), []);
  const dataset = useMemo(() => filterDataset(baseDataset, filter), [baseDataset, filter]);
  const all = useMemo(() => computeAll(dataset), [dataset]);

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const title =
    view.kind === 'command'
      ? 'Command center'
      : view.kind === 'scorecard'
        ? 'Applicant scorecard'
        : `${all.byId[view.id].def.number}. ${all.byId[view.id].def.title}`;

  const question =
    view.kind === 'command'
      ? 'Where is funding stuck, what breaches a deadline today, and is the backlog growing or shrinking?'
      : view.kind === 'scorecard'
        ? 'Which applicants carry the most open work across every indicator at once?'
        : all.byId[view.id].def.question;

  const openIndicator = (id: IndicatorId) => {
    setView({ kind: 'indicator', id });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-title">PA Grants Command Center</div>
          <div className="brand-sub">Public Assistance exception triage</div>
        </div>

        <button
          type="button"
          className="nav-item"
          aria-current={view.kind === 'command'}
          onClick={() => setView({ kind: 'command' })}
        >
          <span className="nav-num">◆</span>
          Command center
          <span className="nav-count">{fmtCount(all.totalExceptionCount)}</span>
        </button>
        <button
          type="button"
          className="nav-item"
          aria-current={view.kind === 'scorecard'}
          onClick={() => setView({ kind: 'scorecard' })}
        >
          <span className="nav-num">◈</span>
          Applicant scorecard
        </button>

        {ARCHETYPE_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.ids.map((id) => {
              const s = all.byId[id];
              const worst =
                s.severityCounts.critical > 0 ? 'critical' : s.severityCounts.serious > 0 ? 'serious' : s.severityCounts.warning > 0 ? 'warning' : 'clear';
              return (
                <button
                  key={id}
                  type="button"
                  className="nav-item"
                  aria-current={view.kind === 'indicator' && view.id === id}
                  onClick={() => openIndicator(id)}
                >
                  <span className="nav-num">{s.def.number}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.def.shortTitle}</span>
                  <span className="nav-count">
                    <span className={`sev-dot ${worst}`} aria-hidden="true" />
                    {fmtCount(s.headlineCount)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">
            <h1 className="page-title">{title}</h1>
            <p className="page-question">{question}</p>
          </div>
          <div className="topbar-meta">
            <span className="synthetic-badge" title="No real grant data is present in this build.">
              ● Synthetic data — illustrative only
            </span>
            <div className="source-strip">
              <span>
                FEMA Grants Portal <strong>{formatDateTime(all.ds.sources.femaGrantsPortal)}</strong>
              </span>
              <span>
                Client system <strong>{formatDateTime(all.ds.sources.clientSystemOfRecord)}</strong>
              </span>
              <span>
                Internal tracker <strong>{formatDateTime(all.ds.sources.internalTracker)}</strong>
              </span>
            </div>
            <div className="chart-actions">
              <button type="button" className="mini-btn" onClick={() => downloadAnnotations(annotations)}>
                Export annotations
              </button>
              <label className="mini-btn" style={{ cursor: 'pointer' }}>
                Import
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      importMap(JSON.parse(await file.text()));
                    } catch {
                      /* ignore malformed files */
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="mini-btn"
                onClick={() => setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'))}
              >
                Theme: {theme}
              </button>
            </div>
          </div>
        </div>

        {/* One filter row above everything it scopes — never per-card filters. */}
        <div className="filter-row">
          <span className="filter-label">Disaster</span>
          <select value={filter.disasterId} onChange={(e) => setFilter((f) => ({ ...f, disasterId: e.target.value }))}>
            <option value="all">All disasters</option>
            {baseDataset.disasters.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} — {d.name}
              </option>
            ))}
          </select>

          <span className="filter-label">Applicant</span>
          <input
            type="search"
            placeholder="Filter by applicant name…"
            value={filter.applicantQuery}
            onChange={(e) => setFilter((f) => ({ ...f, applicantQuery: e.target.value }))}
          />

          {filter.disasterId !== 'all' || filter.applicantQuery ? (
            <button type="button" className="ghost-btn" onClick={() => setFilter({ disasterId: 'all', applicantQuery: '', newOnly: false })}>
              Clear filters
            </button>
          ) : null}

          <span className="result-count" style={{ marginLeft: 'auto' }}>
            {fmtCount(dataset.projects.length)} projects · {fmtCount(dataset.accounts.length)} accounts · as of {all.ds.asOf}
          </span>
        </div>

        {view.kind === 'command' ? (
          <CommandCenter all={all} onOpen={openIndicator} />
        ) : view.kind === 'scorecard' ? (
          <ApplicantScorecard all={all} onOpen={openIndicator} />
        ) : (
          <IndicatorView id={view.id} all={all} annotations={annotations} onSelectRow={setSelected} />
        )}
      </main>

      {selected ? (
        <RecordDrawer
          row={selected}
          all={all}
          annotations={annotations}
          onAnnotate={update}
          onClose={() => setSelected(null)}
          onJump={(id) => {
            setSelected(null);
            openIndicator(id);
          }}
        />
      ) : null}
    </div>
  );
}
