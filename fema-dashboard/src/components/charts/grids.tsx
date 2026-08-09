import { Fragment } from 'react';
import { useTooltip } from './primitives';
import { money } from '../../lib/format';
import type { Criterion, ReadinessItem } from '../../lib/indicators/readiness';

/* ------------------------------------------------- status-agreement matrix */

/**
 * Indicator 1's primary view. The diagonal is agreement (deliberately recessive);
 * every off-diagonal cell is a distinct KIND of exception with its own fix, which
 * a single "27 mismatches" count would hide.
 */
export function AgreementMatrix({
  width,
  rowLabels,
  colLabels,
  cells,
  metric,
  onSelect,
}: {
  width: number;
  rowLabels: readonly string[];
  colLabels: readonly string[];
  cells: Array<{ internal: string; sor: string; aligned: boolean; count: number; dollars: number }>;
  metric: 'count' | 'dollars';
  onSelect?: (internal: string, sor: string) => void;
}) {
  const tip = useTooltip();
  const labelW = 118;
  const headerH = 46;
  const cellW = Math.max(72, Math.min(220, (width - labelW - 8) / colLabels.length));
  const cellH = 48;
  const gridW = cellW * colLabels.length;
  const height = headerH + rowLabels.length * cellH + 34;

  const values = cells.filter((c) => !c.aligned).map((c) => (metric === 'count' ? c.count : c.dollars));
  const max = Math.max(1, ...values);

  // Sequential single-hue ramp; aligned cells sit in neutral so the eye goes to
  // the disagreements.
  const rampSteps = ['var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-450)', 'var(--seq-550)'];
  const stepFor = (v: number) => {
    if (v <= 0) return -1;
    const r = v / max;
    return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : r > 0.08 ? 1 : 0;
  };

  return (
    <>
      <svg width={width} height={height} role="img">
        {colLabels.map((c, ci) => (
          <text
            key={c}
            x={labelW + ci * cellW + cellW / 2}
            y={headerH - 12}
            fontSize={11.5}
            fill="var(--text-secondary)"
            textAnchor="middle"
            fontWeight={600}
          >
            {c}
          </text>
        ))}
        <text x={labelW + gridW / 2} y={14} fontSize={11} fill="var(--text-muted)" textAnchor="middle">
          Client system of record →
        </text>

        {rowLabels.map((r, ri) => (
          <Fragment key={r}>
            <text x={labelW - 10} y={headerH + ri * cellH + cellH / 2 + 4} fontSize={11.5} fill="var(--text-secondary)" textAnchor="end" fontWeight={600}>
              {r}
            </text>
            {colLabels.map((c, ci) => {
              const cell = cells.find((x) => x.internal === r && x.sor === c);
              const v = cell ? (metric === 'count' ? cell.count : cell.dollars) : 0;
              const aligned = r === c;
              const step = stepFor(v);
              const fill = aligned ? 'var(--surface-2)' : step < 0 ? 'var(--surface-2)' : rampSteps[step];
              const textFill = !aligned && step >= 3 ? '#ffffff' : 'var(--text-primary)';
              const x = labelW + ci * cellW;
              const y = headerH + ri * cellH;
              return (
                <g
                  key={c}
                  className="matrix-cell"
                  tabIndex={cell && !aligned && cell.count > 0 ? 0 : -1}
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    tip.show(e.clientX - box.left, e.clientY - box.top, {
                      title: `Internal: ${r} · SoR: ${c}`,
                      lines: [`${cell?.count ?? 0} RFIs`, money(cell?.dollars ?? 0)],
                      sub: aligned ? 'Aligned — no action' : 'Exception — click to open the queue',
                    });
                  }}
                  onMouseLeave={tip.hide}
                  onClick={() => (!aligned && cell?.count ? onSelect?.(r, c) : undefined)}
                >
                  {/* 2px surface gap does the separating — no borders on marks */}
                  <rect x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2} rx={5} fill={fill} />
                  <text
                    x={x + cellW / 2}
                    y={y + cellH / 2 + 1}
                    fontSize={14}
                    fontWeight={650}
                    fill={aligned ? 'var(--text-muted)' : textFill}
                    textAnchor="middle"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {metric === 'count' ? (cell?.count ?? 0) : money(cell?.dollars ?? 0)}
                  </text>
                  {!aligned && (cell?.count ?? 0) > 0 ? (
                    <text x={x + cellW / 2} y={y + cellH / 2 + 15} fontSize={10} fill={textFill} textAnchor="middle" opacity={0.85}>
                      {metric === 'count' ? money(cell?.dollars ?? 0) : `${cell?.count ?? 0} RFIs`}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </Fragment>
        ))}

        <text x={labelW} y={height - 10} fontSize={11} fill="var(--text-muted)">
          Diagonal = the two systems agree. Everything off it is an exception.
        </text>
        <text x={4} y={headerH + (rowLabels.length * cellH) / 2} fontSize={11} fill="var(--text-muted)" textAnchor="middle" transform={`rotate(-90 10 ${headerH + (rowLabels.length * cellH) / 2})`}>
          Internal tracker ↓
        </text>
      </svg>
      {tip.node}
    </>
  );
}

/* ---------------------------------------------------------- readiness grid */

/**
 * Indicators 6/7/8. Rows sorted by distance-to-done, so the top of the matrix is
 * always the work that is closest to finishing. Cells carry a glyph as well as a
 * color — status is never encoded by hue alone.
 */
export function ReadinessMatrix({
  width,
  criteria,
  items,
  maxRows = 18,
  showApplicant = true,
  onSelect,
}: {
  width: number;
  criteria: Criterion[];
  items: ReadinessItem[];
  maxRows?: number;
  showApplicant?: boolean;
  onSelect?: (id: string) => void;
}) {
  const tip = useTooltip();
  const labelW = Math.min(300, Math.max(190, width * 0.3));
  const dollarsW = 78;
  const headerH = 52;
  const rowH = 27;
  const gridW = Math.max(120, width - labelW - dollarsW - 6);
  const cellW = gridW / criteria.length;
  const shown = [...items].sort((a, b) => a.unmet.length - b.unmet.length || b.dollars - a.dollars).slice(0, maxRows);
  const height = headerH + shown.length * rowH + 24;
  const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  return (
    <>
      <svg width={width} height={height} role="img">
        {criteria.map((c, ci) => (
          <text
            key={c.key}
            x={labelW + ci * cellW + cellW / 2}
            y={headerH - 10}
            fontSize={10.5}
            fill="var(--text-secondary)"
            textAnchor="middle"
            fontWeight={600}
          >
            {c.short}
          </text>
        ))}
        <text x={labelW + gridW + dollarsW - 4} y={headerH - 10} fontSize={10.5} fill="var(--text-secondary)" textAnchor="end" fontWeight={600}>
          Unlocks
        </text>

        {shown.map((it, ri) => {
          const y = headerH + ri * rowH;
          return (
            <Fragment key={it.id}>
              <text
                x={4}
                y={y + rowH / 2 + 4}
                fontSize={12}
                fill={it.ready ? 'var(--text-primary)' : 'var(--text-secondary)'}
                fontWeight={it.ready ? 650 : 400}
              >
                {truncate(it.entity, showApplicant ? 11 : 26)}
              </text>
              {showApplicant ? (
                <text x={86} y={y + rowH / 2 + 4} fontSize={11} fill="var(--text-muted)">
                  {truncate(it.applicantName, Math.max(8, Math.floor((labelW - 86 - 78) / 6.8)))}
                </text>
              ) : null}
              <text x={labelW - 8} y={y + rowH / 2 + 4} fontSize={11} fill="var(--text-muted)" textAnchor="end">
                {it.ready ? 'ready' : `${it.unmet.length} blocking`}
              </text>

              {criteria.map((c, ci) => {
                const state = it.met[c.key];
                const x = labelW + ci * cellW;
                const fill = state === null ? 'var(--surface-2)' : state ? 'var(--status-good)' : 'var(--status-critical)';
                const glyph = state === null ? '–' : state ? '✓' : '✕';
                return (
                  <g
                    key={c.key}
                    className="matrix-cell"
                    onMouseMove={(e) => {
                      const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      tip.show(e.clientX - box.left, e.clientY - box.top, {
                        title: `${it.entity} — ${c.label}`,
                        lines: [state === null ? 'Not applicable' : state ? 'Met' : 'Blocking'],
                        sub: it.applicantName,
                      });
                    }}
                    onMouseLeave={tip.hide}
                    onClick={() => onSelect?.(it.id)}
                  >
                    <rect x={x + 1} y={y + 2} width={cellW - 2} height={rowH - 4} rx={4} fill={fill} fillOpacity={state === false ? 0.16 : state ? 0.13 : 1} />
                    <text
                      x={x + cellW / 2}
                      y={y + rowH / 2 + 4}
                      fontSize={12}
                      fontWeight={700}
                      textAnchor="middle"
                      fill={state === null ? 'var(--text-muted)' : state ? 'var(--status-good-text)' : 'var(--status-critical)'}
                    >
                      {glyph}
                    </text>
                  </g>
                );
              })}

              <text
                x={labelW + gridW + dollarsW - 4}
                y={y + rowH / 2 + 4}
                fontSize={11.5}
                fill="var(--text-secondary)"
                textAnchor="end"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {money(it.dollars)}
              </text>
            </Fragment>
          );
        })}

        <text x={4} y={height - 6} fontSize={11} fill="var(--text-muted)">
          {`Showing ${shown.length} of ${items.length} in this view. ✓ met · ✕ blocking · – not applicable`}
        </text>
      </svg>
      {tip.node}
    </>
  );
}
