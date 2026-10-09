"use client";

import { useEffect, useRef, useState } from "react";

// Billing charts, drawn as SVG in the site's palette: one lime series on the dark surface,
// hairline grid, ≤24px columns with 4px rounded tops, hover/focus tooltips, and a table view.

const ACCENT = "#c6ff3d";
const GRID = "rgba(237,237,232,0.10)";
const AXIS = "rgba(237,237,232,0.22)";
const MUTED = "#8c8c85";

type Point = { label: string; value: number };
type Currency = "USD" | "INR";

// Values are in cents/paise.
const fmt = (c: Currency, v: number) =>
  new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, maximumFractionDigits: c === "INR" ? 0 : 2 }).format(v / 100);
const fmtCompact = (c: Currency, v: number) =>
  new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, notation: "compact", maximumFractionDigits: 1 }).format(v / 100);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return { top: step * Math.ceil(max / step), step };
}

/** Column path with a 4px rounded top, square at the baseline. */
function column(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function TableView({ title, rows, currency }: { title: string; rows: Point[]; currency: Currency }) {
  const format = (v: number) => fmt(currency, v);
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted hover:text-fg">View as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <th scope="row" className="py-1.5 font-normal text-fg/75">
                {r.label}
              </th>
              <td className="py-1.5 text-right tabular-nums">{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function MonthlyColumns({ title, data, currency, height = 240 }: { title: string; data: Point[]; currency: Currency; height?: number }) {
  const format = (v: number) => fmt(currency, v);
  const compact = (v: number) => fmtCompact(currency, v);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 22, right: 4, bottom: 26, left: 52 };
  const W = Math.max(width, 280);
  const plotW = W - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const { top, step } = niceScale(max);
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.56);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = data.length > 12 ? Math.ceil(data.length / 12) : 1;
  const maxIdx = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const lastIdx = data.length - 1;
  const empty = max === 0;

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={height} role="img" aria-label={title} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
                <text x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={MUTED} className="tabular-nums">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.left + i * band + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const active = hover === i;
              const showValue = !empty && d.value > 0 && (i === maxIdx || i === lastIdx);
              return (
                <g key={d.label}>
                  {/* hit target: the whole band, taller than the bar */}
                  <rect
                    x={pad.left + i * band}
                    y={pad.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${d.label}: ${format(d.value)}`}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                  {h > 0 && <path d={column(x, y(d.value), barW, h)} fill={ACCENT} opacity={hover === null || active ? 1 : 0.45} pointerEvents="none" />}
                  {showValue && (
                    <text x={x + barW / 2} y={y(d.value) - 7} textAnchor="middle" fontSize="11" fill="#ededE8" pointerEvents="none" className="tabular-nums">
                      {compact(d.value)}
                    </text>
                  )}
                  {i % labelEvery === 0 && (
                    <text x={pad.left + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED} pointerEvents="none">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
            {empty && (
              <text x={pad.left + plotW / 2} y={pad.top + plotH / 2} textAnchor="middle" fontSize="13" fill={MUTED}>
                Nothing in this period yet
              </text>
            )}
          </svg>
        )}
        {hover !== null && data[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line-strong bg-ink px-3 py-2 shadow-lg"
            style={{ left: pad.left + hover * band + band / 2, top: Math.max(8, y(data[hover].value) - 10) }}
          >
            <p className="text-sm font-semibold whitespace-nowrap text-fg tabular-nums">{format(data[hover].value)}</p>
            <p className="text-xs whitespace-nowrap text-muted">{data[hover].label}</p>
          </div>
        )}
      </div>
      <TableView title={title} rows={data} currency={currency} />
    </div>
  );
}

/** Horizontal bars, value at the tip. One series, one colour. */
export function BarList({ title, rows, currency, empty = "No payments in this period yet" }: { title: string; rows: Point[]; currency: Currency; empty?: string }) {
  const format = (v: number) => fmt(currency, v);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted">{empty}</p>;
  return (
    <div>
      <ul className="space-y-4" aria-label={title}>
        {rows.map((r, i) => (
          <li key={r.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} className="outline-none">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg/85">{r.label}</span>
              <span className="flex-none font-medium text-fg tabular-nums">{format(r.value)}</span>
            </div>
            <div className="mt-1.5 h-2.5 w-full">
              <div
                className="h-full rounded-r-[4px] transition-opacity"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: ACCENT, opacity: hover === null || hover === i ? 1 : 0.45 }}
              />
            </div>
          </li>
        ))}
      </ul>
      <TableView title={title} rows={rows} currency={currency} />
    </div>
  );
}

const STATUS = {
  good: { color: "#0ca30c", icon: "M5 12.5l4.5 4.5L19 7.5" },
  warning: { color: "#fab219", icon: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" },
  critical: { color: "#d03b3b", icon: "M12 8v5m0 3.5v.5M12 3l9.5 17h-19L12 3z" },
} as const;

/** Part-to-whole of invoice states: one stacked bar with 2px gaps, legend with icon + label + count. */
export function StatusBar({ segments }: { segments: { label: string; value: number; tone: keyof typeof STATUS }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px]" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {total === 0 ? (
          <div className="h-full w-full rounded-[4px] bg-surface-2" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s, i, arr) => (
              <div
                key={s.label}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                title={`${s.label}: ${s.value}`}
                className={`h-full transition-opacity ${i === 0 ? "rounded-l-[4px]" : ""} ${i === arr.length - 1 ? "rounded-r-[4px]" : ""}`}
                style={{ flex: s.value, background: STATUS[s.tone].color, opacity: hover === null || hover === i ? 1 : 0.5 }}
              />
            ))
        )}
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke={STATUS[s.tone].color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={STATUS[s.tone].icon} />
            </svg>
            <span className="text-fg/80">{s.label}</span>
            <span className="ml-auto font-semibold text-fg tabular-nums sm:ml-1">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
