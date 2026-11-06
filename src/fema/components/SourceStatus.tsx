import type { SourceStatus as Status } from '../types';
import { agoLabel } from '../lib/view';

export function SourceStatus({ sources }: { sources: Status[] }) {
  if (sources.length === 0) return null;
  const bad = sources.filter((s) => !s.ok).length;
  return (
    <details className="panel sources" open={bad > 0}>
      <summary>
        <h2>Sources</h2>
        <span className={bad ? 'sources__bad' : 'sources__ok'}>
          {bad ? `${bad} of ${sources.length} need attention` : `all ${sources.length} OK`}
        </span>
      </summary>
      <ul>
        {sources.map((s) => (
          <li key={s.id} className={s.ok ? '' : 'is-bad'}>
            <span className="sources__dot" aria-hidden />
            <div>
              <strong>{s.name}</strong>
              <span className="muted"> · {s.ok ? `${s.kept} kept of ${s.fetched}` : 'failed'} · {agoLabel(s.ranAt)}</span>
              {s.message && <p className="sources__msg">{s.message}</p>}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
