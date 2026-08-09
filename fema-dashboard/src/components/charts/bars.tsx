import { Fragment } from 'react';
import { barPath, niceTicks, useTooltip, AXIS_FONT } from './primitives';
import { money, count as fmtCount } from '../../lib/format';

const ROW_H = 30;
const BAR_H = 18;
const GAP = 2; // the surface gap that separates touching marks
const AXIS_BAND = 28;

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  tipLines?: string[];
}

/* ------------------------------------------- horizontal stacked bar rows */

export function StackedBarRows({
  width,
  rows,
  labelWidth = 132,
  valueFormat = fmtCount,
  onSegmentClick,
}: {
  width: number;
  rows: Array<{ label: string; sublabel?: string; segments: Segment[] }>;
  labelWidth?: number;
  valueFormat?: (n: number) => string;
  onSegmentClick?: (rowLabel: string, segKey: string) => void;
}) {
  const tip = useTooltip();
  const padRight = 62;
  const plotW = Math.max(80, width - labelWidth - padRight);
  const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals);
  const ticks = niceTicks(max);
  const scale = (v: number) => (v / ticks[ticks.length - 1]) * plotW;
  const height = rows.length * ROW_H + AXIS_BAND;

  return (
    <>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => (
          <Fragment key={t}>
            <line
              x1={labelWidth + scale(t)}
              x2={labelWidth + scale(t)}
              y1={0}
              y2={rows.length * ROW_H}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={labelWidth + scale(t)}
              y={rows.length * ROW_H + 17}
              fontSize={AXIS_FONT}
              fill="var(--text-muted)"
              textAnchor="middle"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {valueFormat(t)}
            </text>
          </Fragment>
        ))}

        {rows.map((row, ri) => {
          const y = ri * ROW_H + (ROW_H - BAR_H) / 2;
          let x = labelWidth;
          const total = totals[ri];
          const lastIdx = row.segments.map((s) => s.value > 0).lastIndexOf(true);

          return (
            <Fragment key={row.label}>
              <text x={labelWidth - 10} y={y + BAR_H / 2 + 4} fontSize={12} fill="var(--text-secondary)" textAnchor="end">
                {row.label}
              </text>
              {row.segments.map((seg, si) => {
                if (seg.value <= 0) return null;
                const w = scale(seg.value);
                const isLast = si === lastIdx;
                const drawW = Math.max(0, isLast ? w : w - GAP);
                const el = (
                  <path
                    key={seg.key}
                    d={
                      isLast
                        ? barPath(x, y, drawW, BAR_H, 4, true)
                        : `M${x},${y} h${drawW} v${BAR_H} h${-drawW} z`
                    }
                    fill={seg.color}
                    style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
                    onMouseMove={(e) => {
                      const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      tip.show(e.clientX - box.left, e.clientY - box.top, {
                        title: `${row.label} — ${seg.label}`,
                        lines: seg.tipLines ?? [valueFormat(seg.value)],
                      });
                    }}
                    onMouseLeave={tip.hide}
                    onClick={() => onSegmentClick?.(row.label, seg.key)}
                  />
                );
                x += w;
                return el;
              })}
              <text
                x={labelWidth + scale(total) + 8}
                y={y + BAR_H / 2 + 4}
                fontSize={12}
                fill="var(--text-secondary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {valueFormat(total)}
              </text>
            </Fragment>
          );
        })}
        <line x1={labelWidth} x2={labelWidth} y1={0} y2={rows.length * ROW_H} stroke="var(--axis)" strokeWidth={1} />
      </svg>
      {tip.node}
    </>
  );
}

/* ------------------------------------------------------------- bullet rows */

/**
 * Median and 90th percentile against a target. This is what separates "the step
 * is systemically slow" from "one record is stuck in it".
 */
