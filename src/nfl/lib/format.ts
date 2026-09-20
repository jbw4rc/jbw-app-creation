// Display helpers. Betting numbers have conventions — a spread is always shown
// with its sign, a price is always shown with its sign — and breaking them
// makes a board unreadable at a glance.

/** "-3.5" / "+7" / "PK" — a spread as a bettor reads it. */
export function spreadLabel(point: number): string {
  if (!Number.isFinite(point)) return '—';
  if (Math.abs(point) < 0.01) return 'PK';
  const n = Math.abs(point) % 1 === 0 ? point.toFixed(0) : point.toFixed(1);
  return point > 0 ? `+${n}` : n;
}

/** "-110" / "+145" — American odds always carry their sign. */
export function priceLabel(price: number): string {
  if (!Number.isFinite(price)) return '—';
  return price > 0 ? `+${Math.round(price)}` : `${Math.round(price)}`;
}

/** "47.5" for a total. */
export function totalLabel(point: number): string {
  if (!Number.isFinite(point)) return '—';
  return point % 1 === 0 ? point.toFixed(0) : point.toFixed(1);
}

/** "+0.85" — a signed point delta, for movement columns. */
export function deltaLabel(delta: number, digits = 2): string {
  if (!Number.isFinite(delta)) return '—';
  const s = delta.toFixed(digits);
  return delta > 0 ? `+${s}` : s;
}

/** "4.8%" — a book's hold. */
export function holdLabel(h: number): string {
  return Number.isFinite(h) ? `${(h * 100).toFixed(1)}%` : '—';
}

/** "Sun 1:00 PM" — kickoff, in the reader's own timezone. */
export function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Sep 20, 3:15 PM" — a full timestamp for the data-freshness line. */
export function stampLabel(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Team nickname — the last word of "Kansas City Chiefs". */
export function nickname(team: string): string {
  const parts = team.split(' ');
  return parts[parts.length - 1];
}

/**
 * End of the current NFL week, as a timestamp.
 *
 * A live pull returns every game the books have posted, which late in a week
 * means next week's openers too — 29 games, not the 14 on today's slate. Those
 * far-out lines have had no real money through them yet, so letting them rank
 * against today's games is noise at best and misleading at worst.
 *
 * The football week runs Thursday through Monday night, so it ends at the
 * Tuesday after the most recent Thursday.
 */
export function endOfNflWeek(now: Date = new Date()): number {
  const d = new Date(now);
  d.setUTCHours(6, 0, 0, 0);
  // Step forward to the next Tuesday (day 2); if today is Tuesday before 06:00
  // UTC we are still in the previous football week.
  while (d.getUTCDay() !== 2 || d.getTime() <= now.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.getTime();
}
