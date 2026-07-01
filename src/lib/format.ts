// Small formatting helpers shared across the UI.

/** $49.21M style, compact and readable for cap figures. */
export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Full dollar figure with grouping, e.g. $49,205,800. */
export function moneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** "2024-25" style season label from a starting year. */
export function seasonLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${end.toString().padStart(2, '0')}`;
}

/** Signed dollar figure — "+$3.10M under" / "$1.20M over". */
export function spaceLabel(space: number): string {
  if (space >= 0) return `${money(space)} under`;
  return `${money(Math.abs(space))} over`;
}

/** "Jul 1, 2026, 4:41 PM" from an ISO timestamp; empty string if invalid. */
export function whenUpdated(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
