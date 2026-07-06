import { useSyncExternalStore } from 'react';

// A tiny global store for the player stat-card modal: any view can open a card
// by player name; a single <PlayerCard/> mounted at the app root renders it.

let openName: string | null = null;
const listeners = new Set<() => void>();

export function openPlayerCard(name: string): void {
  openName = name;
  listeners.forEach((l) => l());
}

export function closePlayerCard(): void {
  if (openName == null) return;
  openName = null;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => openName;

export function usePlayerCard(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
