import { useMemo, useState } from 'react';
import { oddsHistory } from './data/oddsHistory';
import { clvArchive } from './data/clvArchive';
import { sampleHistory } from './data/sampleHistory';
import { sampleClv } from './data/sampleClv';
import { readSlate, scoreBand, sideLabel, STRONG_MIN } from './lib/sharp';
import { summarize } from './lib/clv';
import { TrackRecord } from './components/TrackRecord';
import type { GameRead } from './lib/sharp';
import { GameRow } from './components/GameRow';
import { endOfNflWeek, stampLabel } from './lib/format';
import { findGame } from './lib/market';

type View = 'board' | 'record';
type Lens = 'best' | 'spread' | 'total';

const LENSES: { id: Lens; label: string; blurb: string }[] = [
  { id: 'best', label: 'Strongest play', blurb: 'Rank each game by whichever market is louder' },
  { id: 'spread', label: 'Spreads only', blurb: 'Rank by the spread read alone' },
  { id: 'total', label: 'Totals only', blurb: 'Rank by the total read alone' },
];

// Live data wins whenever it exists; the synthetic fixture is only a
// placeholder for a repo that has never polled. Keeping them in separate files
// means a fixture rebuild can never clobber real accumulated history.
const history = oddsHistory.snapshots.length > 0 ? oddsHistory : sampleHistory;
const archive = clvArchive.games.length > 0 ? clvArchive : sampleClv;

