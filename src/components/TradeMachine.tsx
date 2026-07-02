import { useMemo, useState } from 'react';
import type { DraftPick, Player, Team } from '../types';
import { useTeams } from '../lib/teamStore';
import { CURRENT_SEASON } from '../data/leagueConstants';
import {
  frozenPickYear,
  playerSalaryForSeason,
  summarizeSeason,
  summarizeTeamSeason,
  TIER_INFO,
} from '../lib/apron';
import { evaluateTrade, type SelectedTpe, type TeamTradeResult } from '../lib/trade';
import {
  tradeExceptionsFor,
  useTradeExceptions,
  type TradeException,
} from '../lib/tradeExceptionsStore';
import { money } from '../lib/format';
import { ApronMeter } from './ApronMeter';

// The current league year begins ~July 1 of the focal season. A TPE created
// before then is a "prior-year" exception, frozen for second-apron teams.
const LEAGUE_YEAR_START = new Date(`${CURRENT_SEASON}-07-01T00:00:00`);

function toSelectedTpe(te: TradeException): SelectedTpe {
  const start = te.start ? new Date(te.start) : null;
  const priorYear = Boolean(start && !Number.isNaN(start.getTime()) && start < LEAGUE_YEAR_START);
  return { player: te.player, remaining: te.remaining, expired: te.expired, priorYear };
}

// The Trade Machine: pick two teams, select outgoing players from each, and see
// the legality verdict plus a before/after apron read for both sides.

export function TradeMachine() {
  const [abbrA, setAbbrA] = useState('PHX');
  const [abbrB, setAbbrB] = useState('UTA');
  const [selA, setSelA] = useState<Set<string>>(new Set());
  const [selB, setSelB] = useState<Set<string>>(new Set());
  const [pickA, setPickA] = useState<Set<number>>(new Set());
  const [pickB, setPickB] = useState<Set<number>>(new Set());
  const [tpeA, setTpeA] = useState<number | null>(null);
  const [tpeB, setTpeB] = useState<number | null>(null);

  const teams = useTeams();
  useTradeExceptions(); // re-render when the imported TPE set changes
  const teamA = teams.find((t) => t.abbreviation === abbrA) ?? teams[0];
  const teamB = teams.find((t) => t.abbreviation === abbrB) ?? teams[1];

  const picksOut = (team: Team, sel: Set<number>): DraftPick[] =>
    [...sel].map((i) => team.draftCapital[i]).filter(Boolean);

  const tpeOf = (team: Team, idx: number | null): SelectedTpe | undefined => {
    if (idx == null) return undefined;
    const te = tradeExceptionsFor(team.abbreviation)[idx];
    return te ? toSelectedTpe(te) : undefined;
  };

  const evaluation = useMemo(
    () =>
      evaluateTrade(
        {
          team: teamA,
          outgoingPlayerIds: [...selA],
          outgoingPicks: picksOut(teamA, pickA),
          tpe: tpeOf(teamA, tpeA),
        },
        {
          team: teamB,
          outgoingPlayerIds: [...selB],
          outgoingPicks: picksOut(teamB, pickB),
          tpe: tpeOf(teamB, tpeB),
        },
        CURRENT_SEASON
      ),
    [teamA, teamB, selA, selB, pickA, pickB, tpeA, tpeB]
  );

  const toggle = (side: 'A' | 'B', id: string) => {
    const [sel, setSel] = side === 'A' ? [selA, setSelA] : [selB, setSelB];
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  };

  const togglePick = (side: 'A' | 'B', index: number) => {
    const [sel, setSel] = side === 'A' ? [pickA, setPickA] : [pickB, setPickB];
    const next = new Set(sel);
    next.has(index) ? next.delete(index) : next.add(index);
    setSel(next);
  };

  const toggleTpe = (side: 'A' | 'B', index: number) => {
    const [sel, setSel] = side === 'A' ? [tpeA, setTpeA] : [tpeB, setTpeB];
    setSel(sel === index ? null : index);
  };

  const changeTeam = (side: 'A' | 'B', abbr: string) => {
    if (side === 'A') {
      setAbbrA(abbr);
      setSelA(new Set());
      setPickA(new Set());
      setTpeA(null);
    } else {
      setAbbrB(abbr);
      setSelB(new Set());
      setPickB(new Set());
      setTpeB(null);
    }
  };

  const hasSelection =
    selA.size > 0 ||
    selB.size > 0 ||
    pickA.size > 0 ||
    pickB.size > 0 ||
    tpeA != null ||
    tpeB != null;

  return (
    <div className="trade-machine">
      <div className="verdict-bar">
        {!hasSelection ? (
          <div className="verdict verdict-idle">
            Select players from each side to build a trade.
          </div>
        ) : evaluation.legal ? (
          <div className="verdict verdict-legal">
            <span className="verdict-icon">✓</span> Trade is legal
            {evaluation.teams.some((t) => t.violations.some((v) => v.severity === 'warn')) &&
              ' — with cautions'}
          </div>
        ) : (
          <div className="verdict verdict-illegal">
            <span className="verdict-icon">✕</span> Trade is blocked —{' '}
            {evaluation.blockingViolations.length} rule
            {evaluation.blockingViolations.length > 1 ? 's' : ''} violated
          </div>
        )}
      </div>

      <div className="trade-sides">
        <TradeColumn
          side="A"
          team={teamA}
          selected={selA}
          selectedPicks={pickA}
          selectedTpe={tpeA}
          onToggle={(id) => toggle('A', id)}
          onTogglePick={(i) => togglePick('A', i)}
          onToggleTpe={(i) => toggleTpe('A', i)}
          onTeamChange={(abbr) => changeTeam('A', abbr)}
          disabledTeam={abbrB}
          result={evaluation.teams[0]}
        />
        <TradeColumn
          side="B"
          team={teamB}
          selected={selB}
          selectedPicks={pickB}
          selectedTpe={tpeB}
          onToggle={(id) => toggle('B', id)}
          onTogglePick={(i) => togglePick('B', i)}
          onToggleTpe={(i) => toggleTpe('B', i)}
          onTeamChange={(abbr) => changeTeam('B', abbr)}
          disabledTeam={abbrA}
          result={evaluation.teams[1]}
        />
      </div>
    </div>
  );
}

