import type { Declaration } from '../types';

interface Props {
  byState: Map<string, Declaration[]>;
  openByState: Map<string, number>;
  selected: string;
  onPick: (state: string) => void;
}

// Declarations are where solicitations come from: each designated county is a
// buyer for months to years. Ranking states by active PA declarations is the
// "where to look next" list, even before a bid shows up on the board.
export function WhereTheWorkIs({ byState, openByState, selected, onPick }: Props) {
  const rows = [...byState.entries()]
    .map(([state, decls]) => ({ state, decls, counties: new Set(decls.flatMap((d) => d.areas)).size }))
    .sort((a, b) => b.decls.length - a.decls.length || b.counties - a.counties);
  return (
    <section className="panel where">
      <h2>Where the work is</h2>
      <p className="muted">Active FEMA declarations with Public Assistance, last 24 months. Tap a state to filter.</p>
      {rows.length === 0 && <p className="muted">No declarations loaded yet.</p>}
      <ol>
        {rows.map(({ state, decls, counties }) => (
          <li key={state}>
            <button className={`where__row${selected === state ? ' is-on' : ''}`} onClick={() => onPick(selected === state ? '' : state)}>
              <span className="where__st">{state}</span>
              <span className="where__info">
                <span>{decls.length} declaration{decls.length > 1 ? 's' : ''} · {counties} area{counties === 1 ? '' : 's'}</span>
                <span className="muted where__latest">
                  Latest: {decls[0].declarationType}-{decls[0].disasterNumber} {decls[0].title}
                </span>
              </span>
              <span className="where__open" title="Open bids on the board">{openByState.get(state) ?? 0}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