export function BulletRows({
  width,
  rows,
  labelWidth = 156,
}: {
  width: number;
  rows: Array<{ label: string; median: number; p90: number; target: number }>;
  labelWidth?: number;
}) {
  const tip = useTooltip();
  const padRight = 54;
  const plotW = Math.max(80, width - labelWidth - padRight);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.p90, r.target * 1.4)));
  const ticks = niceTicks(max);
  const scale = (v: number) => (v / ticks[ticks.length - 1]) * plotW;
  const height = rows.length * ROW_H + AXIS_BAND;

  return (
    <>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => (
          <Fragment key={t}>
            <line x1={labelWidth + scale(t)} x2={labelWidth + scale(t)} y1={0} y2={rows.length * ROW_H} stroke="var(--grid)" />
            <text
              x={labelWidth + scale(t)}
              y={rows.length * ROW_H + 17}
              fontSize={AXIS_FONT}
              fill="var(--text-muted)"
              textAnchor="middle"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t}d
            </text>
          </Fragment>
        ))}

        {rows.map((r, ri) => {
          const y = ri * ROW_H + (ROW_H - BAR_H) / 2;
          const overTarget = r.median > r.target;
          return (
            <Fragment key={r.label}>
              <text x={labelWidth - 10} y={y + BAR_H / 2 + 4} fontSize={12} fill="var(--text-secondary)" textAnchor="end">
                {r.label}
              </text>
              {/* p90 as the light track, median as the solid bar */}
              <path d={barPath(labelWidth, y + 3, scale(r.p90), BAR_H - 6, 3, true)} fill="var(--seq-100)" />
              <path
                d={barPath(labelWidth, y + 5, scale(r.median), BAR_H - 10, 3, true)}
                fill={overTarget ? 'var(--status-critical)' : 'var(--seq-450)'}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  tip.show(e.clientX - box.left, e.clientY - box.top, {
                    title: r.label,
                    lines: [`Median ${r.median}d · 90th pct ${r.p90}d`, `Target ${r.target}d`],
                    sub: overTarget ? 'Median is past target — the step itself is slow' : 'Median inside target',
                  });
                }}
                onMouseLeave={tip.hide}
              />
              {/* target marker */}
              <line
                x1={labelWidth + scale(r.target)}
                x2={labelWidth + scale(r.target)}
                y1={y - 1}
                y2={y + BAR_H + 1}
                stroke="var(--text-primary)"
                strokeWidth={2}
              />
              <text
                x={labelWidth + Math.max(scale(r.p90), scale(r.target)) + 8}
                y={y + BAR_H / 2 + 4}
                fontSize={12}
                fill="var(--text-secondary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {r.median}d
              </text>
            </Fragment>
          );
        })}
        <line x1={labelWidth} x2={labelWidth} y1={0} y2={rows.length * ROW_H} stroke="var(--axis)" />
      </svg>
      {tip.node}
    </>
  );
}

/* ---------------------------------------------------------- funnel bars */

/** Dollars in motion — each stage is a subset of the one before it. */
export function FunnelBars({
  width,
  stages,
}: {
  width: number;
  stages: Array<{ key: string; label: string; dollars: number; count: number; gateNote: string }>;
}) {
  const tip = useTooltip();
  const labelWidth = 118;
  const padRight = 108;
  const plotW = Math.max(80, width - labelWidth - padRight);
  const max = Math.max(1, ...stages.map((s) => s.dollars));
  const rowH = 44;
  const barH = 22;
  const height = stages.length * rowH + 8;
  // Ordinal ramp: light→dark as the funnel narrows. Starts at step 250 so the
  // lightest mark still clears 2:1 against the surface.
  const ramp = ['var(--seq-250)', 'var(--seq-300)', 'var(--seq-450)', 'var(--seq-550)', 'var(--seq-600)'];

  return (
    <>
      <svg width={width} height={height} role="img">
        {stages.map((s, i) => {
          const y = i * rowH + 6;
          const w = (s.dollars / max) * plotW;
          const prev = i > 0 ? stages[i - 1] : null;
          const lost = prev ? prev.dollars - s.dollars : 0;
          return (
            <Fragment key={s.key}>
              <text x={labelWidth - 10} y={y + barH / 2 + 4} fontSize={12} fill="var(--text-secondary)" textAnchor="end">
                {s.label}
              </text>
              <path
                d={barPath(labelWidth, y, w, barH, 4, true)}
                fill={ramp[Math.min(i, ramp.length - 1)]}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  tip.show(e.clientX - box.left, e.clientY - box.top, {
                    title: s.label,
                    lines: [`${money(s.dollars)} across ${fmtCount(s.count)} projects`],
                    sub: s.gateNote,
                  });
                }}
                onMouseLeave={tip.hide}
              />
              <text
                x={labelWidth + w + 9}
                y={y + barH / 2 + 4}
                fontSize={12.5}
                fill="var(--text-primary)"
                fontWeight={600}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {money(s.dollars)}
              </text>
              {prev && lost > 0 ? (
                <text x={labelWidth + 2} y={y + barH + 13} fontSize={11} fill="var(--text-muted)">
                  {`${money(lost)} did not clear this gate — ${s.gateNote.toLowerCase()}`}
                </text>
              ) : null}
            </Fragment>
          );
        })}
      </svg>
      {tip.node}
    </>
  );
}

