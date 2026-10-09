import Link from "next/link";
import { inr, loadDashboard, usd, type Range } from "@/lib/billing";
import { BarList, MonthlyColumns, StatusBar } from "./charts";
import { StatePill } from "./StatePill";

const RANGES: { key: Range; label: string }[] = [
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

const date = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Tile({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: "up" | "down" | "warn" }) {
  const tone = subTone === "up" ? "text-[#4ade80]" : subTone === "down" ? "text-[#ff9b8f]" : subTone === "warn" ? "text-[#fab219]" : "text-muted";
  return (
    <div className="card p-5 md:p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-[clamp(1.5rem,2.4vw,2rem)] leading-none font-semibold tracking-[-0.02em]">{value}</p>
      {sub && <p className={`mt-2 text-xs ${tone}`}>{sub}</p>}
    </div>
  );
}

export default async function BillingOverview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range: Range = RANGES.some((x) => x.key === r) ? (r as Range) : "12m";

  let d: Awaited<ReturnType<typeof loadDashboard>>;
  try {
    d = await loadDashboard(range);
  } catch (err) {
    return (
      <div className="card p-8">
        <h2 className="t-h3">Couldn&apos;t reach Xflow</h2>
        <p className="mt-3 break-words text-fg/80">{err instanceof Error ? err.message : String(err)}</p>
        <p className="mt-3 text-sm text-muted">Check that XFLOW_API_KEY is correct, then press Refresh.</p>
      </div>
    );
  }

  const t = d.totals;
  const delta = t.lastMonth > 0 ? Math.round(((t.thisMonth - t.lastMonth) / t.lastMonth) * 100) : null;
  const rangeLabel = RANGES.find((x) => x.key === range)!.label.toLowerCase();
  const attention = d.invoices.filter((x) => ["overdue", "action", "ready"].includes(x.state.key)).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* range filter: one row, scopes everything below */}
      <nav aria-label="Time range" className="flex flex-wrap gap-2">
        {RANGES.map((x) => (
          <Link
            key={x.key}
            href={x.key === "12m" ? "/admin/billing" : `/admin/billing?range=${x.key}`}
            aria-current={x.key === range ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${x.key === range ? "border-lime bg-lime text-ink" : "border-line-strong text-fg/85 hover:border-fg"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {/* hero figure */}
      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-lime/10 blur-3xl" aria-hidden="true" />
        <p className="text-sm text-muted">Total received through Xflow, all time</p>
        <p className="mt-3 text-[clamp(2.75rem,6vw,4.5rem)] leading-none font-semibold tracking-[-0.035em]">{usd(t.receivedAll)}</p>
        <p className="mt-3 text-fg/75">
          {d.rate ? (
            <>
              ≈ {inr(Math.round(t.receivedAll * d.rate))} at today&apos;s rate of {inr(Math.round(d.rate * 100))} per $1
            </>
          ) : (
            "Live exchange rate unavailable right now"
          )}
          <span className="text-muted"> · {d.partnersCount} client{d.partnersCount === 1 ? "" : "s"}</span>
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Received this month"
          value={usd(t.thisMonth)}
          sub={delta === null ? "No payments last month to compare" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs last month (${usd(t.lastMonth)})`}
          subTone={delta === null ? undefined : delta >= 0 ? "up" : "down"}
        />
        <Tile
          label="Outstanding on invoices"
          value={usd(t.outstanding)}
          sub={t.overdueCount ? `${t.overdueCount} overdue · ${usd(t.overdueCents)}` : "Nothing overdue"}
          subTone={t.overdueCount ? "warn" : undefined}
        />
        <Tile label="Waiting in Xflow" value={usd(t.waitingUsd)} sub="Received, not yet sent to your bank" />
        <Tile label={`Paid out to your bank, ${rangeLabel}`} value={inr(t.paidOutRange)} sub={t.onTheWayInr ? `${inr(t.onTheWayInr)} on the way now` : `${inr(t.paidOutAll)} all time`} />
      </div>

      {/* received per month */}
      <div className="card p-5 md:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-h3">Money received per month</h2>
          <p className="text-sm text-muted">
            {usd(t.receivedRange)} {rangeLabel} · USD
          </p>
        </div>
        <div className="mt-6">
          <MonthlyColumns title="Money received per month, USD" currency="USD" data={d.monthly.map((m) => ({ label: m.label, value: m.received }))} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 md:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-h3">Paid out to your bank</h2>
            <p className="text-sm text-muted">INR</p>
          </div>
          <div className="mt-6">
            <MonthlyColumns title="Payouts to bank per month, INR" currency="INR" height={210} data={d.monthly.map((m) => ({ label: m.label, value: m.paidOut }))} />
          </div>
        </div>
        <div className="card p-5 md:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-h3">Top clients</h2>
            <p className="text-sm text-muted">Received, {rangeLabel}</p>
          </div>
          <div className="mt-6">
            <BarList title="Received per client, USD" currency="USD" rows={d.byClient.map((c) => ({ label: c.label, value: c.value }))} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-5 md:p-7 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="t-h3">Invoices</h2>
            <Link href="/admin/billing/invoices" className="text-sm text-muted hover:text-fg">
              All invoices →
            </Link>
          </div>
          <div className="mt-6">
            <StatusBar
              segments={[
                { label: "Paid", value: d.statusCounts.paid, tone: "good" },
                { label: "Awaiting", value: d.statusCounts.awaiting, tone: "warning" },
                { label: "Overdue", value: d.statusCounts.overdue, tone: "critical" },
              ]}
            />
          </div>
        </div>
        <div className="card p-5 md:p-7 lg:col-span-3">
          <h2 className="t-h3">Needs your attention</h2>
          {attention.length ? (
            <ul className="mt-4 divide-y divide-line">
              {attention.map(({ inv, state, dueCents }) => (
                <li key={inv.id}>
                  <Link href={`/admin/billing/invoices/${inv.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:text-lime">
                    <span className="font-mono text-sm">{inv.number}</span>
                    <span className="min-w-0 flex-1 truncate text-fg/80">{inv.clientName}</span>
                    <span className="text-sm tabular-nums">{usd(dueCents)}</span>
                    <StatePill state={state} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">All clear: no overdue invoices and nothing waiting to be withdrawn.</p>
          )}
        </div>
      </div>

      {/* recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 md:p-7">
          <h2 className="t-h3">Recent payments in</h2>
          {d.recentDeposits.length ? (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {d.recentDeposits.map((x) => (
                  <tr key={x.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{date(x.created)}</td>
                    <td className="py-2.5 pr-3 text-fg/85">{x.client}</td>
                    <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{usd(Math.round(Number(x.amount) * 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-muted">No payments received yet.</p>
          )}
        </div>
        <div className="card p-5 md:p-7">
          <h2 className="t-h3">Recent payouts to your bank</h2>
          {d.recentPayouts.length ? (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {d.recentPayouts.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{date(p.created)}</td>
                    <td className="py-2.5 pr-3 text-fg/85 capitalize">
                      {p.status === "settled" ? "Settled" : p.status}
                      {p.arrival_date && p.status !== "settled" ? <span className="text-muted"> · arrives {date(p.arrival_date)}</span> : null}
                    </td>
                    <td className="py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {p.currency === "INR" ? inr(Math.round(Number(p.amount) * 100)) : usd(Math.round(Number(p.amount) * 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-muted">No payouts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
