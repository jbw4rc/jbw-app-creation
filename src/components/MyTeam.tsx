import { CURRENT_SEASON } from '../data/leagueConstants';
import { summarizeTeamSeason } from '../lib/apron';
import {
  getRosterStatus,
  useTeams,
  useSelectedTeam,
  setSelectedTeam,
  useSession,
  startSession,
  endSession,
  resetSession,
  setSessionTeam,
} from '../lib/teamStore';
import { teamTalent, baselineTeamTalent, TIER_META, type TalentTier } from '../lib/teamTalent';
import { teamNeeds, tradeChips, draftTally } from '../lib/teamNeeds';
import { freeAgentQuiver } from '../lib/freeAgentQuiver';
import { usedExceptionsFor, useSignings } from '../lib/signingsStore';
import { money } from '../lib/format';

// ---------------------------------------------------------------------------
// My Team — the GM "game". Pick your franchise, read its needs and the
// resources you have to fix them (signing power, draft capital, trade chips),
// then make moves and watch your team climb the contention ladder.
// ---------------------------------------------------------------------------

const netFmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

type TabId = 'rotation' | 'trade' | 'signings';

// The contention ladder, worst → best — the game board you're climbing.
const LADDER: TalentTier[] = ['cellar', 'fringe', 'playoff', 'contender'];

function TierLadder({ current, start }: { current: TalentTier; start: TalentTier }) {
  const ci = LADDER.indexOf(current);
  const si = LADDER.indexOf(start);
  return (
    <div className="gm-ladder">
      {LADDER.map((t, i) => {
        const meta = TIER_META[t];
        const state = i < ci ? 'below' : i === ci ? 'here' : 'above';
        return (
          <div key={t} className={`gm-rung gm-rung-${state} tier-${meta.color}`}>
            <span className="gm-rung-label">{meta.label}</span>
            {i === ci && <span className="gm-rung-you">You are here</span>}
            {i === si && i !== ci && <span className="gm-rung-start">start</span>}
          </div>
        );
      })}
    </div>
  );
}