/* -------------------------------------------------------- horizon columns */

export function HorizonColumns({
  width,
  buckets,
  metric,
}: {
  width: number;
  buckets: Array<{ key: string; label: string; count: number; dollars: number }>;
  metric: 'count' | 'dollars';
}) {
  const tip = useTooltip();
  const height = 190;
  const padTop = 18;
  const padBottom = 44;
  const padLeft = 52;
  const plotH = height - padTop - padBottom;
  const colW = Math.max(30, (width - padLeft - 16) / buckets.length);
  const values = buckets.map((b) => (metric === 'count' ? b.count : b.dollars));
  const ticks = niceTicks(Math.max(1, ...values));
  const top = ticks[ticks.length - 1];
  const fmt = metric === 'count' ? fmtCount : money;
  // Past due is a breach; the rest is lead time, which is ordinary planning data.
  const colorFor = (key: string) =>
    key === 'past' ? 'var(--status-critical)' : key === 'd30' ? 'var(--status-serious)' : key === 'd60' ? 'var(--status-warning)' : 'var(--seq-300)';

  return (
    <>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => {
          const y = padTop + plotH - (t / top) * plotH;
          return (
            <Fragment key={t}>
              <line x1={padLeft} x2={width - 8} y1={y} y2={y} stroke="var(--grid)" />
              <text x={padLeft - 8} y={y + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(t)}
              </text>
            </Fragment>
          );
        })}
        {buckets.map((b, i) => {
          const v = metric === 'count' ? b.count : b.dollars;
          const h = (v / top) * plotH;
          const barW = Math.min(24, colW - 16);
          const x = padLeft + i * colW + (colW - barW) / 2;
          const y = padTop + plotH - h;
          return (
            <Fragment key={b.key}>
              <path
                d={barPath(x, y, barW, h, 4, false)}
                fill={colorFor(b.key)}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  tip.show(e.clientX - box.left, e.clientY - box.top, {
                    title: b.label,
                    lines: [`${fmtCount(b.count)} projects`, money(b.dollars)],
                  });
                }}
                onMouseLeave={tip.hide}
              />
              <text x={x + barW / 2} y={y - 7} fontSize={12} fill="var(--text-primary)" textAnchor="middle" fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(v)}
              </text>
              <text x={padLeft + i * colW + colW / 2} y={height - 24} fontSize={AXIS_FONT} fill="var(--text-secondary)" textAnchor="middle">
                {b.label}
              </text>
            </Fragment>
          );
        })}
        <line x1={padLeft} x2={width - 8} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--axis)" />
      </svg>
      {tip.node}
    </>
  );
}

/* --------------------------------------------------------- blocker pareto */

export function BlockerBars({
  width,
  blockers,
  metric,
}: {
  width: number;
  blockers: Array<{ key: string; label: string; count: number; dollars: number }>;
  metric: 'count' | 'dollars';
}) {
  const rows = blockers.map((b) => ({
    label: b.label,
    segments: [
      {
        key: b.key,
        label: 'Blocking',
        value: metric === 'count' ? b.count : b.dollars,
        color: 'var(--seq-450)',
        tipLines: [`${fmtCount(b.count)} items`, `${money(b.dollars)} held`],
      },
    ],
  }));
  return <StackedBarRows width={width} rows={rows} labelWidth={220} valueFormat={metric === 'count' ? fmtCount : money} />;
}

/* ---------------------------------------------------- pareto + cumulative */

/**
 * Two panels sharing one x-axis rather than a dual-axis Pareto: per-item
 * dollars on top, cumulative dollars beneath, both on their own single scale.
 */
