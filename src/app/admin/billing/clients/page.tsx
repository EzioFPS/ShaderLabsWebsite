import { getDeposits, getPartners, partnerName, toCents, usd } from "@/lib/billing";
import { db } from "@/lib/db";
import { ClientForm } from "./ClientForm";

export default async function ClientsPage() {
  let error: string | null = null;
  let rows: { id: string; name: string; email?: string; country?: string; status: string; paid: number; invoices: number }[] = [];
  try {
    const [partners, deposits, counts] = await Promise.all([
      getPartners(),
      getDeposits(),
      db.invoice.groupBy({ by: ["clientAccountId"], _count: { _all: true } }),
    ]);
    rows = partners
      .map((p) => ({
        id: p.id,
        name: partnerName(p),
        email: p.business_details?.email,
        country: p.business_details?.physical_address?.country,
        status: p.status,
        paid: deposits
          .filter((d) => d.status === "completed" && d.currency === "USD" && (d.to?.account_id === p.id || d.from?.account_id === p.id))
          .reduce((s, d) => s + toCents(d.amount), 0),
        invoices: counts.find((c) => c.clientAccountId === p.id)?._count._all ?? 0,
      }))
      .sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="card overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm break-words">Couldn&apos;t load clients from Xflow: {error}</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-muted">No clients in Xflow yet. Add your first one.</p>
        ) : (
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wider text-muted uppercase">
                <th className="px-5 py-3 font-normal">Client</th>
                <th className="px-5 py-3 font-normal">Country</th>
                <th className="px-5 py-3 text-right font-normal">Invoices</th>
                <th className="px-5 py-3 text-right font-normal">Paid in total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-5 py-3.5">
                    <p className="text-fg">{c.name}</p>
                    {c.email && <p className="text-xs text-muted">{c.email}</p>}
                    {c.status !== "activated" && <p className="text-xs text-[#fab219] capitalize">{c.status.replace(/_/g, " ")}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-muted">{c.country ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{c.invoices}</td>
                  <td className="px-5 py-3.5 text-right font-medium tabular-nums">{usd(c.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ClientForm />
    </div>
  );
}