export default function App() {
  const [view, setView] = useState<View>('board');
  const [lens, setLens] = useState<Lens>('best');
  const [minScore, setMinScore] = useState(0);
  const [weekOnly, setWeekOnly] = useState(true);
  const [showMethod, setShowMethod] = useState(false);

  const slate = useMemo(() => readSlate(history), []);
  const record = useMemo(() => summarize(archive, STRONG_MIN), []);
  const latest = history.snapshots[history.snapshots.length - 1];

  // The API posts next week's openers alongside this week's slate; those lines
  // have had no real money through them, so they default to hidden.
  const weekEnd = useMemo(() => endOfNflWeek(), []);
  const thisWeek = useMemo(
    () => slate.filter((g) => new Date(g.commenceTime).getTime() < weekEnd),
    [slate, weekEnd]
  );
  const laterCount = slate.length - thisWeek.length;

  const ranked = useMemo(() => {
    const pick = (g: GameRead) =>
      lens === 'best' ? g.best : lens === 'spread' ? g.spread : g.total;
    return [...(weekOnly ? thisWeek : slate)]
      .map((g) => ({ game: g, read: pick(g) }))
      .filter((r) => r.read.score >= minScore)
      .sort((a, b) => b.read.score - a.read.score);
  }, [slate, thisWeek, weekOnly, lens, minScore]);

  const scoped = weekOnly ? thisWeek : slate;
  const strong = scoped.filter((g) => scoreBand(g.best.score).tone === 'strong').length;
  const leans = scoped.filter((g) => scoreBand(g.best.score).tone === 'lean').length;

  return (
    <div className="app">
      <header className="top">
        <div className="top__title">
          <h1>Sharp Board</h1>
          <p>
            Where the money is, and whose money it is — read off the gap between the
            books that take sharp action and the books that take yours.
          </p>
        </div>
        <div className="top__meta">
          <div>
            <span className="top__k">Slate</span>
            <span className="top__v">
              {history.season ? `${history.season} ` : ''}
              {history.week ? `Week ${history.week}` : 'Current board'}
            </span>
          </div>
          <div>
            <span className="top__k">Games</span>
            <span className="top__v">{scoped.length}</span>
          </div>
          <div>
            <span className="top__k">Last poll</span>
            <span className="top__v">{stampLabel(history.updatedAt)}</span>
          </div>
          <div>
            <span className="top__k">History</span>
            <span className="top__v">{history.snapshots.length} snapshots</span>
          </div>
        </div>
      </header>

      <nav className="views">
        <button
          className={`view ${view === 'board' ? 'view--on' : ''}`}
          onClick={() => setView('board')}
        >
          This week's board
        </button>
        <button
          className={`view ${view === 'record' ? 'view--on' : ''}`}
          onClick={() => setView('record')}
        >
          Track record
          {record.overall.n > 0 && <span className="view__n"> {record.overall.n}</span>}
        </button>
      </nav>

      {view === 'record' && <TrackRecord summary={record} sample={archive.sample} />}

      {view === 'board' && (
        <>
      {history.sample && (
        <div className="banner banner--warn">
          <b>Sample data.</b> These are synthetic lines built to exercise every signal,
          not a live market — do not bet them. Add an <code>ODDS_API_KEY</code> repository
          secret and the hourly job replaces this with the real board.
        </div>
      )}

      <div className="summary">
        <div className="summary__stat">
          <b>{strong}</b> strong sharp side{strong === 1 ? '' : 's'}
        </div>
        <div className="summary__stat">
          <b>{leans}</b> lean{leans === 1 ? '' : 's'}
        </div>
        <div className="summary__stat summary__stat--muted">
          <b>{scoped.length - strong - leans}</b> with no edge worth playing
        </div>
        {laterCount > 0 && (
          <button className="linkbtn" onClick={() => setWeekOnly((v) => !v)}>
            {weekOnly
              ? `show ${laterCount} game${laterCount === 1 ? '' : 's'} from later weeks`
              : 'hide later weeks'}
          </button>
        )}
      </div>

      <nav className="lenses">
        {LENSES.map((l) => (
          <button
            key={l.id}
            className={`lens ${lens === l.id ? 'lens--on' : ''}`}
            onClick={() => setLens(l.id)}
            title={l.blurb}
          >
            {l.label}
          </button>
        ))}
        <label className="filter">
          Hide below
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
          <b>{minScore}</b>
        </label>
      </nav>

      <main className="slate">
        {ranked.length === 0 && (
          <p className="empty">Nothing on the board clears a score of {minScore}.</p>
        )}
        {ranked.map((r, i) => (
          <GameRow
            key={r.game.id}
            read={r.game}
            rank={i + 1}
            quote={findGame(latest.games, r.game.id)}
          />
        ))}
      </main>
        </>
      )}

      <footer className="foot">
        <button className="linkbtn" onClick={() => setShowMethod((v) => !v)}>
          {showMethod ? 'Hide' : 'How the score works'}
        </button>
        {showMethod && (
          <div className="method">
            <h3>Reading the board</h3>
            <p>
              Every book's posted line and juice is converted into one number: the
              expected margin (or total) that book's price implies. That makes
              DraftKings at −2.5 (−120) directly comparable to Pinnacle at −3 (−105)
              instead of an argument about half-points.
            </p>
            <p>
              <b>The public side</b> is inferred from the gap. Retail books shade their
              numbers away from whatever the public is loading up on, because that is
              how they protect a one-sided book. So when retail sits off the sharp
              number, the side they made worse is the side the public is on.
            </p>
            <p>
              <b>The sharp side</b> is where the weight of five reads lands: the
              sharp/retail gap, whether the line moved against the public, how fast it
              moved, whether the price moved while the number sat still, and whether a
              book gave up a key number. Signals that agree add up; signals that
              disagree cancel. A game with one loud move and three reads pointing back
              the other way ranks below a game where everything lines up.
            </p>
            <p className="method__caveat">
              Three honest caveats. The movement reads — reverse line movement, steam,
              price-versus-line — all describe the same underlying move from different
              angles, so they reinforce each other by design rather than being fully
              independent evidence. Polling runs a handful of times a day on the free
              API tier, so a fast move inside one window is smoothed into a drift.
              And this is a read on where money is going, not a prediction of who
              wins — the sharp side loses plenty of games.
            </p>
            {ranked[0] && (
              <p className="method__example">
                Worked example, top of the current board: {ranked[0].game.awayTeam} at{' '}
                {ranked[0].game.homeTeam} scores {Math.round(ranked[0].read.score)} —{' '}
                {scoreBand(ranked[0].read.score).label.toLowerCase()} on{' '}
                {sideLabel(ranked[0].read.sharpSide, ranked[0].game)}, against public
                money on {sideLabel(ranked[0].read.squareSide, ranked[0].game)}.
              </p>
            )}
          </div>
        )}
        <p className="foot__fine">
          Odds via The Odds API. Nothing here is betting advice; a sharp side is a read
          on money flow, not a winner.
        </p>
      </footer>
    </div>
  );
}
