"use client";

import { useEffect, useRef, useState } from "react";

type Quote = { midMarket: number; rate: number; inrCents: number; validTo: number };
type Point = { t: number; v: number };
type Data = { quote: Quote | null; history: Point[]; at: number };

const POLL_MS = 30_000;
const inr = (v: number, digits = 4) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const inrWhole = (cents: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(cents / 100);
const when = (t: number) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Xflow's live mid-market USD→INR rate, the rate you get, and what your available USD is worth.
 * Refreshes every 30 seconds while visible; the chart is built from rates saved while Billing is open.
 */
export function LiveRateCard({ availableCents, compact = false }: { availableCents: number; compact?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/admin/billing/rate", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as Data;
        if (!stopped) {
          setData(d);
          setFailed(!d.quote);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const q = data?.quote;
  const markup = q && q.midMarket ? ((q.midMarket - q.rate) / q.midMarket) * 100 : 0;
  const first = data?.history[0]?.v;
  const change = q && first ? q.midMarket - first : null;

  return (
    <div className="card relative overflow-hidden p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-h3">USD → INR, live</h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-wider text-muted uppercase">
          <span className={`h-1.5 w-1.5 rounded-full ${q ? "status-dot" : "bg-muted"}`} aria-hidden="true" />
          {q && data ? `Xflow · ${new Date(data.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })}` : failed ? "Unavailable" : "Loading"}
        </span>
      </div>

      {!q ? (
        <p className="mt-4 text-sm text-muted">{failed ? "Xflow's live rate isn't available right now. It'll try again in 30 seconds." : "Fetching Xflow's live rate…"}</p>
      ) : (
        <div className={`mt-5 grid gap-6 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"}`}>
          <div className="min-w-0">
            <p className="text-sm text-muted">Mid-market rate</p>
            <p className="mt-1 text-[clamp(2rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.03em] tabular-nums">{inr(q.midMarket)}</p>
            {change !== null && data && data.history.length > 1 && (
              <p className={`mt-2 text-xs ${change > 0 ? "text-[#4ade80]" : change < 0 ? "text-[#ff9b8f]" : "text-muted"}`}>
                {change === 0 ? "No change" : `${change > 0 ? "▲" : "▼"} ${inr(Math.abs(change))}`} since {when(data.history[0].t)}
              </p>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Your rate from Xflow</dt>
                <dd className="mt-0.5 font-mono tabular-nums">{inr(q.rate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Markup</dt>
                <dd className="mt-0.5 font-mono tabular-nums">{markup <= 0.0001 ? "None" : `${markup.toFixed(2)}%`}</dd>
              </div>
              {availableCents > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Your available ${(availableCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} is worth</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{inrWhole(Math.round(availableCents * q.rate))}</dd>
                </div>
              )}
            </dl>
          </div>
          {!compact && <RateChart points={data?.history ?? []} />}
        </div>
      )}
    </div>
  );
}

/** Mid-market rate over the last 30 days: one lime line, hairline grid, hover for the exact value. */
function RateChart({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
        The rate chart builds up from now: a reading is saved every 10 minutes while Billing is open.
      </div>
    );

  const W = 600;
  const H = 180;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 0.01;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const h = hover !== null ? points[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const tx = t0 + ((((e.clientX - box.left) / box.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - tx) < Math.abs(points[best].t - tx)) best = i;
    setHover(best);
  };

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>Mid-market, last 30 days</span>
        <span className="font-mono tabular-nums">
          {inr(lo, 2)} – {inr(hi, 2)}
        </span>
      </figcaption>
      <div className="relative mt-2">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`Mid-market USD to INR rate from ${when(t0)} to ${when(t1)}, between ${inr(lo, 2)} and ${inr(hi, 2)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--color-line)" strokeWidth="1" />
          ))}
          <path d={d} fill="none" stroke="var(--color-lime)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {h && (
            <>
              <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={x(h.t)} cy={y(h.v)} r="4.5" fill="var(--color-lime)" stroke="var(--color-surface)" strokeWidth="2" />
            </>
          )}
          <text x={PAD.l} y={H - 6} fontSize="11" fill="var(--color-muted)">
            {when(t0)}
          </text>
          <text x={W - PAD.r} y={H - 6} fontSize="11" fill="var(--color-muted)" textAnchor="end">
            {when(t1)}
          </text>
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute -top-2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${(x(h.t) / W) * 100}%`, transform: `translateX(${x(h.t) / W > 0.6 ? "-100%" : "0"})` }}
          >
            <span className="font-mono tabular-nums text-fg">{inr(h.v)}</span>
            <span className="ml-2 text-muted">{when(h.t)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
