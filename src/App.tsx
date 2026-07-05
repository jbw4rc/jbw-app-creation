import { useState } from 'react';
import { MyTeam } from './components/MyTeam';
import { TeamExplorer } from './components/TeamExplorer';
import { RotationBuilder } from './components/RotationBuilder';
import { TradeMachine } from './components/TradeMachine';
import { StatsExplorer } from './components/StatsExplorer';
import { SigningExplorer } from './components/SigningExplorer';
import { LeagueThresholds } from './components/LeagueThresholds';

type Tab = 'myteam' | 'explorer' | 'stats' | 'rotation' | 'trade' | 'signings';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'myteam', label: 'My Team', blurb: 'GM session — trades, signings & contention' },
  { id: 'explorer', label: 'Team Explorer', blurb: 'Team financials — cap, apron, picks & holds' },
  { id: 'stats', label: 'Stats', blurb: 'Advanced metrics — leaderboard & by team' },
  { id: 'rotation', label: 'Rotation Builder', blurb: 'Allocate minutes; see team value & rank' },
  { id: 'trade', label: 'Trade Machine', blurb: 'Test a swap against the apron rules' },
  { id: 'signings', label: 'Signings', blurb: 'Free agents & signing a player against the cap' },
];

export interface TradeSetup {
  acquiring: string;
  rights: string;
  faName: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('myteam');
  const [tradeSetup, setTradeSetup] = useState<TradeSetup | null>(null);

  const signAndTrade = (acquiring: string, rights: string, faName: string) => {
    setTradeSetup({ acquiring, rights, faName });
    setTab('trade');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">▚</span>
          <div>
            <h1>Apron Room</h1>
            <p className="tagline">NBA Trade &amp; Free Agent Machine · Two-Apron Analyzer</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-label">{t.label}</span>
              <span className="tab-blurb">{t.blurb}</span>
            </button>
          ))}
        </nav>
      </header>

      <LeagueThresholds />

      <main className="app-main">
        {tab === 'myteam' && <MyTeam onNavigate={setTab} />}
        {tab === 'explorer' && <TeamExplorer />}
        {tab === 'stats' && <StatsExplorer />}
        {tab === 'rotation' && <RotationBuilder />}
        {tab === 'trade' && (
          <TradeMachine setup={tradeSetup} onConsumeSetup={() => setTradeSetup(null)} />
        )}
        {tab === 'signings' && <SigningExplorer onSignAndTrade={signAndTrade} />}
      </main>

      <footer className="app-footer">
        <span>
          Two aprons per the 2023 CBA. Cap figures through 2026-27 are set; later
          seasons are projected (~7% growth). Rosters and rule simplifications are
          illustrative for planning, not official league rulings.
        </span>
      </footer>
    </div>
  );
}
