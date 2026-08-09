const DAY_MS = 24 * 60 * 60 * 1000;

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parse(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function addDays(d: string, days: number): string {
  return iso(new Date(parse(d).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS);
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  const dt = parse(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(d: string): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Monday-anchored week start, used by the backlog flow chart. */
export function weekStart(d: string): string {
  const dt = parse(d);
  const dow = (dt.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}
