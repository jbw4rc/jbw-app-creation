import { Fragment } from 'react';
import { AXIS_FONT, niceTicks, useTooltip } from './primitives';
import { money, count as fmtCount } from '../../lib/format';
import { daysBetween, formatDate, parse } from '../../lib/dates';

/* -------------------------------------------------------------- sparkline */

export function Sparkline({
  points,
  width = 92,
  height = 26,
  invertGood = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  /** true = a rising line is bad (a growing backlog). */
  invertGood?: boolean;
}) {
  if (points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const x = (i: number) => (i / (points.length - 1)) * (width - 6) + 3;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 8);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const rising = points[points.length - 1] > points[0];
  const endColor = invertGood
    ? rising
      ? 'var(--status-critical)'
      : 'var(--status-good)'
    : 'var(--series-1)';

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--neutral-mark)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={3.5} fill={endColor} stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}

/* ------------------------------------------------------- quadrant scatter */

export interface QuadrantPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  flagX: boolean;
  flagY: boolean;
  sub: string;
}

/**
 * Indicator 3 is the one genuinely two-dimensional rule in the set, so the rule
 * itself is drawn: crosshairs at both targets, and the upper-right quadrant is
 * the action list.
 */
export function QuadrantScatter({
  width,
  points,
  targetX,
  targetY,
  xLabel,
  yLabel,
  onSelect,
}: {
  width: number;
  points: QuadrantPoint[];
  targetX: number;
  targetY: number;
  xLabel: string;
  yLabel: string;
  onSelect?: (id: string) => void;
}) {
  const tip = useTooltip();
  const padLeft = 52;
  const padRight = 14;
  const padTop = 14;
  const plotH = 260;
  const labelBand = 42;
  const height = padTop + plotH + labelBand;
  const plotW = Math.max(60, width - padLeft - padRight);

  const xMax = Math.max(targetX * 1.6, ...points.map((p) => p.x)) * 1.04;
  const xTicks = niceTicks(xMax, 5);
  const xTop = xTicks[xTicks.length - 1];
  const sx = (v: number) => padLeft + (v / xTop) * plotW;
  // Headroom so a bubble sitting at 100% is not sliced by the top of the plot.
  const HEADROOM = 18;
  const sy = (v: number) => padTop + HEADROOM + (1 - v) * (plotH - HEADROOM);
  const maxSize = Math.max(1, ...points.map((p) => p.size));
  const radius = (s: number) => 4 + Math.sqrt(s / maxSize) * 11;

  const colorFor = (p: QuadrantPoint) =>
    p.flagX && p.flagY ? 'var(--status-critical)' : p.flagX ? 'var(--status-serious)' : p.flagY ? 'var(--status-warning)' : 'var(--neutral-mark)';

  return (
    <>
      <svg width={width} height={height} role="img">
        {/* action quadrant wash */}
        <rect
          x={sx(targetX)}
          y={padTop}
          width={Math.max(0, padLeft + plotW - sx(targetX))}
          height={Math.max(0, sy(targetY) - padTop)}
          fill="var(--status-critical)"
          opacity={0.06}
        />

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <Fragment key={t}>
            <line x1={padLeft} x2={padLeft + plotW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={padLeft - 8} y={sy(t) + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {`${Math.round(t * 100)}%`}
            </text>
          </Fragment>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={padTop + plotH + 17} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(t)}
          </text>
        ))}

        {/* target crosshairs */}
        <line x1={sx(targetX)} x2={sx(targetX)} y1={padTop} y2={padTop + plotH} stroke="var(--text-primary)" strokeWidth={2} />
        <line x1={padLeft} x2={padLeft + plotW} y1={sy(targetY)} y2={sy(targetY)} stroke="var(--text-primary)" strokeWidth={2} />
        {points.map((p) => (
          <circle
            key={p.id}
            cx={sx(Math.min(p.x, xTop))}
            cy={sy(Math.min(p.y, 1))}
            r={radius(p.size)}
            fill={colorFor(p)}
            fillOpacity={0.75}
            stroke="var(--surface-1)"
            strokeWidth={2}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              tip.show(e.clientX - box.left, e.clientY - box.top, {
                title: p.label,
                lines: [`${Math.round(p.x)} days post-obligation`, `${Math.round(p.y * 100)}% unvalidated · ${money(p.size)}`],
                sub: p.sub,
              });
            }}
            onMouseLeave={tip.hide}
            onClick={() => onSelect?.(p.id)}
          />
        ))}

        {/* Threshold labels are drawn last, on a surface-colored halo, so they
            stay legible where they cross the data instead of tangling with it. */}
        <rect x={sx(targetX) + 4} y={padTop + 2} width={86} height={15} rx={3} fill="var(--surface-1)" opacity={0.94} />
        <text x={sx(targetX) + 8} y={padTop + 13} fontSize={11} fill="var(--text-secondary)" fontWeight={600}>
          {`${targetX}-day target`}
        </text>
        <rect x={padLeft + 4} y={sy(targetY) - 18} width={150} height={15} rx={3} fill="var(--surface-1)" opacity={0.94} />
        <text x={padLeft + 8} y={sy(targetY) - 7} fontSize={11} fill="var(--text-secondary)" fontWeight={600}>
          {`${Math.round(targetY * 100)}% unvalidated ceiling`}
        </text>

        <line x1={padLeft} x2={padLeft + plotW} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--axis)" />
        <text x={padLeft + plotW / 2} y={height - 8} fontSize={11.5} fill="var(--text-secondary)" textAnchor="middle">
          {xLabel}
        </text>
        <text x={12} y={padTop + plotH / 2} fontSize={11.5} fill="var(--text-secondary)" textAnchor="middle" transform={`rotate(-90 12 ${padTop + plotH / 2})`}>
          {yLabel}
        </text>
      </svg>
      {tip.node}
    </>
  );
}

