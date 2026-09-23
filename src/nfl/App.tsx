import { useMemo, useState } from 'react';
import { oddsHistory } from './data/oddsHistory';
import { clvArchive } from './data/clvArchive';
import { sampleHistory } from './data/sampleHistory';
import { sampleClv } from './data/sampleClv';
import { readSlate, scoreBand, sideLabel, STRONG_MIN, PROVISIONAL_HOURS } from './lib/sharp';
import { summarize } from './lib/clv';
import { TrackRecord } from './components/TrackRecord';
import type { GameRead } from './lib/sharp';
import { GameRow } from './components/GameRow';
import { agoLabel, durationLabel, endOfNflWeek, hoursSince, stampLabel } from './lib/format';
import { findGame } from './lib/market';
import { recommend } from './lib/edge';
import type { Recommendation } from './lib/edge';
import { BookPicker } from './components/BookPicker';
import { YourBets } from './components/YourBets';
import { RefreshButton } from './components/RefreshButton';
import { CREDITS_PER_POLL, LOW_CREDITS } from './lib/refresh';

type View = 'board' | 'record';
type Lens = 'value' | 'best' | 'spread' | 'total';

const LENSES: { id: Lens; label: string; blurb: string }[] = [
  { id: 'value', label: 'Best bets', blurb: 'Rank by what the best price at your books is worth' },
  { id: 'best', label: 'Strongest play', blurb: 'Rank each game by whichever market is louder' },
  { id: 'spread', label: 'Spreads only', blurb: 'Rank by the spread read alone' },
  { id: 'total', label: 'Totals only', blurb: 'Rank by the total read alone' },
];

// Live data wins whenever it exists; the synthetic fixture is only a
// placeholder for a repo that has never polled. Keeping them in separate files
// means a fixture rebuild can never clobber real accumulated history.
const history = oddsHistory.snapshots.length > 0 ? oddsHistory : sampleHistory;
const archive = clvArchive.games.length > 0 ? clvArchive : sampleClv;

// Your books are a per-device preference, so browser storage is the right home
// for them. Storage can be missing or throw (private mode, blocked site data);
// the board then just starts with nothing picked.
const BOOKS_KEY = 'sharpboard.books';
function loadBooks(): string[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((b): b is string => typeof b === 'string') : [];
  } catch {
    return [];
  }
}
function saveBooks(books: string[]) {
  try {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  } catch {
    /* preference just won't persist */
  }
}

/** Tone for the credit readout: fine, low (cycle soon), or out. */
function creditLevel(remaining: number | undefined): string | undefined {
  if (remaining === undefined) return undefined;
  if (remaining < CREDITS_PER_POLL) return 'out';
  return remaining < LOW_CREDITS ? 'low' : 'ok';
}

/** How long the committed history actually spans, in hours. */
const spanHours = (() => {
  const s = history.snapshots;
  if (s.length < 2) return 0;
  return (
    (new Date(s[s.length - 1].takenAt).getTime() - new Date(s[0].takenAt).getTime()) / 3_600_000
  );
})();

