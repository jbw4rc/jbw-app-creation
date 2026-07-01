import { useState } from 'react';
import { TeamExplorer } from './components/TeamExplorer';
import { TradeMachine } from './components/TradeMachine';
import { FreeAgentMachine } from './components/FreeAgentMachine';

type Tab = 'explorer' | 'trade' | 'freeAgent';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'explorer', label: 'Team Explorer', blurb: 'Rosters, 5-year salary, picks & apron status' },
  { id: 'trade', label: 'Trade Machine', blurb: 'Test a swap against the apron rules' },
  { id: 'freeAgent', label: 'Free Agent Machine', blurb: 'Which signing tools are legal' },
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

      <main className="app-main">
        {tab === 'explorer' && <TeamExplorer />}
        {tab === 'trade' && <TradeMachine />}
        {tab === 'freeAgent' && <FreeAgentMachine />}
      </main>

      <footer className="app-footer">
        <span>
          Two aprons per the 2023 CBA. Cap figures for 2024-25 &amp; 2025-26 are official;
          later seasons are projected at the 10% max increase. Rosters and rule
          simplifications are illustrative for planning, not official league rulings.
        </span>
      </footer>
    </div>
  );
}
