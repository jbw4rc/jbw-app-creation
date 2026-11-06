import { useEffect, useMemo, useState } from 'react';
import { feed as liveFeed } from './data/feed';
import { sampleFeed, sampleRejected } from './data/sampleFeed';
import type { Category, Declaration, Tier } from './types';
import { CATEGORY_LABEL, TIER_LABEL } from './lib/classify';
import {
  activeDeclarations,
  agoLabel,
  applyFilters,
  declarationsByState,
  DEFAULT_FILTERS,
  dueState,
  isNew,
  toCsv,
  type Filters,
  type SortKey,
} from './lib/view';
import { OppCard } from './components/OppCard';
import { WhereTheWorkIs } from './components/WhereTheWorkIs';
import { SourceStatus } from './components/SourceStatus';

// Live data wins as soon as the scanner has run once; until then the page
// shows invented sample data under a banner, so the layout can be judged.
const isSample = liveFeed.generatedAt === null;
const feed = isSample ? sampleFeed : liveFeed;

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const TIERS: Tier[] = ['core', 'likely', 'adjacent'];

// The watchlist is a per-device convenience, so browser storage is the right
// home. Storage can be missing or throw (private mode); the list then just
// does not persist.
const STAR_KEY = 'pabids.starred';
function loadStars(): Set<string> {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [starred, setStarred] = useState<Set<string>>(loadStars);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    try {
      localStorage.setItem(STAR_KEY, JSON.stringify([...starred]));
    } catch {
      /* watchlist just won't persist */
    }
  }, [starred]);

  const active = useMemo(() => activeDeclarations(feed.declarations), []);
  const byState = useMemo(() => declarationsByState(active), [active]);
  const byNumber = useMemo(() => new Map<number, Declaration>(feed.declarations.map((d) => [d.disasterNumber, d])), []);
  const declaredStates = useMemo(() => new Set(byState.keys()), [byState]);

  const openOpps = useMemo(() => feed.opportunities.filter((o) => dueState(o) !== 'closed'), []);
  const openByState = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of openOpps) if (o.state) m.set(o.state, (m.get(o.state) ?? 0) + 1);
    return m;
  }, [openOpps]);
  const states = useMemo(
    () => [...new Set([...feed.opportunities.map((o) => o.state).filter((s): s is string => !!s), ...byState.keys()])].sort(),
    [byState]
  );

  const shown = useMemo(() => applyFilters(feed.opportunities, f, { declaredStates, starred }), [f, declaredStates, starred]);

  const toggleCat = (c: Category) =>
    set('categories', f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c]);
  const toggleStar = (id: string) =>
    setStarred((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="app">
      <header className="top">
        <div className="top__title">
          <p className="eyebrow">FEMA Public Assistance</p>
          <h1>PA Bid Scanner</h1>
          <p>
            Nationwide RFPs, RFQs and sources-sought notices for PA-eligible work, scored for relevance and tied to the
            disaster declarations that fund them.
          </p>
        </div>
        <dl className="top__meta">
          <div><dt>Open bids</dt><dd>{openOpps.length}</dd></div>
          <div><dt>New this week</dt><dd>{openOpps.filter((o) => isNew(o)).length}</dd></div>
          <div><dt>Active PA declarations</dt><dd>{active.length}</dd></div>
          <div><dt>Last scan</dt><dd>{isSample ? '—' : agoLabel(feed.generatedAt!)}</dd></div>
        </dl>
      </header>

      {isSample && (
        <div className="banner" role="note">
          <strong>Sample data.</strong> The scanner hasn't run yet, so these postings and agencies are invented. They go
          through the real classifier: {sampleRejected} trap titles (IT "disaster recovery", welfare "public
          assistance", stormwater) were scored and dropped. Run the <em>Build FEMA PA bids</em> workflow to load live
          postings.
        </div>
      )}

      <div className="layout">
        <main>
          <section className="filters panel" aria-label="Filters">
            <div className="filters__row">
              <input
                type="search"
                placeholder="Search title, agency, county, solicitation #…"
                value={f.q}
                onChange={(e) => set('q', e.target.value)}
                aria-label="Search"
              />
              <select value={f.state} onChange={(e) => set('state', e.target.value)} aria-label="State">
                <option value="">All states</option>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={f.minTier} onChange={(e) => set('minTier', e.target.value as Tier)} aria-label="Minimum relevance">
                {TIERS.map((t) => (
                  <option key={t} value={t}>{t === 'adjacent' ? 'All relevance' : `${TIER_LABEL[t]}${t === 'likely' ? ' and up' : ' only'}`}</option>
                ))}
              </select>
              <select value={f.sort} onChange={(e) => set('sort', e.target.value as SortKey)} aria-label="Sort">
                <option value="score">Sort: relevance</option>
                <option value="due">Sort: due soonest</option>
                <option value="newest">Sort: newest</option>
              </select>
            </div>
            <div className="chips" role="group" aria-label="Work category">
              {CATEGORIES.map((c) => (
                <button key={c} className={`chip cat--${c}${f.categories.includes(c) ? ' is-on' : ''}`} aria-pressed={f.categories.includes(c)} onClick={() => toggleCat(c)}>
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <div className="toggles">
              <label><input type="checkbox" checked={f.newOnly} onChange={(e) => set('newOnly', e.target.checked)} /> New this week</label>
              <label><input type="checkbox" checked={f.declaredOnly} onChange={(e) => set('declaredOnly', e.target.checked)} /> In a declared disaster area</label>
              <label><input type="checkbox" checked={f.starredOnly} onChange={(e) => set('starredOnly', e.target.checked)} /> Watchlist ({starred.size})</label>
              <label><input type="checkbox" checked={f.includeClosed} onChange={(e) => set('includeClosed', e.target.checked)} /> Show closed</label>
            </div>
          </section>

          <div className="results__bar">
            <span>
              <strong>{shown.length}</strong> {shown.length === 1 ? 'posting' : 'postings'}
              {filtered && (
                <button className="link" onClick={() => setF(DEFAULT_FILTERS)}>Clear filters</button>
              )}
            </span>
            <button className="btn" disabled={!shown.length} onClick={() => download(`fema-pa-bids-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(shown))}>
              Export CSV
            </button>
          </div>

          <div className="results">
            {shown.map((o) => (
              <OppCard
                key={o.id}
                o={o}
                stateDecls={o.state ? byState.get(o.state) ?? [] : []}
                namedDecls={byNumber}
                starred={starred.has(o.id)}
                onStar={() => toggleStar(o.id)}
              />
            ))}
            {shown.length === 0 && (
              <div className="empty panel">
                <p><strong>Nothing matches.</strong></p>
                <p className="muted">
                  {feed.opportunities.length === 0
                    ? 'The scanner has run but found no PA postings yet. Check the Sources panel, and add CSV exports (Texas ESBD and others) to scripts/fema/imports/.'
                    : 'Try widening the filters.'}
                </p>
              </div>
            )}
          </div>
        </main>

        <aside>
          <SourceStatus sources={feed.sources} />
          <WhereTheWorkIs byState={byState} openByState={openByState} selected={f.state} onPick={(s) => set('state', s)} />
          <section className="panel legend">
            <h2>How scoring works</h2>
            <p>
              A strong read needs both a <strong>disaster tie</strong> (FEMA, Stafford Act, a DR number, a named hurricane
              or flood, 2 CFR 200) and <strong>PA-type work</strong> (debris, monitoring, PA consulting, emergency
              measures, repairs). When both show up, the score gets a bonus.
            </p>
            <ul>
              <li><span className="pill pill--core">Core PA</span> 60+</li>
              <li><span className="pill pill--likely">Likely PA</span> 35–59</li>
              <li><span className="pill pill--adjacent">Adjacent</span> 15–34</li>
            </ul>
            <p className="muted">IT disaster recovery, welfare "public assistance" and stormwater work are filtered out.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
