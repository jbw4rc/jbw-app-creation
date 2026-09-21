// The model grading itself.
//
// Beat rate leads because it answers the only question that matters in one
// glance — does this thing beat a coin flip? — and it is shown against an
// explicit 50% baseline so the number cannot be read as impressive on its own.
// Mean CLV sits beside it as the precise version.
//
// Positive and negative never rely on color alone: every value carries its sign
// and a word. The obvious red/green encoding was rejected outright — it has a
// deuteranopia separation of ~6, and this entire panel is a beat/missed
// readout, so it is the one place that pair would do the most damage.
import type { ClvStats, ClvSummary } from '../lib/clv';
import { deltaLabel, kickoffLabel, nickname } from '../lib/format';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A number's sign as a word, so the color is never the only cue. */
function verdict(clv: number): { word: string; tone: 'beat' | 'missed' } {
  return clv > 0 ? { word: 'beat', tone: 'beat' } : { word: 'missed', tone: 'missed' };
}

function StatRow({ rows }: { rows: ClvStats[] }) {
  return (
    <table className="clvtable">
      <thead>
        <tr>
          <th>Bucket</th>
          <th>Flags</th>
          <th>Mean CLV</th>
          <th>Beat close</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="clvtable__num">{r.n}</td>
            <td className="clvtable__num" data-tone={r.n === 0 ? '' : verdict(r.meanClv).tone}>
              {r.n === 0 ? '—' : deltaLabel(r.meanClv)}
            </td>
            <td className="clvtable__num">{r.n === 0 ? '—' : pct(r.beatRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrackRecord({ summary, sample }: { summary: ClvSummary; sample: boolean }) {
  const { overall } = summary;

  if (overall.n === 0) {
    return (
      <div className="record">
        <div className="record__empty">
          <h3>Nothing graded yet</h3>
          <p>
            A game is graded once it kicks off: the engine replays what it said at
            every poll, then compares the number you could have taken against where
            the market closed. The first grades appear after this week's slate
            finishes, and the record only means anything after a few weeks of them.
          </p>
        </div>
      </div>
    );
  }

  // Beat rate against the coin-flip baseline. Anything at or under 50% means
  // the signals are not finding money, however good the mean looks.
  const above = overall.beatRate >= 0.5;

  return (
    <div className="record">
      {sample && (
        <div className="banner banner--warn">
          <b>Sample track record.</b> Generated from synthetic weeks, so these grades
          measure nothing. They exist to show the panel's shape; live polling replaces
          them entirely.
        </div>
      )}

      <div className="record__hero">
        <div className="hero">
          <span className="hero__k">Beat the close</span>
          <span className="hero__v" data-tone={above ? 'beat' : 'missed'}>
            {pct(overall.beatRate)}
          </span>
          <div className="meter">
            <div
              className="meter__fill"
              data-tone={above ? 'beat' : 'missed'}
              style={{ width: pct(Math.min(1, overall.beatRate)) }}
            />
            <div className="meter__baseline" style={{ left: '50%' }} />
          </div>
          <span className="hero__s">
            {above ? 'above' : 'below'} the 50% coin-flip baseline, over {overall.n}{' '}
            graded flag{overall.n === 1 ? '' : 's'}
          </span>
        </div>

        <div className="kpis">
          <div className="kpi">
            <span className="kpi__k">Mean CLV</span>
            <span className="kpi__v" data-tone={verdict(overall.meanClv).tone}>
              {deltaLabel(overall.meanClv)}
            </span>
            <span className="kpi__s">points, per flag</span>
          </div>
          <div className="kpi">
            <span className="kpi__k">Graded flags</span>
            <span className="kpi__v">{overall.n}</span>
            <span className="kpi__s">cleared the lean band</span>
          </div>
        </div>
      </div>

      <div className="record__splits">
        <section>
          <h4>By strength (peak score)</h4>
          <StatRow rows={summary.byBand} />
        </section>
        <section>
          <h4>By market</h4>
          <StatRow rows={summary.byMarket} />
        </section>
      </div>

      <section className="record__rows">
        <h4>Every graded flag</h4>
        <table className="clvtable clvtable--wide">
          <thead>
            <tr>
              <th>Game</th>
              <th>Market</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Peak</th>
              <th>CLV</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => {
              const v = verdict(r.market.clv as number);
              const side =
                r.market.flaggedSide === 'home'
                  ? nickname(r.game.homeTeam)
                  : r.market.flaggedSide === 'away'
                    ? nickname(r.game.awayTeam)
                    : r.market.flaggedSide === 'over'
                      ? 'Over'
                      : 'Under';
              return (
                <tr key={`${r.game.id}-${r.market.market}`}>
                  <td>
                    {nickname(r.game.awayTeam)} @ {nickname(r.game.homeTeam)}
                    <span className="clvtable__when">{kickoffLabel(r.game.commenceTime)}</span>
                  </td>
                  <td>{r.market.market}</td>
                  <td>{side}</td>
                  <td className="clvtable__num">{Math.round(r.market.flaggedScore)}</td>
                  <td className="clvtable__num">{Math.round(r.peak)}</td>
                  <td className="clvtable__num" data-tone={v.tone}>
                    {deltaLabel(r.market.clv as number)}
                  </td>
                  <td className="clvtable__word" data-tone={v.tone}>
                    {v.word}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="method">
        <h3>What this does and does not prove</h3>
        <p>
          A flag is graded from the <b>first</b> poll at which its score cleared the
          lean band. Everything measured against it happened after that moment, and
          the signals only read movement from before it — so nothing here grades the
          engine on the same data that triggered it.
        </p>
        <p>
          <b>CLV is not profit.</b> Beating the close means you got a better number
          than the market settled on, which is the habit that makes bettors money
          over time. Any individual bet still wins or loses on the field, and no
          result is tracked here.
        </p>
        <p>
          <b>Entry vs peak.</b> Entry is the score when the read first crossed the
          lean band — the moment you could have acted. Peak is the highest it
          reached before kickoff. The strength split buckets on peak, because entry
          is always near the threshold by definition and would leave the strong
          bucket permanently empty.
        </p>
        <p className="method__caveat">
          Read the beat rate against 50%, not against 100. A model that finds real
          money lands somewhere in the fifties or low sixties; anything dramatically
          higher usually means a bug, a tiny sample, or data that leaked backwards.
          Treat a handful of flags as noise — this needs weeks before it says
          anything.
        </p>
      </div>
    </div>
  );
}
