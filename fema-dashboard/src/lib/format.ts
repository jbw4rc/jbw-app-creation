/** Compact money for tiles and axes: $4.2M, $128K, $940. */
export function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Full money for tables and drawers: $1,047,320. */
export function moneyFull(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function days(n: number | null): string {
  if (n === null) return '—';
  return `${n}d`;
}

/** "12 days over" / "3 days left" — signed age relative to a target. */
export function relativeDays(n: number): string {
  if (n === 0) return 'due today';
  return n > 0 ? `${n}d over` : `${Math.abs(n)}d left`;
}
