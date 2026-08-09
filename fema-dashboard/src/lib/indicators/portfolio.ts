/**
 * Cross-cutting views that sit above the eleven queues.
 *
 * These exist because the individual indicators cannot answer the two questions
 * management actually opens a dashboard with: "where is the money stuck?" and
 * "are we gaining on the backlog?"
 */

import type { Dataset, ExceptionRow, IndicatorId, Project } from '../../types';
import { addDays, daysBetween, weekStart } from '../dates';
import { closeoutDeadline } from './reconciliation';

/* ----------------------------------------------------- dollars in motion */

export interface FunnelStage {
  key: string;
  label: string;
  /** Obligated dollars that have reached at least this stage. */
  dollars: number;
  count: number;
  /** What is holding back the dollars that did NOT clear this gate. */
  gateNote: string;
}

const STAGE_LABELS = [
  { key: 'obligated', label: 'Obligated', gateNote: 'Total obligated on live projects' },
  { key: 'validated', label: 'Validated', gateNote: 'Large-project costs not yet validated' },
  { key: 'reimbursed', label: 'Reimbursed', gateNote: 'Funds obligated but not yet drawn' },
  { key: 'closeoutReady', label: 'Closeout-ready', gateNote: 'Work done but closeout criteria unmet' },
  { key: 'closed', label: 'Closed', gateNote: 'Closeout-ready but not yet closed' },
];

/**
 * Furthest stage a project has reached. Monotone by construction: a project
 * only advances if every earlier gate is satisfied, so the funnel can never
 * widen as it goes right.
 */
function furthestStage(p: Project, closeoutReadyIds: Set<string>): number {
  if (p.obligatedAmount <= 0) return -1;
  const validated = p.size === 'Small' || p.validatedAmount >= p.obligatedAmount;
  if (!validated) return 0;
  const reimbursed = p.drawnAmount >= p.obligatedAmount * 0.99;
  if (!reimbursed) return 1;
  const ready = closeoutReadyIds.has(p.id) || p.femaStatus === 'Closed';
  if (!ready) return 2;
  if (p.femaStatus !== 'Closed') return 3;
  return 4;
}

export function computeFunnel(ds: Dataset, closeoutReadyIds: Set<string>): FunnelStage[] {
  const live = ds.projects.filter((p) => p.femaStatus !== 'Withdrawn' && p.obligatedAmount > 0);
  const stages = STAGE_LABELS.map((s) => ({ ...s, dollars: 0, count: 0 }));
  for (const p of live) {
    const reached = furthestStage(p, closeoutReadyIds);
    for (let k = 0; k <= reached; k += 1) {
      stages[k].dollars += p.obligatedAmount;
      stages[k].count += 1;
    }
  }
  return stages;
}

/* ------------------------------------------------------ deadline horizon */

export interface DeadlineItem {
  projectId: string;
  applicantName: string;
  disasterId: string;
  kind: 'Period of performance' | 'Closeout (PoP + 180d)';
  date: string;
  daysUntil: number;
  dollars: number;
  hasExtension: boolean;
}

export function computeDeadlineHorizon(ds: Dataset): DeadlineItem[] {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const out: DeadlineItem[] = [];

  for (const p of ds.projects) {
    if (p.femaStatus !== 'Open' || p.sorStatus === 'Closed') continue;
    const applicant = applicantsById.get(p.applicantId)!;

    const popDays = daysBetween(ds.asOf, p.popEndDate);
    if (popDays <= 365) {
      out.push({
        projectId: p.id,
        applicantName: applicant.name,
        disasterId: p.disasterId,
        kind: 'Period of performance',
        date: p.popEndDate,
        daysUntil: popDays,
        dollars: p.obligatedAmount,
        hasExtension: p.extensionsGranted > 0,
      });
    }

    const deadline = closeoutDeadline(p);
    const coDays = daysBetween(ds.asOf, deadline);
    if (coDays <= 365) {
      out.push({
        projectId: p.id,
        applicantName: applicant.name,
        disasterId: p.disasterId,
        kind: 'Closeout (PoP + 180d)',
        date: deadline,
        daysUntil: coDays,
        dollars: p.obligatedAmount,
        hasExtension: p.closeoutExtensionOnFile,
      });
    }
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

/* --------------------------------------------------------- backlog flow */

export interface FlowWeek {
  weekStart: string;
  opened: number;
  resolved: number;
  openAtEnd: number;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(seedStr: string) {
  let a = hashSeed(seedStr);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weekly arrivals and resolutions ending exactly at today's open count.
 *
 * In production this comes from snapshot history — cache each parsed workbook
 * in IndexedDB and the series builds itself. Here it is simulated so the trend
 * and flow views can be designed against realistic shapes.
 */
export function buildFlowHistory(indicator: IndicatorId, currentOpen: number, weeks = 16, asOf = ''): FlowWeek[] {
  const rand = rngFor(indicator);
  const rate = Math.max(1, Math.round(currentOpen * 0.16));

  const opened: number[] = [];
  const resolved: number[] = [];
  for (let i = 0; i < weeks; i += 1) {
    opened.push(Math.max(0, Math.round(rate * (0.55 + rand() * 0.95))));
    resolved.push(Math.max(0, Math.round(rate * (0.5 + rand() * 1.0))));
  }

  const sumOpened = opened.reduce((s, x) => s + x, 0);
  const sumResolved = resolved.reduce((s, x) => s + x, 0);
  let start = currentOpen - sumOpened + sumResolved;
  if (start < 0) {
    // Scale resolutions back so the series never goes negative.
    const factor = Math.max(0, (currentOpen + sumOpened) / Math.max(sumResolved, 1)) * 0.9;
    for (let i = 0; i < weeks; i += 1) resolved[i] = Math.round(resolved[i] * factor);
    start = Math.max(0, currentOpen - sumOpened + resolved.reduce((s, x) => s + x, 0));
  }

  const out: FlowWeek[] = [];
  let open = start;
  const firstWeek = weekStart(asOf || new Date().toISOString().slice(0, 10));
  for (let i = 0; i < weeks; i += 1) {
    open = Math.max(0, open + opened[i] - resolved[i]);
    out.push({
      weekStart: addDays(firstWeek, (i - (weeks - 1)) * 7),
      opened: opened[i],
      resolved: resolved[i],
      openAtEnd: open,
    });
  }

  // Pin the final point to the true current count.
  if (out.length) {
    const last = out[out.length - 1];
    const drift = currentOpen - last.openAtEnd;
    last.openAtEnd = currentOpen;
    last.opened = Math.max(0, last.opened + drift);
  }
  return out;
}

/** Portfolio-wide flow: the sum across all eleven queues. */
export function combineFlow(all: FlowWeek[][]): FlowWeek[] {
  if (all.length === 0) return [];
  const weeks = all[0].length;
  const out: FlowWeek[] = [];
  for (let i = 0; i < weeks; i += 1) {
    out.push({
      weekStart: all[0][i].weekStart,
      opened: all.reduce((s, series) => s + (series[i]?.opened ?? 0), 0),
      resolved: all.reduce((s, series) => s + (series[i]?.resolved ?? 0), 0),
      openAtEnd: all.reduce((s, series) => s + (series[i]?.openAtEnd ?? 0), 0),
    });
  }
  return out;
}

/** Rows detected within the last 7 days — the "new this week" badge. */
export function newThisWeek(rows: ExceptionRow[], asOf: string): ExceptionRow[] {
  return rows.filter((r) => daysBetween(r.detectedOn, asOf) <= 7 && daysBetween(r.detectedOn, asOf) >= 0);
}