export function MyTeam({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const teams = useTeams();
  const session = useSession();
  const selected = useSelectedTeam();
  useSignings(); // re-render as signings change (signing power)

  const TeamPicker = ({ current, onPick }: { current: string; onPick: (a: string) => void }) => (
    <div className="team-picker">
      {teams.map((t) => {
        const s = summarizeTeamSeason(t, CURRENT_SEASON);
        return (
          <button
            key={t.abbreviation}
            className={`team-chip tier-border-${s.tier}${t.abbreviation === current ? ' active' : ''}`}
            onClick={() => onPick(t.abbreviation)}
          >
            <span className="chip-abbr">{t.abbreviation}</span>
            {getRosterStatus(t.abbreviation).imported && (
              <span className="chip-imported" title="Imported data">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );

  // --- No active session: the pitch -----------------------------------------
  if (!session) {
    const team = teams.find((t) => t.abbreviation === selected);
    return (
      <div className="myteam">
        <div className="gm-splash">
          <span className="cs-kicker">GM Mode</span>
          <h2 className="gm-splash-title">Take over your team.</h2>
          <p className="gm-splash-lede">
            Pick your franchise, find its weak spots, and spend your draft picks, cap
            space, and trade chips to climb from the lottery to the Finals. Trades and
            signings are checked against the real salary-cap and apron rules — no cheating
            the cap. Nothing here touches live data; reset anytime.
          </p>
        </div>
        <TeamPicker current={selected} onPick={setSelectedTeam} />
        <div className="mt-start">
          <button className="mt-btn-primary" onClick={() => startSession(selected)}>
            ▶ Take control of {team?.name ?? selected}
          </button>
        </div>
      </div>
    );
  }

  // --- Active session: the dashboard ----------------------------------------
  const abbr = session.myTeam;
  const team = teams.find((t) => t.abbreviation === abbr);
  const cur = teamTalent(abbr);
  const base = baselineTeamTalent(abbr);
  const needs = team ? teamNeeds(team) : [];
  const chips = team ? tradeChips(team) : [];
  const draft = team ? draftTally(team) : { firsts: 0, seconds: 0 };

  // Signing power: the biggest exception (or cap room) currently available.
  let signingPower = 'Minimum salary only';
  if (team) {
    const arrows = freeAgentQuiver(team, CURRENT_SEASON, usedExceptionsFor(abbr));
    const avail = arrows.filter((a) => a.status === 'available');
    const withAmt = avail.filter((a) => a.amount != null).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    if (withAmt.length) signingPower = `${withAmt[0].name} · ${money(withAmt[0].amount as number)}`;
    else if (avail.length) signingPower = avail[0].name;
  }

  const rankUp = base && cur ? base.overallRank - cur.overallRank : 0;
  const goal =
    cur?.tier === 'contender'
      ? 'You built a contender. Now go win it.'
      : `Climb from ${cur ? TIER_META[cur.tier].label : '—'} to Contender.`;

  const StatCompare = ({ label, curText, baseText, delta }: { label: string; curText: string; baseText: string; delta: number }) => (
    <div className="rb-stat">
      <span className="rb-stat-label">{label}</span>
      <span className="rb-stat-value">{curText}</span>
      <span className={`rb-stat-delta ${delta > 0 ? 'rb-up' : delta < 0 ? 'rb-down' : ''}`}>{baseText}</span>
    </div>
  );

  return (
    <div className="myteam gm">
      {/* Hero: who you are, your goal, session controls */}
      <div className="gm-hero">
        <div className="gm-hero-main">
          <span className="cs-kicker">GM of the {team?.name ?? abbr}</span>
          <h2 className="gm-goal">{goal}</h2>
          <p className="gm-hero-sub">
            {session.moves.length === 0
              ? 'No moves yet — find a need below and make one.'
              : `${session.moves.length} move${session.moves.length === 1 ? '' : 's'} made` +
                (rankUp > 0
                  ? ` · ▲ up ${rankUp} spot${rankUp === 1 ? '' : 's'} in the league`
                  : rankUp < 0
                    ? ` · ▼ down ${Math.abs(rankUp)}`
                    : ' · rank unchanged')}
          </p>
        </div>
        <div className="mt-actions">
          {session.moves.length > 0 && (
            <button className="rp-reset" onClick={resetSession}>
              Undo all
            </button>
          )}
          <button className="rp-reset" onClick={endSession}>
            End session
          </button>
        </div>
      </div>

      {cur && base && <TierLadder current={cur.tier} start={base.tier} />}

      {/* Scoreboard */}
      {cur && base && (
        <div className="rb-impact">
          <StatCompare
            label="Team value (net rating)"
            curText={netFmt(cur.dpm)}
            baseText={`start ${netFmt(base.dpm)} · Δ ${netFmt(cur.dpm - base.dpm)}`}
            delta={cur.dpm - base.dpm}
          />
          <StatCompare
            label="League rank"
            curText={`#${cur.overallRank} / 30`}
            baseText={cur.overallRank === base.overallRank ? `start #${base.overallRank}` : `${rankUp > 0 ? '▲' : '▼'} ${Math.abs(rankUp)} from #${base.overallRank}`}
            delta={rankUp}
          />
          <StatCompare
            label={`${cur.conference} rank`}
            curText={`#${cur.confRank} / 15`}
            baseText={cur.confRank === base.confRank ? `start #${base.confRank}` : `${base.confRank > cur.confRank ? '▲' : '▼'} ${Math.abs(base.confRank - cur.confRank)} from #${base.confRank}`}
            delta={base.confRank - cur.confRank}
          />
        </div>
      )}

      {/* Needs + Arsenal — the heart of the game loop */}
      <div className="gm-cols">
        <div className="gm-card">
          <div className="gm-card-head">
            <span className="gm-card-title">Where you need help</span>
            <span className="gm-card-sub">from your rotation's structural flags</span>
          </div>
          {needs.length === 0 ? (
            <p className="gm-none">No glaring holes — this rotation is well-rounded. Add talent to climb.</p>
          ) : (
            <ul className="gm-needs">
              {needs.map((n) => (
                <li key={n.key} className={`gm-need gm-need-${n.severity}`}>
                  <span className="gm-need-dot" aria-hidden />
                  <span className="gm-need-body">
                    <span className="gm-need-label">
                      {n.label}
                      <span className="gm-need-tag">{n.severity === 'critical' ? 'critical' : 'watch'}</span>
                    </span>
                    <span className="gm-need-detail">{n.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="gm-card">
          <div className="gm-card-head">
            <span className="gm-card-title">Your arsenal</span>
            <span className="gm-card-sub">what you can spend to improve</span>
          </div>
          <div className="gm-arsenal">
            <div className="gm-asset">
              <span className="gm-asset-label">Signing power</span>
              <span className="gm-asset-val">{signingPower}</span>
            </div>
            <div className="gm-asset">
              <span className="gm-asset-label">Draft capital</span>
              <span className="gm-asset-val">
                {draft.firsts} first{draft.firsts === 1 ? '' : 's'} · {draft.seconds} second{draft.seconds === 1 ? '' : 's'}
              </span>
            </div>
            <div className="gm-asset gm-asset-chips">
              <span className="gm-asset-label">Top trade assets (most surplus value)</span>
              <div className="gm-chips">
                {chips.length === 0 ? (
                  <span className="gm-asset-val">—</span>
                ) : (
                  chips.map((c) => (
                    <span className="gm-chip" key={c.name} title={`${c.dpm != null ? netFmt(c.dpm) + ' DPM · ' : ''}${c.salary != null ? '$' + c.salary + 'M' : ''}`}>
                      {c.name.split(' ').slice(-1)[0]}
                      {c.surplus != null && <span className={`gm-chip-surplus ${c.surplus >= 0 ? 'pos' : 'neg'}`}>{c.surplus >= 0 ? '+' : ''}{c.surplus}M</span>}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Make a move */}
      <div className="gm-do">
        <span className="gm-do-label">Make your move</span>
        <div className="gm-do-btns">
          <button className="gm-do-btn" onClick={() => onNavigate?.('trade')}>
            <strong>Trade</strong>
            <span>swap players &amp; picks</span>
          </button>
          <button className="gm-do-btn" onClick={() => onNavigate?.('signings')}>
            <strong>Sign a free agent</strong>
            <span>spend your cap / exceptions</span>
          </button>
          <button className="gm-do-btn" onClick={() => onNavigate?.('rotation')}>
            <strong>Adjust rotation</strong>
            <span>optimize the minutes you have</span>
          </button>
        </div>
      </div>

      {/* Switch franchise */}
      <details className="gm-switch">
        <summary>Play as a different team</summary>
        <TeamPicker current={abbr} onPick={setSessionTeam} />
      </details>

      {/* Moves log */}
      <div className="mt-log">
        <h3 className="mt-log-title">Moves this session</h3>
        {session.moves.length === 0 ? (
          <p className="mt-empty">No moves yet. Trade, sign, or reshape your rotation — every move shows up here and moves your ranking.</p>
        ) : (
          <ol className="mt-log-list">
            {[...session.moves].reverse().map((m) => (
              <li key={m.id} className="mt-move">
                <span className={`mt-move-kind mt-${m.kind}`}>{m.kind}</span>
                <span className="mt-move-summary">{m.summary}</span>
                <span className="mt-move-teams">{m.teams.join(' · ')}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
