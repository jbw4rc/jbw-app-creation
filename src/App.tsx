import { useState } from 'react';
import { TeamExplorer } from './components/TeamExplorer';
import { TradeMachine } from './components/TradeMachine';
import { StatsExplorer } from './components/StatsExplorer';
import { LeagueThresholds } from './components/LeagueThresholds';

type Tab = 'explorer' | 'stats' | 'trade';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'explorer', label: 'Team Explorer', blurb: 'Rosters, salary, picks, apron status & FA quiver' },
  { id: 'stats', label: 'Stats', blurb: 'Advanced metrics — leaderboard & by team' },
  { id: 'trade', label: 'Trade Machine', blurb: 'Test a swap against the apron rules' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('explorer');

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
        {tab === 'explorer' && <TeamExplorer />}
        {tab === 'stats' && <StatsExplorer />}
        {tab === 'trade' && <TradeMachine />}
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
