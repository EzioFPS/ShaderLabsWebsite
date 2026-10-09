import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { loadDashboard, usd } from "@/lib/billing";
import { StatePill } from "../StatePill";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "draft", label: "Drafts" },
] as const;

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin("/admin/billing");
  const { show = "all" } = await searchParams;
  let rows: Awaited<ReturnType<typeof loadDashboard>>["invoices"] = [];
  let error: string | null = null;
  try {
    rows = (await loadDashboard("12m")).invoices;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const match = (key: string) =>
    show === "all" ||
    (show === "open" && ["awaiting", "partial", "review", "ready", "action", "overdue"].includes(key)) ||
    (show === "overdue" && (key === "overdue" || key === "action")) ||
    (show === "paid" && (key === "paid" || key === "fee")) ||
    (show === "draft" && key === "draft");
  const list = rows.filter((x) => match(x.state.key));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter invoices" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/billing/invoices" : `/admin/billing/invoices?show=${f.key}`}
              aria-current={show === f.key ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${show === f.key ? "border-lime bg-lime text-ink" : "border-line-strong text-fg/85 hover:border-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <Link href="/admin/billing/invoices/new" className="btn btn-primary btn-sm h-10">
          New invoice
        </Link>
      </div>

      {error && <p className="mt-6 rounded-md border border-[#d03b3b]/60 p-4 text-sm text-fg/85">Couldn&apos;t load payment status from Xflow: {error}</p>}

      {list.length === 0 ? (
        <div className="card mt-6 p-10 text-center text-muted">
          {rows.length === 0 ? (
            <>
              No invoices yet.{" "}
              <Link href="/admin/billing/invoices/new" className="text-lime hover:underline">
                Create your first one
              </Link>
              .
            </>
          ) : (
            "No invoices match this filter."
          )}
        </div>
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wider text-muted uppercase">
                <th className="px-5 py-3 font-normal">Invoice</th>
                <th className="px-5 py-3 font-normal">Client</th>
                <th className="px-5 py-3 font-normal">Issued</th>
                <th className="px-5 py-3 font-normal">Due</th>
                <th className="px-5 py-3 text-right font-normal">Amount</th>
                <th className="px-5 py-3 text-right font-normal">Still due</th>
                <th className="px-5 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ inv, state, dueCents }) => (
                <tr key={inv.id} className="border-t border-line transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/billing/invoices/${inv.id}`} className="font-mono text-fg hover:text-lime">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-fg/85">{inv.clientName}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-muted">{day(inv.issueDate)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-muted">{day(inv.dueDate)}</td>
                  <td className="px-5 py-3.5 text-right font-medium whitespace-nowrap tabular-nums">{usd(inv.totalCents)}</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap tabular-nums text-fg/80">{state.key === "cancelled" ? "—" : usd(dueCents)}</td>
                  <td className="px-5 py-3.5">
                    <StatePill state={state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