/* ------------------------------------------------------ value vs. effort */

export function ValueEffortScatter({
  width,
  points,
  onSelect,
}: {
  width: number;
  points: Array<{ id: string; label: string; effort: number; value: number; batch: number; sub: string }>;
  onSelect?: (id: string) => void;
}) {
  const tip = useTooltip();
  const padLeft = 58;
  const padRight = 14;
  const padTop = 14;
  const plotH = 246;
  const labelBand = 40;
  const height = padTop + plotH + labelBand;
  const plotW = Math.max(60, width - padLeft - padRight);

  const vTop = Math.max(1, ...points.map((p) => p.value));
  const eMax = Math.max(10, ...points.map((p) => p.effort));
  const sx = (v: number) => padLeft + (v / eMax) * plotW;
  // Square-root value axis. Unlock amounts are long-tailed — on a linear axis a
  // handful of $10M+ items flatten everything else onto the baseline and the
  // chart stops discriminating. Sqrt keeps zero meaningful (unlike log) and is
  // called out on the axis so nobody misreads the spacing.
  const sy = (v: number) => padTop + plotH - (Math.sqrt(Math.max(0, v)) / Math.sqrt(vTop)) * plotH;
  const vTicks = [0, vTop / 64, vTop / 16, vTop / 4, vTop];

  // Split on the medians, not the midpoint of the range. Dollar unlock is
  // heavily long-tailed, so a range midpoint puts every single point in one
  // quadrant and the chart says nothing.
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const midE = median(points.map((p) => p.effort));
  const midV = median(points.map((p) => p.value));

  return (
    <>
      <svg width={width} height={height} role="img">
        {vTicks.map((t, i) => (
          <Fragment key={i}>
            <line x1={padLeft} x2={padLeft + plotW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={padLeft - 8} y={sy(t) + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(t)}
            </text>
          </Fragment>
        ))}
        <line x1={sx(midE)} x2={sx(midE)} y1={padTop} y2={padTop + plotH} stroke="var(--text-primary)" strokeWidth={2} opacity={0.5} />
        <line x1={padLeft} x2={padLeft + plotW} y1={sy(midV)} y2={sy(midV)} stroke="var(--text-primary)" strokeWidth={2} opacity={0.5} />

        {points.map((p) => (
          <circle
            key={p.id}
            cx={sx(Math.min(p.effort, eMax))}
            cy={sy(Math.min(p.value, vTop))}
            r={4 + Math.min(9, p.batch * 1.6)}
            fill="var(--series-1)"
            fillOpacity={0.72}
            stroke="var(--surface-1)"
            strokeWidth={2}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              tip.show(e.clientX - box.left, e.clientY - box.top, {
                title: p.label,
                lines: [`${money(p.value)} unlocked`, `${p.batch} item${p.batch === 1 ? '' : 's'} at this applicant`],
                sub: p.sub,
              });
            }}
            onMouseLeave={tip.hide}
            onClick={() => onSelect?.(p.id)}
          />
        ))}

        {/* Quadrant labels drawn last, on halos, so they survive dense data. */}
        {(
          [
            ['quick wins', padLeft + 8, padTop + 14, 'start'],
            ['big bets', padLeft + plotW - 8, padTop + 14, 'end'],
            ['fill-ins', padLeft + 8, padTop + plotH - 8, 'start'],
            ['low priority', padLeft + plotW - 8, padTop + plotH - 8, 'end'],
          ] as const
        ).map(([label, x, y, anchor]) => (
          <Fragment key={label}>
            <rect
              x={anchor === 'start' ? x - 3 : x - label.length * 6 - 3}
              y={y - 11}
              width={label.length * 6 + 6}
              height={14}
              rx={3}
              fill="var(--surface-1)"
              opacity={0.9}
            />
            <text x={x} y={y} fontSize={11} fill="var(--text-muted)" textAnchor={anchor} fontWeight={600}>
              {label}
            </text>
          </Fragment>
        ))}

        <line x1={padLeft} x2={padLeft + plotW} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--axis)" />
        <text x={padLeft + plotW / 2} y={height - 8} fontSize={11.5} fill="var(--text-secondary)" textAnchor="middle">
          Estimated effort (lower is cheaper) · bubble size = items batchable at the same applicant · quadrants split on the medians · value axis is √-scaled
        </text>
      </svg>
      {tip.node}
    </>
  );
}