export function ParetoPanels({
  width,
  items,
  cumulative,
  capacity,
  capacityUnlock,
  totalUnlock,
}: {
  width: number;
  items: Array<{ label: string; value: number; sub: string }>;
  cumulative: number[];
  capacity: number;
  capacityUnlock: number;
  totalUnlock: number;
}) {
  const tip = useTooltip();
  const shown = items.slice(0, 40);
  const padLeft = 58;
  const padRight = 12;
  const plotW = Math.max(60, width - padLeft - padRight);
  const padTop = 20; // headroom so the top axis tick is not sliced
  const barPanelH = 150;
  const cumPanelH = 96;
  const gapBetween = 26;
  const labelBand = 30;
  const height = padTop + barPanelH + gapBetween + cumPanelH + labelBand;

  const slot = plotW / Math.max(shown.length, 1);
  const barW = Math.min(18, Math.max(3, slot - 4));
  const barTicks = niceTicks(Math.max(1, ...shown.map((i) => i.value)), 3);
  const barTop = barTicks[barTicks.length - 1];
  const cumTicks = niceTicks(Math.max(1, totalUnlock), 3);
  const cumTop = cumTicks[cumTicks.length - 1];
  const cutX = padLeft + Math.min(capacity, shown.length) * slot;

  const barTopY = padTop;
  const barBaseY = padTop + barPanelH;
  const cumY = padTop + barPanelH + gapBetween;
  const cumPath = shown
    .map((_, i) => {
      const x = padLeft + i * slot + slot / 2;
      const y = cumY + cumPanelH - ((cumulative[i] ?? 0) / cumTop) * cumPanelH;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <>
      <svg width={width} height={height} role="img">
        {/* --- per-item panel --- */}
        {barTicks.map((t) => {
          const y = barBaseY - (t / barTop) * barPanelH;
          return (
            <Fragment key={`b${t}`}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--grid)" />
              <text x={padLeft - 8} y={y + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(t)}
              </text>
            </Fragment>
          );
        })}
        {shown.map((it, i) => {
          const h = (it.value / barTop) * barPanelH;
          const x = padLeft + i * slot + (slot - barW) / 2;
          const inside = i < capacity;
          return (
            <path
              key={it.label + i}
              d={barPath(x, barBaseY - h, barW, h, 3, false)}
              fill={inside ? 'var(--seq-450)' : 'var(--neutral-mark)'}
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                tip.show(e.clientX - box.left, e.clientY - box.top, {
                  title: `${i + 1}. ${it.label}`,
                  lines: [`${money(it.value)} unlocked`],
                  sub: `${it.sub}${inside ? ' · inside capacity' : ' · below the cut line'}`,
                });
              }}
              onMouseLeave={tip.hide}
            />
          );
        })}
        <line x1={padLeft} x2={width - padRight} y1={barBaseY} y2={barBaseY} stroke="var(--axis)" />

        {/* --- capacity cut line, spanning both panels --- */}
        <line x1={cutX} x2={cutX} y1={barTopY - 14} y2={cumY + cumPanelH} stroke="var(--status-critical)" strokeWidth={2} />
        <text x={cutX + 6} y={barTopY - 5} fontSize={11} fill="var(--status-critical)" fontWeight={650}>
          {`capacity: ${capacity}/mo`}
        </text>

        {/* --- cumulative panel --- */}
        {cumTicks.map((t) => {
          const y = cumY + cumPanelH - (t / cumTop) * cumPanelH;
          return (
            <Fragment key={`c${t}`}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--grid)" />
              <text x={padLeft - 8} y={y + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(t)}
              </text>
            </Fragment>
          );
        })}
        <path d={cumPath} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle
          cx={cutX}
          cy={cumY + cumPanelH - (capacityUnlock / cumTop) * cumPanelH}
          r={4.5}
          fill="var(--series-2)"
          stroke="var(--surface-1)"
          strokeWidth={2}
        />
        <text
          x={Math.min(cutX + 8, width - 130)}
          y={cumY + cumPanelH - (capacityUnlock / cumTop) * cumPanelH - 9}
          fontSize={12}
          fill="var(--text-primary)"
          fontWeight={650}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {`${money(capacityUnlock)} unlocked`}
        </text>
        <line x1={padLeft} x2={width - padRight} y1={cumY + cumPanelH} y2={cumY + cumPanelH} stroke="var(--axis)" />

        <text x={padLeft} y={height - 10} fontSize={AXIS_FONT} fill="var(--text-muted)">
          rank 1
        </text>
        <text x={width - padRight} y={height - 10} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end">
          {`rank ${shown.length}${items.length > shown.length ? ` of ${items.length}` : ''}`}
        </text>
      </svg>
      {tip.node}
    </>
  );
}

