import { openPlayerCard } from '../lib/playerCardStore';

// A player's name, clickable to open their stat card. Drop-in replacement for a
// plain name span across the rotation, trade, and signing views.
export function PlayerName({ name, className }: { name: string; className?: string }) {
  return (
    <button
      type="button"
      className={`pl-name${className ? ' ' + className : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        openPlayerCard(name);
      }}
      title={`${name} — view stats`}
    >
      {name}
    </button>
  );
}
