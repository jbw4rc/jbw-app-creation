import { useState } from 'react';
import type { Declaration, Opportunity } from '../types';
import { CATEGORY_LABEL, TIER_LABEL } from '../lib/classify';
import { dueLabel, dueState, isNew } from '../lib/view';

interface Props {
  o: Opportunity;
  /** Active PA declarations in the posting's state. */
  stateDecls: Declaration[];
  /** Declarations named by number in the posting. */
  namedDecls: Map<number, Declaration>;
  starred: boolean;
  onStar: () => void;
}

const femaLink = (n: number) => `https://www.fema.gov/disaster/${n}`;

export function OppCard({ o, stateDecls, namedDecls, starred, onStar }: Props) {
  const [open, setOpen] = useState(false);
  const due = dueState(o);
  const real = o.url && o.url !== '#';
  return (
    <article className={`opp opp--${o.tier}${due === 'closed' ? ' opp--closed' : ''}`}>
      <div className="opp__score" title={`${TIER_LABEL[o.tier]} — relevance ${o.score}/100`}>
        <span className="opp__num">{o.score}</span>
        <span className="opp__tier">{TIER_LABEL[o.tier]}</span>
      </div>

      <div className="opp__body">
        <div className="opp__top">
          <h3 className="opp__title">
            {real ? (
              <a href={o.url} target="_blank" rel="noreferrer noopener">{o.title}</a>
            ) : (
              o.title
            )}
          </h3>
          <button
            className={`star${starred ? ' star--on' : ''}`}
            onClick={onStar}
            aria-pressed={starred}
            aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
            title={starred ? 'On your watchlist' : 'Add to watchlist'}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>

        <p className="opp__who">
          <strong>{o.agency}</strong>
          {(o.place || o.state) && <span> · {o.place || o.state}</span>}
          {o.noticeType && <span> · {o.noticeType}</span>}
          {o.solicitationNumber && <span className="mono"> · {o.solicitationNumber}</span>}
        </p>

        <div className="opp__tags">
          <span className={`due due--${due}`}>{dueLabel(o)}</span>
          {isNew(o) && <span className="tag tag--new">New</span>}
          {o.categories.map((c) => (
            <span key={c} className={`tag tag--cat cat--${c}`}>{CATEGORY_LABEL[c]}</span>
          ))}
          {o.disasterNumbers.map((n) => (
            <a key={n} className="tag tag--dr" href={femaLink(n)} target="_blank" rel="noreferrer noopener" title={namedDecls.get(n)?.title ?? 'FEMA disaster page'}>
              {n >= 3000 && n < 4000 ? 'EM' : 'DR'}-{n}
            </a>
          ))}
          {o.disasterNumbers.length === 0 && stateDecls.length > 0 && (
            <span className="tag tag--area" title={stateDecls.map((d) => `DR-${d.disasterNumber} ${d.title}`).join('\n')}>
              {stateDecls.length} active PA declaration{stateDecls.length > 1 ? 's' : ''} in {o.state}
            </span>
          )}
        </div>

        {o.summary && <p className="opp__summary">{o.summary}</p>}

        <button className="why" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Why it scored'} ▾
        </button>
        {open && (
          <div className="opp__why">
            <ul>
              {o.matched.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <dl>
              <div><dt>Source</dt><dd>{o.sourceName}</dd></div>
              {o.postedDate && <div><dt>Posted</dt><dd>{new Date(o.postedDate).toLocaleDateString()}</dd></div>}
              <div><dt>First seen</dt><dd>{new Date(o.firstSeen).toLocaleDateString()}</dd></div>
              {o.naics && <div><dt>NAICS</dt><dd className="mono">{o.naics}</dd></div>}
              {o.setAside && <div><dt>Set-aside</dt><dd>{o.setAside}</dd></div>}
            </dl>
          </div>
        )}
      </div>
    </article>
  );
}