export default function App() {
  const [view, setView] = useState<View>('board');
  const [books, setBooksState] = useState<string[]>(loadBooks);
  const [lens, setLens] = useState<Lens>(() => (loadBooks().length > 0 ? 'value' : 'best'));
  const setBooks = (next: string[]) => {
    // Picking your first book switches the board to your bets; clearing them
    // all drops back to the money read, since there is nothing left to price.
    if (books.length === 0 && next.length > 0) setLens('value');
    if (next.length === 0 && lens === 'value') setLens('best');
    setBooksState(next);
    saveBooks(next);
  };
  const [minScore, setMinScore] = useState(0);
  const [weekOnly, setWeekOnly] = useState(true);
  const [showMethod, setShowMethod] = useState(false);

  const slate = useMemo(() => readSlate(history), []);
  const record = useMemo(() => summarize(archive, STRONG_MIN), []);
  const latest = history.snapshots[history.snapshots.length - 1];

  const available = useMemo(() => {
    const seen = new Set<string>();
    for (const g of latest?.games ?? []) for (const b of g.books) seen.add(b.book);
    return [...seen].sort();
  }, [latest]);

  // One call per game at the viewer's books. Null means no books picked yet,
  // which is different from "picked, and nothing is worth betting".
  const recs = useMemo(() => {
    const m = new Map<string, Recommendation | null>();
    for (const g of slate) {
      m.set(g.id, books.length > 0 ? recommend(g, findGame(latest.games, g.id), books) : null);
    }
    return m;
  }, [slate, latest, books]);
  const evOf = (id: string) => recs.get(id)?.best?.ev ?? -Infinity;

  // The API posts next week's openers alongside this week's slate; those lines
  // have had no real money through them, so they default to hidden.
  const weekEnd = useMemo(() => endOfNflWeek(), []);
  const thisWeek = useMemo(
    () => slate.filter((g) => new Date(g.commenceTime).getTime() < weekEnd),
    [slate, weekEnd]
  );
  const laterCount = slate.length - thisWeek.length;

  // Kicked-off games come off the board entirely. This is a pregame tool: the
  // number it reads no longer exists, and nothing here can be acted on.
  const now = Date.now();
  const staleHours = hoursSince(history.updatedAt, now);
  const bettable = useMemo(
    () => thisWeek.filter((g) => new Date(g.commenceTime).getTime() > now),
    [thisWeek, now]
  );
  const startedCount = thisWeek.length - bettable.length;

  const ranked = useMemo(() => {
    const pick = (g: GameRead) =>
      lens === 'best' || lens === 'value' ? g.best : lens === 'spread' ? g.spread : g.total;
    const byValue = lens === 'value' && books.length > 0;
    return [...(weekOnly ? bettable : slate.filter((g) => new Date(g.commenceTime).getTime() > now))]
      .map((g) => ({ game: g, read: pick(g) }))
      .filter((r) => r.read.score >= minScore)
      .sort((a, b) =>
        byValue ? evOf(b.game.id) - evOf(a.game.id) : b.read.score - a.read.score
      );
  }, [slate, bettable, weekOnly, lens, minScore, now, recs, books]);

  const scoped = weekOnly ? bettable : slate.filter((g) => new Date(g.commenceTime).getTime() > now);
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
            <span className="top__v" data-stale={staleHours > 3 ? 'yes' : undefined}>
              {agoLabel(history.updatedAt, now)}
            </span>
            <span className="top__sub">{stampLabel(history.updatedAt)}</span>
          </div>
          <div>
            <span className="top__k">History</span>
            <span className="top__v">
              {history.snapshots.length} polls
              {spanHours > 0 && ` · ${durationLabel(spanHours)}`}
            </span>
          </div>
        </div>
        {!history.sample && (
          <div className="top__ops">
            <div className="credits" data-level={creditLevel(history.quota?.remaining)}>
              <span className="top__k">API credits</span>
              {history.quota ? (
                <>
                  <span className="top__v">
                    {history.quota.remaining} left
                    <span className="credits__of"> of {history.quota.used + history.quota.remaining}</span>
                  </span>
                  <span
                    className="credits__bar"
                    role="meter"
                    aria-label="API credits remaining"
                    aria-valuemin={0}
                    aria-valuemax={history.quota.used + history.quota.remaining}
                    aria-valuenow={history.quota.remaining}
                  >
                    <span
                      className="credits__fill"
                      style={{
                        width: `${(100 * history.quota.remaining) / Math.max(1, history.quota.used + history.quota.remaining)}%`,
                      }}
                    />
                  </span>
                  <span className="top__sub">
                    {history.quota.remaining < CREDITS_PER_POLL
                      ? 'Out — polls will fail until the key is cycled'
                      : history.quota.remaining < LOW_CREDITS
                        ? `Low — ~${Math.floor(history.quota.remaining / CREDITS_PER_POLL)} polls left, time to cycle the key`
                        : `~${Math.floor(history.quota.remaining / CREDITS_PER_POLL)} polls left · ${CREDITS_PER_POLL} per poll`}
                  </span>
                </>
              ) : (
                <>
                  <span className="top__v">—</span>
                  <span className="top__sub">shows after the next poll</span>
                </>
              )}
            </div>
            <RefreshButton
              updatedAt={history.updatedAt}
              remaining={history.quota?.remaining ?? null}
            />
          </div>
        )}
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
      {!history.sample && staleHours > 3 && (
        <div className="banner banner--warn">
          <b>Stale board — last polled {agoLabel(history.updatedAt, now)}.</b> The
          lines have almost certainly moved since. Treat everything below as a
          snapshot of {stampLabel(history.updatedAt)}, not as the market now.
        </div>
      )}

      {!history.sample && spanHours < PROVISIONAL_HOURS && (
        <div className="banner banner--warn">
          <b>Provisional board.</b> Only {durationLabel(spanHours)} of market history
          has been collected{history.snapshots.length < 2 ? ' so far' : ''}, so the
          movement signals — reverse line movement, steam, price-versus-line — have
          almost nothing to read yet. Low scores here mean "not observed", not "no
          sharp money". This board is built to watch a line from Tuesday; it gets
          meaningful once polling has run across a full week.
        </div>
      )}

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
        {startedCount > 0 && (
          <div className="summary__stat summary__stat--muted">
            <b>{startedCount}</b> already kicked off — removed
          </div>
        )}
        {laterCount > 0 && (
          <button className="linkbtn" onClick={() => setWeekOnly((v) => !v)}>
            {weekOnly
              ? `show ${laterCount} game${laterCount === 1 ? '' : 's'} from later weeks`
              : 'hide later weeks'}
          </button>
        )}
      </div>

      <BookPicker available={available} selected={books} onChange={setBooks} />

      {books.length > 0 ? (
        <YourBets
          books={books}
          rows={scoped.map((g) => ({ game: g, rec: recs.get(g.id)! })).filter((r) => r.rec)}
        />
      ) : (
        <p className="picker__hint">
          Pick the books you bet at and every game gets a plain call — the exact bet, the price,
          and what it is worth — priced at your books only.
        </p>
      )}

      <nav className="lenses">
        {LENSES.filter((l) => l.id !== 'value' || books.length > 0).map((l) => (
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
          <p className="empty">
            {startedCount > 0 && minScore === 0
              ? 'Every game this week has kicked off. Next week\u2019s board fills in as those lines open.'
              : `Nothing on the board clears a score of ${minScore}.`}
          </p>
        )}
        {ranked.map((r, i) => (
          <GameRow
            key={r.game.id}
            read={r.game}
            rank={i + 1}
            quote={findGame(latest.games, r.game.id)}
            rec={recs.get(r.game.id) ?? null}
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
            <p>
              <b>The bet</b> is a separate question from the score. The score says
              where the money went; the bet asks whether what is left at your books
              is worth taking. It treats the sharp books' number as the fair price
              and works out, for every side at every book you picked, how often it
              wins, pushes and loses — a push on 3 or 7 gives your stake back, which
              is why −3 and −3.5 are different bets — and what that is worth per
              $100. Worth $2 or more is a <b>bet</b>; a smaller positive number is
              <b> thin</b>, and so is anything whose fair price has neither Pinnacle
              nor Circa behind it. Sister brands like BetOnline and LowVig count
              once. "Good to" is the worst price at which the bet still clears the
              $2 bar, so you know when the book has moved too far.
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
