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
import { teamTalent, baselineTeamTalent, TIER_META } from '../lib/teamTalent';

// ---------------------------------------------------------------------------
// My Team — the GM-session hub. Start a session for your team, then commit
// trades and signings (from those tabs) and adjust the rotation; this shows how
// your moves move the needle on contention versus your real-roster baseline.
// ---------------------------------------------------------------------------

const netFmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

type TabId = 'rotation' | 'trade' | 'signings';

export function MyTeam({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const teams = useTeams();
  const session = useSession();
  const selected = useSelectedTeam();

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

  // --- No active session: prompt to start one ------------------------------
  if (!session) {
    const team = teams.find((t) => t.abbreviation === selected);
    return (
      <div className="myteam">
        <div className="mt-intro">
          <span className="cs-kicker">GM Session</span>
          <h2 className="mt-title">Run your franchise</h2>
          <p className="mt-lede">
            Pick your team, then commit trades and signings and reshape the rotation. Every
            move updates your team value and league / conference rank in real time, measured
            against your starting roster. Nothing here touches the real data — reset anytime.
          </p>
        </div>
        <TeamPicker current={selected} onPick={setSelectedTeam} />
        <div className="mt-start">
          <button className="mt-btn-primary" onClick={() => startSession(selected)}>
            Start session as {team?.name ?? selected}
          </button>
        </div>
      </div>
    );
  }

  // --- Active session ------------------------------------------------------
  const abbr = session.myTeam;
  const team = teams.find((t) => t.abbreviation === abbr);
  const cur = teamTalent(abbr);
  const base = baselineTeamTalent(abbr);

  const StatCompare = ({
    label,
    curText,
    baseText,
    delta,
  }: {
    label: string;
    curText: string;
    baseText: string;
    delta: number; // >0 = improved (green)
  }) => (
    <div className="rb-stat">
      <span className="rb-stat-label">{label}</span>
      <span className="rb-stat-value">{curText}</span>
      <span className={`rb-stat-delta ${delta > 0 ? 'rb-up' : delta < 0 ? 'rb-down' : ''}`}>
        {baseText}
      </span>
    </div>
  );

  return (
    <div className="myteam">
      <div className="mt-bar">
        <div>
          <span className="cs-kicker">GM Session · {team?.name ?? abbr}</span>
          <h2 className="mt-title">
            {cur ? (
              <>
                <span className={`tier-badge tier-${TIER_META[cur.tier].color}`}>
                  {TIER_META[cur.tier].label}
                </span>{' '}
                {session.moves.length} move{session.moves.length === 1 ? '' : 's'} made
              </>
            ) : (
              'My Team'
            )}
          </h2>
        </div>
        <div className="mt-actions">
          {session.moves.length > 0 && (
            <button className="rp-reset" onClick={resetSession}>
              Undo all moves
            </button>
          )}
          <button className="rp-reset" onClick={endSession}>
            End session
          </button>
        </div>
      </div>

      <TeamPicker current={abbr} onPick={setSessionTeam} />

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
            baseText={
              cur.overallRank === base.overallRank
                ? `start #${base.overallRank}`
                : `${base.overallRank > cur.overallRank ? '▲' : '▼'} ${Math.abs(base.overallRank - cur.overallRank)} from #${base.overallRank}`
            }
            delta={base.overallRank - cur.overallRank}
          />
          <StatCompare
            label={`${cur.conference} rank`}
            curText={`#${cur.confRank} / 15`}
            baseText={
              cur.confRank === base.confRank
                ? `start #${base.confRank}`
                : `${base.confRank > cur.confRank ? '▲' : '▼'} ${Math.abs(base.confRank - cur.confRank)} from #${base.confRank}`
            }
            delta={base.confRank - cur.confRank}
          />
          <div className="rb-stat">
            <span className="rb-stat-label">Contention tier</span>
            <span className="rb-stat-value" style={{ fontSize: '18px' }}>
              {TIER_META[cur.tier].label}
            </span>
            <span className="rb-stat-delta">
              {cur.tier === base.tier ? `unchanged` : `was ${TIER_META[base.tier].label}`}
            </span>
          </div>
        </div>
      )}

      <div className="mt-do">
        <span>Make a move:</span>
        <button onClick={() => onNavigate?.('trade')}>Trade</button>
        <button onClick={() => onNavigate?.('signings')}>Sign a free agent</button>
        <button onClick={() => onNavigate?.('rotation')}>Adjust rotation</button>
      </div>

      <div className="mt-log">
        <h3 className="mt-log-title">Moves this session</h3>
        {session.moves.length === 0 ? (
          <p className="mt-empty">
            No moves yet. Head to Trade Machine or Signings and commit one — it'll apply to your
            roster and show up here.
          </p>
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
