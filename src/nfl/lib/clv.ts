// Grading the engine against the closing line.
//
// Without this the app is unfalsifiable: it names a sharp side every week and
// nothing ever checks whether that side was real. Closing line value is the
// honest test, and it tests exactly the thing the signals claim to detect —
// not who won the game, but whether money kept coming to the flagged side.
//
// The measurement is strictly forward-looking. A game is graded from the FIRST
// poll at which its score cleared the lean band; everything compared against it
// happened after that moment. The signals read movement that came before, so
// there is no circularity between what triggers a flag and what grades it.
//
// What this does NOT measure is profit. Beating the close means you got a
// better number than the market settled on, which is the discipline that makes
// bettors money over time — but any individual bet still wins or loses on the
// field, and none of that is tracked here.

import { LEAN_MIN, readGameAt } from './sharp';
import type { ClvArchive, Market, ResolvedGame, ResolvedMarket, Side, Snapshot } from '../types';

/** +1 for sides that gain when the number rises, -1 for the other half. */
function direction(side: Side | null): number {
  if (side === 'home' || side === 'over') return 1;
  if (side === 'away' || side === 'under') return -1;
  return 0;
}

/** Replay one market across the whole history and grade it against the close. */
function resolveMarket(
  snapshots: Snapshot[],
  gameId: string,
  market: Market,
  kickoff: string
): ResolvedMarket | null {
  const reads: ResolvedMarket['reads'] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const read = readGameAt(snapshots.slice(0, i + 1), gameId);
    if (!read) continue;
    const m = market === 'spread' ? read.spread : read.total;
    if (!Number.isFinite(m.sharp.mu)) continue;
    reads.push({
      takenAt: snapshots[i].takenAt,
      score: m.score,
      side: m.sharpSide,
      mu: m.sharp.mu,
      line: m.sharp.line,
    });
  }

  if (reads.length === 0) return null;

  // Grade only against numbers that existed BEFORE the game started. The feed
  // keeps returning prices once a game is under way, and those are live in-play
  // numbers that can sit points away from the close. Taking the last read
  // blindly would let a snapshot polled at half-time become the "closing line",
  // which would silently corrupt every grade for the week.
  const kickoffAt = new Date(kickoff).getTime();
  const preKick = reads.filter((r) => new Date(r.takenAt).getTime() < kickoffAt);

  // No pre-kickoff read means nothing to grade — we never saw a bettable price.
  if (preKick.length === 0) {
    return {
      market,
      reads,
      closingMu: NaN,
      closingLine: NaN,
      flaggedAt: null,
      flaggedSide: null,
      flaggedScore: 0,
      flaggedMu: null,
      flaggedLine: null,
      clv: null,
    };
  }

  const closing = preKick[preKick.length - 1];

  // The first poll that cleared the lean band is the entry point we grade, and
  // it too must predate kickoff — you cannot take a price that no longer exists.
  const flag = preKick.find((r) => r.score >= LEAN_MIN && r.side !== null) ?? null;

  // A flag on the very last poll has no market left to move, so it is not
  // gradeable — counting it as zero CLV would quietly drag the average toward
  // nothing and make the record look less decisive than it is.
  const gradeable = flag !== null && flag.takenAt !== closing.takenAt;

  return {
    market,
    reads,
    closingMu: closing.mu,
    closingLine: closing.line,
    flaggedAt: flag?.takenAt ?? null,
    flaggedSide: flag?.side ?? null,
    flaggedScore: flag?.score ?? 0,
    // Null, not NaN: this record is serialized to JSON, where NaN becomes null
    // anyway — better to say so in the type than to let the file disagree with it.
    flaggedMu: flag?.mu ?? null,
    flaggedLine: flag?.line ?? null,
    clv: gradeable ? direction(flag.side) * (closing.mu - flag.mu) : null,
  };
}