/* ------------------------------------------------------- grouped columns */

/** Arrivals vs resolutions per week — the only view that answers "are we winning?" */
export function FlowColumns({
  width,
  weeks,
}: {
  width: number;
  weeks: Array<{ weekStart: string; opened: number; resolved: number; openAtEnd: number }>;
}) {
  const tip = useTooltip();
  const padLeft = 46;
  const padRight = 10;
  const padTop = 12;
  const plotH = 132;
  const labelBand = 26;
  const height = padTop + plotH + labelBand;
  const plotW = Math.max(60, width - padLeft - padRight);
  const slot = plotW / Math.max(weeks.length, 1);
  const barW = Math.min(9, Math.max(3, slot / 2 - 3));
  const ticks = niceTicks(Math.max(1, ...weeks.flatMap((w) => [w.opened, w.resolved])), 3);
  const top = ticks[ticks.length - 1];

  return (
    <>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => {
          const y = padTop + plotH - (t / top) * plotH;
          return (
            <Fragment key={t}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--grid)" />
              <text x={padLeft - 8} y={y + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t}
              </text>
            </Fragment>
          );
        })}
        {weeks.map((w, i) => {
          const xc = padLeft + i * slot + slot / 2;
          const ho = (w.opened / top) * plotH;
          const hr = (w.resolved / top) * plotH;
          return (
            <Fragment key={w.weekStart}>
              <path d={barPath(xc - barW - GAP / 2, padTop + plotH - ho, barW, ho, 3, false)} fill="var(--series-2)" />
              <path d={barPath(xc + GAP / 2, padTop + plotH - hr, barW, hr, 3, false)} fill="var(--series-3)" />
              <rect
                x={padLeft + i * slot}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  tip.show(e.clientX - box.left, e.clientY - box.top, {
                    title: `Week of ${w.weekStart}`,
                    lines: [`New exceptions: ${w.opened}`, `Resolved: ${w.resolved}`, `Open at week end: ${w.openAtEnd}`],
                    sub: w.opened > w.resolved ? 'Backlog grew this week' : 'Backlog shrank this week',
                  });
                }}
                onMouseLeave={tip.hide}
              />
            </Fragment>
          );
        })}
        <line x1={padLeft} x2={width - padRight} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--axis)" />
        <text x={padLeft} y={height - 8} fontSize={AXIS_FONT} fill="var(--text-muted)">
          {weeks[0]?.weekStart ?? ''}
        </text>
        <text x={width - padRight} y={height - 8} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end">
          this week
        </text>
      </svg>
      {tip.node}
    </>
  );
}

/* ----------------------------------------------------------------- meter */

/** A single ratio against a target — the unfilled track is a lighter step of the same ramp. */
export function Meter({
  width,
  value,
  target,
  label,
  valueLabel,
}: {
  width: number;
  value: number;
  target: number;
  label: string;
  valueLabel: string;
}) {
  const h = 22;
  const w = Math.max(120, width);
  const filled = Math.max(0, Math.min(1, value)) * w;
  const targetX = Math.max(0, Math.min(1, target)) * w;
  const short = value < target;

  return (
    <svg width={w} height={h + 34} role="img">
      <rect x={0} y={0} width={w} height={h} rx={5} fill="var(--seq-100)" />
      <path d={barPath(0, 0, filled, h, 5, true)} fill={short ? 'var(--status-warning)' : 'var(--seq-500)'} />
      <line x1={targetX} x2={targetX} y1={-3} y2={h + 3} stroke="var(--text-primary)" strokeWidth={2} />
      <text x={0} y={h + 17} fontSize={12} fill="var(--text-primary)" fontWeight={620} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {valueLabel}
      </text>
      <text x={targetX} y={h + 17} fontSize={11} fill="var(--text-muted)" textAnchor={targetX > w * 0.8 ? 'end' : 'start'}>
        {`target ${Math.round(target * 100)}%`}
      </text>
      <text x={0} y={h + 32} fontSize={11.5} fill="var(--text-muted)">
        {label}
      </text>
    </svg>
  );
}
