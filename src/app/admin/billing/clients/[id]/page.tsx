import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { addressLine2, clientTaxIds, depositClients, getDeposits, getPartners, getReceivables, partnerName, toCents, usd } from "@/lib/billing";
import { db } from "@/lib/db";
import { ClientEditForm } from "./ClientEditForm";

const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/billing");
  const { id } = await params;

  let error: string | null = null;
  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load(id);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  if (!error && !data) notFound();

  return (
    <div>
      <Link href="/admin/billing/clients" className="text-sm text-muted hover:text-fg">
        ← All clients
      </Link>
      {error || !data ? (
        <p className="card mt-6 p-6 text-sm break-words">Couldn&apos;t load this client from Xflow: {error}</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-[clamp(1.5rem,2.6vw,2.25rem)] leading-tight font-semibold tracking-[-0.02em]">{partnerName(data.client)}</h2>
              <p className="mt-1 text-sm text-muted">
                <span className={data.client.status === "activated" ? "text-lime" : "text-[#fab219]"}>{data.client.status.replace(/_/g, " ")}</span> · client since{" "}
                {day(data.client.created)}
              </p>
            </div>
            <p className="font-mono text-xs break-all text-muted">{data.client.id}</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <ClientEditForm id={data.client.id} values={data.values} />
            <div className="space-y-4">
              <div className="card p-5">
                <p className="text-sm text-muted">Paid in total</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{usd(data.paidCents)}</p>
              </div>
              <div className="card p-5">
                <p className="text-sm text-muted">Invoices</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{data.invoices.length}</p>
                {data.invoices.length > 0 && (
                  <ul className="mt-3 divide-y divide-line text-sm">
                    {data.invoices.slice(0, 8).map((inv) => (
                      <li key={inv.id}>
                        <Link href={`/admin/billing/invoices/${inv.id}`} className="flex justify-between gap-3 py-2 hover:text-lime">
                          <span className="truncate font-mono">{inv.number}</span>
                          <span className="tabular-nums">{usd(inv.totalCents)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/admin/billing/invoices/new" className="btn btn-ghost btn-sm mt-4 h-10">
                  New invoice
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function load(id: string) {
  const [partners, deposits, receivables, invoices, taxIds] = await Promise.all([
    getPartners(),
    getDeposits(),
    getReceivables(),
    db.invoice.findMany({ where: { clientAccountId: id }, orderBy: { issueDate: "desc" }, select: { id: true, number: true, totalCents: true } }),
    clientTaxIds(),
  ]);
  const client = partners.find((p) => p.id === id);
  if (!client) return null;
  const clientOf = depositClients(deposits, receivables, new Set(partners.map((p) => p.id)));
  const b = client.business_details ?? {};
  const a = b.physical_address ?? {};
  return {
    client,
    invoices,
    paidCents: deposits.filter((d) => clientOf.get(d.id) === id).reduce((s, d) => s + toCents(d.amount), 0),
    values: {
      nickname: client.nickname ?? "",
      name: b.legal_name ?? "",
      email: b.email ?? "",
      type: b.type ?? "company",
      line1: a.line1?.trim() ?? "",
      // A line 2 that just repeats line 1 shows as empty; saving then clears it in Xflow too.
      line2: addressLine2(a),
      city: a.city ?? "",
      state: a.state ?? "",
      postalCode: a.postal_code ?? "",
      country: a.country ?? "",
      taxId: taxIds.get(id) ?? "",
    },
  };
}