/* --------------------------------------------------------------- dumbbell */

/**
 * Indicator 4: the gap between the period-of-performance end date and the
 * completion date the applicant reported. Line length is the extension needed.
 */
export function DumbbellChart({
  width,
  rows,
  asOf,
  onSelect,
}: {
  width: number;
  rows: Array<{ id: string; label: string; sublabel: string; from: string; to: string; dollars: number }>;
  asOf: string;
  onSelect?: (id: string) => void;
}) {
  const tip = useTooltip();
  const labelWidth = 168;
  const padRight = 74;
  const rowH = 26;
  const height = rows.length * rowH + 40;
  const plotW = Math.max(80, width - labelWidth - padRight);

  const all = rows.flatMap((r) => [parse(r.from).getTime(), parse(r.to).getTime()]).concat(parse(asOf).getTime());
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const sx = (d: string) => labelWidth + ((parse(d).getTime() - min) / span) * plotW;

  const yearTicks: string[] = [];
  const startYear = new Date(min).getUTCFullYear();
  const endYear = new Date(max).getUTCFullYear();
  for (let y = startYear; y <= endYear + 1; y += 1) {
    const jan = `${y}-01-01`;
    if (parse(jan).getTime() >= min && parse(jan).getTime() <= max) yearTicks.push(jan);
  }

  return (
    <>
      <svg width={width} height={height} role="img">
        {yearTicks.map((t) => (
          <Fragment key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={0} y2={rows.length * rowH} stroke="var(--grid)" />
            <text x={sx(t)} y={rows.length * rowH + 16} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="middle">
              {t.slice(0, 4)}
            </text>
          </Fragment>
        ))}
        <line x1={sx(asOf)} x2={sx(asOf)} y1={0} y2={rows.length * rowH} stroke="var(--text-primary)" strokeWidth={2} />
        <text x={sx(asOf)} y={rows.length * rowH + 31} fontSize={11} fill="var(--text-primary)" textAnchor="middle" fontWeight={650}>
          today
        </text>

        {rows.map((r, i) => {
          const y = i * rowH + rowH / 2;
          const x1 = sx(r.from);
          const x2 = sx(r.to);
          const gap = daysBetween(r.from, r.to);
          return (
            <Fragment key={r.id}>
              <text x={labelWidth - 10} y={y + 4} fontSize={12} fill="var(--text-secondary)" textAnchor="end">
                {r.label}
              </text>
              <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--seq-250)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={x1} cy={y} r={4.5} fill="var(--seq-550)" stroke="var(--surface-1)" strokeWidth={2} />
              <circle cx={x2} cy={y} r={4.5} fill="var(--series-2)" stroke="var(--surface-1)" strokeWidth={2} />
              <rect
                x={labelWidth}
                y={i * rowH}
                width={plotW + padRight}
                height={rowH}
                fill="transparent"
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  tip.show(e.clientX - box.left, e.clientY - box.top, {
                    title: `${r.label} — ${r.sublabel}`,
                    lines: [
                      `PoP ends ${formatDate(r.from)}`,
                      `Projected completion ${formatDate(r.to)}`,
                      `${gap} days short · ${money(r.dollars)}`,
                    ],
                  });
                }}
                onMouseLeave={tip.hide}
                onClick={() => onSelect?.(r.id)}
              />
              <text x={Math.max(x1, x2) + 8} y={y + 4} fontSize={11.5} fill="var(--text-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {`+${Math.ceil(gap / 30)}mo`}
              </text>
            </Fragment>
          );
        })}
      </svg>
      {tip.node}
    </>
  );
}

