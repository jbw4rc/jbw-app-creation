import { useMemo, useState } from 'react';
import type { Player, Team } from '../types';
import { TEAMS } from '../data/teams';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { playerSalaryForSeason, summarizeSeason, TIER_INFO } from '../lib/apron';
import { evaluateTrade, type TeamTradeResult } from '../lib/trade';
import { money } from '../lib/format';
import { ApronMeter } from './ApronMeter';

// The Trade Machine: pick two teams, select outgoing players from each, and see
// the legality verdict plus a before/after apron read for both sides.

export function TradeMachine() {
  const [abbrA, setAbbrA] = useState('PHX');
  const [abbrB, setAbbrB] = useState('UTA');
  const [selA, setSelA] = useState<Set<string>>(new Set());
  const [selB, setSelB] = useState<Set<string>>(new Set());

  const teamA = TEAMS.find((t) => t.abbreviation === abbrA)!;
  const teamB = TEAMS.find((t) => t.abbreviation === abbrB)!;

  const evaluation = useMemo(
    () =>
      evaluateTrade(
        { team: teamA, outgoingPlayerIds: [...selA] },
        { team: teamB, outgoingPlayerIds: [...selB] },
        CURRENT_SEASON
      ),
    [teamA, teamB, selA, selB]
  );

  const toggle = (side: 'A' | 'B', id: string) => {
    const [sel, setSel] = side === 'A' ? [selA, setSelA] : [selB, setSelB];
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  };

  const changeTeam = (side: 'A' | 'B', abbr: string) => {
    if (side === 'A') {
      setAbbrA(abbr);
      setSelA(new Set());
    } else {
      setAbbrB(abbr);
      setSelB(new Set());
    }
  };

  const hasSelection = selA.size > 0 || selB.size > 0;

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
          onToggle={(id) => toggle('A', id)}
          onTeamChange={(abbr) => changeTeam('A', abbr)}
          disabledTeam={abbrB}
          result={evaluation.teams[0]}
        />
        <TradeColumn
          side="B"
          team={teamB}
          selected={selB}
          onToggle={(id) => toggle('B', id)}
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
  onToggle: (id: string) => void;
  onTeamChange: (abbr: string) => void;
  disabledTeam: string;
  result: TeamTradeResult;
}

function TradeColumn({
  team,
  selected,
  onToggle,
  onTeamChange,
  disabledTeam,
  result,
}: ColumnProps) {
  const preSummary = summarizeSeason(result.preSalary, CURRENT_SEASON);
  const postSummary = summarizeSeason(result.postSalary, CURRENT_SEASON);

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
        {TEAMS.map((t) => (
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
  const tradable = salary > 0;
  return (
    <button
      className={`trade-player${selected ? ' selected' : ''}${
        tradable ? '' : ' untradable'
      }`}
      onClick={tradable ? onToggle : undefined}
      disabled={!tradable}
      title={tradable ? '' : 'No current-season salary to trade'}
    >
      <span className="tp-check">{selected ? '✓' : ''}</span>
      <span className="tp-name">{player.name}</span>
      <span className="tp-pos">{player.position}</span>
      <span className="tp-salary">{tradable ? money(salary) : '—'}</span>
    </button>
  );
}
