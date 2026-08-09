import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------- measuring */

export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(680);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 680);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/* -------------------------------------------------------------- tooltip */

export interface TipContent {
  title: string;
  lines: string[];
  sub?: string;
}

export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: TipContent } | null>(null);

  const show = useCallback((x: number, y: number, content: TipContent) => setTip({ x, y, content }), []);
  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div className="chart-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <strong>{tip.content.title}</strong>
      {tip.content.lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      {tip.content.sub ? <div className="tip-sub">{tip.content.sub}</div> : null}
    </div>
  ) : null;

  return { show, hide, node };
}

/* ---------------------------------------------------------- chart frame */

export interface TableSpec {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  note?: ReactNode;
  legend?: Array<{ label: string; color: string; shape?: 'square' | 'line' | 'dot' }>;
  table: TableSpec;
  children: (width: number) => ReactNode;
  /** Extra controls rendered next to the table toggle. */
  actions?: ReactNode;
}

/**
 * Every chart ships with a table twin. That is the accessibility contract —
 * three of the light-mode palette slots sit below 3:1 against the surface, so a
 * value must never be reachable by color alone.
 */
export function ChartFrame({ title, subtitle, note, legend, table, children, actions }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const { ref, width } = useMeasure<HTMLDivElement>();

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">{title}</h3>
        <div className="chart-actions">
          {actions}
          <button
            type="button"
            className="mini-btn"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            title="Show the underlying values as a table"
          >
            Table
          </button>
        </div>
      </div>
      {subtitle ? <p className="card-sub">{subtitle}</p> : null}

      {legend && legend.length > 1 && !asTable ? (
        <div className="legend">
          {legend.map((l) => (
            <span className="legend-item" key={l.label}>
              <span
                className="legend-swatch"
                style={{
                  background: l.color,
                  height: l.shape === 'line' ? 2 : 11,
                  borderRadius: l.shape === 'dot' ? '50%' : 3,
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="chart-frame" ref={ref}>
        {asTable ? (
          <div className="chart-table-wrap">
            <table>
              <thead>
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={i === 0 ? undefined : 'num'}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={j === 0 ? undefined : 'num'}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children(width)
        )}
      </div>

      {note ? <div className="card-note">{note}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- scaling */

/** Nice round tick values for an axis running 0..max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Bar with a rounded data-end and a square baseline end. */
export function barPath(x: number, y: number, w: number, h: number, r = 4, horizontal = true): string {
  if (horizontal) {
    const rr = Math.min(r, w / 2, h / 2);
    if (w <= 0.5) return '';
    return `M${x},${y} h${Math.max(0, w - rr)} a${rr},${rr} 0 0 1 ${rr},${rr} v${Math.max(0, h - 2 * rr)} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-Math.max(0, w - rr)} z`;
  }
  const rr = Math.min(r, w / 2, h / 2);
  if (h <= 0.5) return '';
  return `M${x},${y + h} v${-Math.max(0, h - rr)} a${rr},${rr} 0 0 1 ${rr},${-rr} h${Math.max(0, w - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},${rr} v${Math.max(0, h - rr)} z`;
}

/** Reads a CSS custom property so SVG marks follow the active theme. */
export function useToken(name: string): string {
  const [value, setValue] = useState('#000');
  useEffect(() => {
    const read = () => setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', read);
    };
  }, [name]);
  return value;
}

export const AXIS_FONT = 11;