interface ColumnProps {
  side: 'A' | 'B';
  team: Team;
  selected: Set<string>;
  selectedPicks: Set<number>;
  selectedTpe: number | null;
  onToggle: (id: string) => void;
  onTogglePick: (index: number) => void;
  onToggleTpe: (index: number) => void;
  onTeamChange: (abbr: string) => void;
  disabledTeam: string;
  result: TeamTradeResult;
}

function TradeColumn({
  team,
  selected,
  selectedPicks,
  selectedTpe,
  onToggle,
  onTogglePick,
  onToggleTpe,
  onTeamChange,
  disabledTeam,
  result,
}: ColumnProps) {
  const teams = useTeams();
  const preSummary = summarizeSeason(result.preSalary, CURRENT_SEASON);
  const postSummary = summarizeSeason(result.postSalary, CURRENT_SEASON);

  // Second-apron teams cannot trade the first-round pick seven drafts out.
  const inSecondApron =
    summarizeTeamSeason(team, CURRENT_SEASON).tier === 'secondApron';
  const frozenYear = frozenPickYear(CURRENT_SEASON);
  const tpes = tradeExceptionsFor(team.abbreviation);

  const sorted = [...team.players].sort(
    (a, b) =>
      playerSalaryForSeason(b, CURRENT_SEASON) -
      playerSalaryForSeason(a, CURRENT_SEASON)
  );

  return (
    <div className="trade-column">
      <select
        className="trade-team-select"
        value={team.abbreviation}
        onChange={(e) => onTeamChange(e.target.value)}
      >
        {teams.map((t) => (
          <option
            key={t.abbreviation}
            value={t.abbreviation}
            disabled={t.abbreviation === disabledTeam}
          >
            {t.name}
          </option>
        ))}
      </select>

      <div className="trade-roster">
        {sorted.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            selected={selected.has(p.id)}
            onToggle={() => onToggle(p.id)}
          />
        ))}
      </div>

      <div className="trade-picks">
        <span className="trade-picks-head">Draft Capital</span>
        <div className="trade-picks-grid">
          {team.draftCapital.map((pk, i) => {
            const isFrozen =
              inSecondApron &&
              pk.round === 1 &&
              pk.year === frozenYear &&
              pk.originalTeam === team.abbreviation;
            return (
              <button
                key={`${pk.year}-${pk.round}-${pk.originalTeam}-${i}`}
                className={`trade-pick${selectedPicks.has(i) ? ' selected' : ''}${
                  isFrozen ? ' frozen' : ''
                }`}
                onClick={() => onTogglePick(i)}
                title={
                  isFrozen
                    ? 'Frozen in the second apron — including it blocks the trade'
                    : pk.notes ?? ''
                }
              >
                <span className="tp-check">{selectedPicks.has(i) ? '✓' : ''}</span>
                <span className="tpick-year">{pk.year}</span>
                <span className="tpick-round">
                  {pk.round === 1 ? '1st' : '2nd'}
                  {pk.originalTeam !== team.abbreviation && (
                    <span className="draft-via"> · {pk.originalTeam}</span>
                  )}
                </span>
                {isFrozen && <span className="tpick-flag">FROZEN</span>}
              </button>
            );
          })}
        </div>
      </div>

      {tpes.length > 0 && (
        <div className="trade-tpes">
          <span className="trade-tpes-head">Trade Exceptions · absorb salary into</span>
          <div className="trade-tpes-list">
            {tpes.map((te, i) => {
              const frozen = inSecondApron && toSelectedTpe(te).priorYear && !te.expired;
              return (
                <button
                  key={`${te.player}-${i}`}
                  className={`trade-tpe${selectedTpe === i ? ' selected' : ''}${
                    te.expired ? ' expired' : ''
                  }${frozen ? ' frozen' : ''}`}
                  onClick={te.expired ? undefined : () => onToggleTpe(i)}
                  disabled={te.expired}
                  title={
                    te.expired
                      ? 'Expired — no longer usable'
                      : frozen
                        ? 'Prior-year TPE — frozen over the second apron'
                        : `Absorb up to ${money(te.remaining)}`
                  }
                >
                  <span className="tp-check">{selectedTpe === i ? '✓' : ''}</span>
                  <span className="ttpe-amt">{money(te.remaining)}</span>
                  <span className="ttpe-player">{te.player}</span>
                  {te.expired && <span className="ttpe-flag">EXPIRED</span>}
                  {frozen && <span className="ttpe-flag">FROZEN</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PickFlow result={result} />

      <div className="trade-flow">
        <div className="flow-item">
          <span className="flow-label">Sends out</span>
          <span className="flow-value">{money(result.outgoingSalary)}</span>
        </div>
        <div className="flow-item">
          <span className="flow-label">Takes back</span>
          <span className="flow-value">{money(result.incomingSalary)}</span>
        </div>
        <div className="flow-item">
          <span className="flow-label">Max legal in</span>
          <span
            className={`flow-value ${
              result.incomingSalary > result.maxAllowedIncoming + 1 ? 'flow-bad' : 'flow-ok'
            }`}
          >
            {money(result.maxAllowedIncoming)}
          </span>
          {result.tpeCapacity > 0 && (
            <span className="flow-sub">incl. {money(result.tpeCapacity)} TPE</span>
          )}
        </div>
      </div>

      <div className="trade-beforeafter">
        <div className="ba-block">
          <div className="ba-label">Before</div>
          <ApronMeter summary={preSummary} />
        </div>
        <div className="ba-arrow">→</div>
        <div className="ba-block">
          <div className="ba-label">After</div>
          <ApronMeter summary={postSummary} />
        </div>
      </div>

      <ApronProximity result={result} />

      {result.violations.length > 0 && (
        <ul className="violation-list">
          {result.violations.map((v, i) => (
            <li key={i} className={`violation violation-${v.severity}`}>
              <span className="violation-badge">
                {v.severity === 'block' ? 'BLOCK' : 'CAUTION'}
              </span>
              <div>
                <div className="violation-title">{v.title}</div>
                <div className="violation-detail">{v.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Draft picks leaving and arriving in the deal. Picks do not affect the salary
// math, but the user wants them tracked as part of the package.
function PickFlow({ result }: { result: TeamTradeResult }) {
  if (result.outgoingPicks.length === 0 && result.incomingPicks.length === 0) {
    return null;
  }
  const label = (pk: DraftPick) =>
    `${pk.year} ${pk.round === 1 ? '1st' : '2nd'}${
      pk.originalTeam !== result.teamAbbr ? ` (${pk.originalTeam})` : ''
    }`;
  return (
    <div className="pick-flow">
      <div className="pick-flow-row">
        <span className="pick-flow-label">Picks out</span>
        <span className="pick-flow-value">
          {result.outgoingPicks.length
            ? result.outgoingPicks.map(label).join(', ')
            : '—'}
        </span>
      </div>
      <div className="pick-flow-row">
        <span className="pick-flow-label">Picks in</span>
        <span className="pick-flow-value">
          {result.incomingPicks.length
            ? result.incomingPicks.map(label).join(', ')
            : '—'}
        </span>
      </div>
    </div>
  );
}

// A compact readout of how much room remains to each apron after the deal.
function ApronProximity({ result }: { result: TeamTradeResult }) {
  const post = summarizeSeason(result.postSalary, CURRENT_SEASON);
  const info = TIER_INFO[post.tier];
  const rows = [
    { label: 'to 1st apron', space: post.spaceUnderFirstApron },
    { label: 'to 2nd apron', space: post.spaceUnderSecondApron },
  ];
  return (
    <div className="proximity">
      <div className={`proximity-tier tier-${info.color}`}>
        After trade: <strong>{info.label}</strong>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="proximity-row">
          <span>{r.label}</span>
          <span className={r.space < 0 ? 'space-over' : 'space-under'}>
            {r.space < 0
              ? `${money(Math.abs(r.space))} over`
              : `${money(r.space)} of room`}
          </span>
        </div>
      ))}
      {result.hardCappedAt && (
        <div className="proximity-hardcap">
          Hard-capped at the {result.hardCappedAt === 'firstApron' ? 'first' : 'second'} apron
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onToggle,
}: {
  player: Player;
  selected: boolean;
  onToggle: () => void;
}) {
  const salary = playerSalaryForSeason(player, CURRENT_SEASON);
  const tradable = salary > 0 && !player.twoWay;
  return (
    <button
      className={`trade-player${selected ? ' selected' : ''}${
        tradable ? '' : ' untradable'
      }`}
      onClick={tradable ? onToggle : undefined}
      disabled={!tradable}
      title={
        tradable ? '' : player.twoWay ? 'Two-way contract' : 'No current-season salary to trade'
      }
    >
      <span className="tp-check">{selected ? '✓' : ''}</span>
      <span className="tp-name">{player.name}</span>
      <span className="tp-pos">{player.position}</span>
      <span className="tp-salary">{player.twoWay ? 'TW' : tradable ? money(salary) : '—'}</span>
    </button>
  );
}
