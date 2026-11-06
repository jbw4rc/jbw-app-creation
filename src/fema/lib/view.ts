// Pure helpers the page uses to filter, sort, label and export the feed.
import type { Category, Declaration, Opportunity, Tier } from '../types';
import { CATEGORY_LABEL, TIER_LABEL } from './classify';

const DAY = 86_400_000;

export type DueState = 'closed' | 'urgent' | 'soon' | 'open' | 'unknown';

export function dueState(o: Opportunity, now = Date.now()): DueState {
  if (!o.dueDate) return 'unknown';
  const days = (new Date(o.dueDate).getTime() - now) / DAY;
  if (days < 0) return 'closed';
  if (days <= 3) return 'urgent';
  if (days <= 10) return 'soon';
  return 'open';
}

export function dueLabel(o: Opportunity, now = Date.now()): string {
  if (!o.dueDate) return 'No due date listed';
  const d = new Date(o.dueDate);
  const days = Math.ceil((d.getTime() - now) / DAY);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
  if (days < 0) return `Closed ${date}`;
  if (days === 0) return `Due today · ${date}`;
  if (days === 1) return `Due tomorrow · ${date}`;
  return `Due in ${days} days · ${date}`;
}

export const isNew = (o: Opportunity, days = 7, now = Date.now()) => now - new Date(o.firstSeen).getTime() < days * DAY;

/** Declarations still in their buying window: declared within the last `months`. */
export function activeDeclarations(decls: Declaration[], months = 24, now = Date.now()): Declaration[] {
  const floor = now - months * 30.4 * DAY;
  return decls.filter((d) => new Date(d.declarationDate).getTime() >= floor && !d.closeoutDate);
}

export function declarationsByState(decls: Declaration[]): Map<string, Declaration[]> {
  const m = new Map<string, Declaration[]>();
  for (const d of decls) m.set(d.state, [...(m.get(d.state) ?? []), d]);
  return m;
}

export type SortKey = 'score' | 'due' | 'newest';

export interface Filters {
  q: string;
  state: string;          // '' = all
  categories: Category[]; // empty = all
  minTier: Tier;
  includeClosed: boolean;
  newOnly: boolean;
  declaredOnly: boolean;
  starredOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  state: '',
  categories: [],
  minTier: 'adjacent',
  includeClosed: false,
  newOnly: false,
  declaredOnly: false,
  starredOnly: false,
  sort: 'score',
};

const TIER_RANK: Record<Tier, number> = { core: 3, likely: 2, adjacent: 1 };

export function applyFilters(
  opps: Opportunity[],
  f: Filters,
  ctx: { declaredStates: Set<string>; starred: Set<string>; now?: number }
): Opportunity[] {
  const now = ctx.now ?? Date.now();
  const q = f.q.trim().toLowerCase();
  const out = opps.filter((o) => {
    if (TIER_RANK[o.tier] < TIER_RANK[f.minTier]) return false;
    if (!f.includeClosed && dueState(o, now) === 'closed') return false;
    if (f.state && o.state !== f.state) return false;
    if (f.categories.length && !o.categories.some((c) => f.categories.includes(c))) return false;
    if (f.newOnly && !isNew(o, 7, now)) return false;
    if (f.declaredOnly && !(o.state && ctx.declaredStates.has(o.state)) && o.disasterNumbers.length === 0) return false;
    if (f.starredOnly && !ctx.starred.has(o.id)) return false;
    if (q) {
      const hay = `${o.title} ${o.agency} ${o.place ?? ''} ${o.state ?? ''} ${o.solicitationNumber ?? ''} ${o.summary ?? ''}`.toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const due = (o: Opportunity) => (o.dueDate ? new Date(o.dueDate).getTime() : Infinity);
  const byDue = (a: Opportunity, b: Opportunity) => {
    // Open bids first by soonest deadline; closed ones sink to the bottom.
    const ca = due(a) < now, cb = due(b) < now;
    return ca !== cb ? (ca ? 1 : -1) : due(a) - due(b);
  };
  if (f.sort === 'due') out.sort((a, b) => byDue(a, b) || b.score - a.score);
  else if (f.sort === 'newest') out.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.score - a.score);
  else out.sort((a, b) => b.score - a.score || byDue(a, b));
  return out;
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(opps: Opportunity[]): string {
  const head = ['Score', 'Tier', 'Title', 'Agency', 'State', 'Place', 'Categories', 'Notice type', 'Solicitation #', 'NAICS', 'Set-aside', 'Posted', 'Due', 'Disaster #s', 'Why it scored', 'Source', 'URL', 'First seen'];
  const rows = opps.map((o) => [
    o.score, TIER_LABEL[o.tier], o.title, o.agency, o.state, o.place,
    o.categories.map((c) => CATEGORY_LABEL[c]).join('; '), o.noticeType, o.solicitationNumber, o.naics, o.setAside,
    o.postedDate?.slice(0, 10), o.dueDate?.slice(0, 10), o.disasterNumbers.join('; '), o.matched.join('; '),
    o.sourceName, o.url, o.firstSeen.slice(0, 10),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function agoLabel(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}