/** Boil a finished game down to its resolution record. */
export function resolveGame(snapshots: Snapshot[], gameId: string): ResolvedGame | null {
  // Replaying is quadratic in the history length, so narrow to the polls that
  // actually priced this game first. The archive holds weeks of board; any one
  // game appears in a couple of dozen of those snapshots.
  const own = snapshots.filter((s) => s.games.some((g) => g.id === gameId));
  if (own.length === 0) return null;

  const latest = readGameAt(own, gameId);
  if (!latest) return null;
  const spread = resolveMarket(own, gameId, 'spread', latest.commenceTime);
  const total = resolveMarket(own, gameId, 'total', latest.commenceTime);
  if (!spread || !total) return null;
  return {
    id: latest.id,
    commenceTime: latest.commenceTime,
    homeTeam: latest.homeTeam,
    awayTeam: latest.awayTeam,
    spread,
    total,
  };
}

/**
 * The highest score this market reached while it was still bettable.
 *
 * Bucketing by the FLAGGED score could never work: a flag is recorded the
 * first time a read crosses the lean band, so the stored score always sits
 * near that threshold and the "strong" bucket stayed empty by construction —
 * Titans peaked at 52 and was filed under "lean" at 41. Since the question the
 * split exists to answer is "do stronger reads earn better CLV", it has to
 * bucket on the strongest reading the board actually showed.
 *
 * Derived from the stored reads rather than a new field, so it works on rows
 * archived before this existed.
 */
export function peakScore(game: ResolvedGame, market: ResolvedMarket): number {
  const kickoff = new Date(game.commenceTime).getTime();
  let peak = 0;
  for (const r of market.reads) {
    if (new Date(r.takenAt).getTime() >= kickoff) continue;
    if (r.side === null) continue;
    if (r.score > peak) peak = r.score;
  }
  return peak;
}

export interface ClvStats {
  label: string;
  /** Gradeable flags in this bucket. */
  n: number;
  /** Mean points of closing line value. */
  meanClv: number;
  /** Share of flags whose number beat the close. */
  beatRate: number;
}

function stats(label: string, values: number[]): ClvStats {
  if (values.length === 0) return { label, n: 0, meanClv: 0, beatRate: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const beat = values.filter((v) => v > 0).length;
  return {
    label,
    n: values.length,
    meanClv: sum / values.length,
    beatRate: beat / values.length,
  };
}

export interface ClvSummary {
  overall: ClvStats;
  byBand: ClvStats[];
  byMarket: ClvStats[];
  /** Every graded flag, newest game first — the receipts behind the averages. */
  rows: {
    game: ResolvedGame;
    market: ResolvedMarket;
    /** Highest pregame score this read reached; what the strength split uses. */
    peak: number;
  }[];
}

/** Aggregate the archive into a track record. */
export function summarize(archive: ClvArchive, strongMin: number): ClvSummary {
  const rows: ClvSummary['rows'] = [];
  for (const game of archive.games) {
    for (const market of [game.spread, game.total]) {
      if (market.clv !== null) {
        rows.push({ game, market, peak: peakScore(game, market) });
      }
    }
  }
  rows.sort((a, b) => b.game.commenceTime.localeCompare(a.game.commenceTime));

  const clvOf = (r: ClvSummary['rows'][number]) => r.market.clv as number;
  const all = rows.map(clvOf);

  return {
    overall: stats('All flags', all),
    byBand: [
      // Bucketed on the PEAK pregame score, not the entry score — see peakScore.
      stats('Strong', rows.filter((r) => r.peak >= strongMin).map(clvOf)),
      stats('Lean', rows.filter((r) => r.peak < strongMin).map(clvOf)),
    ],
    byMarket: [
      stats('Spreads', rows.filter((r) => r.market.market === 'spread').map(clvOf)),
      stats('Totals', rows.filter((r) => r.market.market === 'total').map(clvOf)),
    ],
    rows,
  };
}