/* ------------------------------------------------------------ cliff chart */

/**
 * Indicator 11 as a staffing view: how many closeout deadlines land in each of
 * the next 26 weeks, cumulatively. The wave is visible a month before it hits.
 */
export function CliffChart({
  width,
  weeks,
  metric,
}: {
  width: number;
  weeks: Array<{ weekStart: string; crossingCount: number; crossingDollars: number; cumulativeCount: number; cumulativeDollars: number }>;
  metric: 'count' | 'dollars';
}) {
  const tip = useTooltip();
  const padLeft = 54;
  const padRight = 14;
  const padTop = 14;
  const plotH = 190;
  const labelBand = 30;
  const height = padTop + plotH + labelBand;
  const plotW = Math.max(60, width - padLeft - padRight);

  const values = weeks.map((w) => (metric === 'count' ? w.cumulativeCount : w.cumulativeDollars));
  const ticks = niceTicks(Math.max(1, ...values), 4);
  const top = ticks[ticks.length - 1];
  const fmt = metric === 'count' ? fmtCount : money;
  const slot = plotW / Math.max(weeks.length, 1);
  const sy = (v: number) => padTop + plotH - (v / top) * plotH;

  // Step path — a deadline lands on a date, it doesn't accrue continuously.
  let d = `M${padLeft},${sy(0)}`;
  weeks.forEach((w, i) => {
    const x0 = padLeft + i * slot;
    const x1 = padLeft + (i + 1) * slot;
    const y = sy(metric === 'count' ? w.cumulativeCount : w.cumulativeDollars);
    d += ` L${x0},${y} L${x1},${y}`;
  });
  const area = `${d} L${padLeft + weeks.length * slot},${sy(0)} Z`;

  return (
    <>
      <svg width={width} height={height} role="img">
        {ticks.map((t) => (
          <Fragment key={t}>
            <line x1={padLeft} x2={padLeft + plotW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={padLeft - 8} y={sy(t) + 4} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(t)}
            </text>
          </Fragment>
        ))}
        <path d={area} fill="var(--series-1)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

        {weeks.map((w, i) => (
          <rect
            key={w.weekStart}
            x={padLeft + i * slot}
            y={padTop}
            width={slot}
            height={plotH}
            fill="transparent"
            onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              tip.show(e.clientX - box.left, e.clientY - box.top, {
                title: `Week of ${formatDate(w.weekStart)}`,
                lines: [
                  `${w.crossingCount} deadlines land this week (${money(w.crossingDollars)})`,
                  `${w.cumulativeCount} cumulative (${money(w.cumulativeDollars)})`,
                ],
              });
            }}
            onMouseLeave={tip.hide}
          />
        ))}

        <line x1={padLeft} x2={padLeft + plotW} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--axis)" />
        <text x={padLeft} y={height - 9} fontSize={AXIS_FONT} fill="var(--text-muted)">
          this week
        </text>
        <text x={padLeft + plotW} y={height - 9} fontSize={AXIS_FONT} fill="var(--text-muted)" textAnchor="end">
          {`+26 weeks (${formatDate(weeks[weeks.length - 1]?.weekStart ?? '')})`}
        </text>
      </svg>
      {tip.node}
    </>
  );
}
