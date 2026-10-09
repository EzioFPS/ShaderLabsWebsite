import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getDeposits, getReceivables, invoiceState, lineItems, PURPOSE_CODES, toCents, unmatchedFunds, usd } from "@/lib/billing";
import { db } from "@/lib/db";
import { xflowTestMode } from "@/lib/xflow";
import { StatePill } from "../../StatePill";
import { InvoiceActions } from "./InvoiceActions";

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/billing");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) notFound();

  let xflowError: string | null = null;
  let r: Awaited<ReturnType<typeof getReceivables>>[number] | undefined;
  let waitingCents = 0;
  if (inv.xflowReceivableId) {
    try {
      const [receivables, deposits] = await Promise.all([getReceivables(), getDeposits()]);
      r = receivables.find((x) => x.id === inv.xflowReceivableId);
      if (r) waitingCents = Math.min(toCents(r.amount_reconcilable), unmatchedFunds(r.account_id, deposits, receivables));
    } catch (err) {
      xflowError = err instanceof Error ? err.message : String(err);
    }
  }
  const state = invoiceState(inv, r, waitingCents);
  const paidCents = r ? toCents(r.amount_reconciled) : 0;
  const settledCents = r ? toCents(r.amount_settled_payouts) : 0;
  const items = lineItems(inv.items);
  const purpose = PURPOSE_CODES.find(([c]) => c === inv.purposeCode)?.[1];

  return (
    <div>
      <Link href="/admin/billing/invoices" className="text-sm text-muted hover:text-fg">
        ← All invoices
      </Link>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-[clamp(1.5rem,2.6vw,2.25rem)] leading-tight tracking-[-0.02em]">{inv.number}</h2>
            <StatePill state={state} />
            {inv.source === "xflow" && <span className="text-xs text-muted">Imported from Xflow</span>}
          </div>
          <p className="mt-2 text-fg/80">{inv.clientName}</p>
        </div>
        <p className="text-[clamp(2rem,4vw,3rem)] leading-none font-semibold tracking-[-0.03em]">{usd(inv.totalCents)}</p>
      </div>

      {xflowError && <p className="mt-6 rounded-md border border-[#d03b3b]/60 p-4 text-sm break-words">Couldn&apos;t load the payment status from Xflow: {xflowError}</p>}
      {r?.system_message?.length ? (
        <div className="mt-6 rounded-md border border-[#fab219]/50 bg-[#fab219]/5 p-4 text-sm">
          <p className="font-semibold text-[#fab219]">Message from Xflow</p>
          <ul className="mt-1 list-disc pl-5 text-fg/85">
            {r.system_message.map((m, i) => (
              <li key={i}>{m.message ?? JSON.stringify(m)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {/* money summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Paid against invoice", usd(paidCents)],
              ["Received, waiting", usd(waitingCents)],
              // A paid invoice can settle a little under its total: the bank's SWIFT fee, not money owed.
              state.key === "fee"
                ? ["Bank fee (SWIFT)", usd(Math.max(0, inv.totalCents - paidCents))]
                : ["Still due", usd(state.key === "paid" ? 0 : Math.max(0, inv.totalCents - paidCents))],
            ].map(([k, v]) => (
              <div key={k} className="card p-5">
                <p className="text-sm text-muted">{k}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{v}</p>
              </div>
            ))}
          </div>
          {settledCents > 0 && <p className="text-sm text-muted">{usd(settledCents)} of this has already reached your bank.</p>}

          {/* invoice body */}
          <div className="card p-5 md:p-7">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Issued", day(inv.issueDate)],
                ["Due", day(inv.dueDate)],
                ["Purpose code", `${inv.purposeCode}${purpose ? ` · ${purpose}` : ""}`],
                ["Xflow status", r?.status ? r.status.replace(/_/g, " ") : inv.xflowReceivableId ? "—" : "Not registered yet"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs tracking-wider text-muted uppercase">{k}</dt>
                  <dd className="mt-1 break-words">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
              <div>
                <p className="text-xs tracking-wider text-muted uppercase">Bill to</p>
                <p className="mt-1 font-semibold">{inv.clientName}</p>
                {inv.clientAddress && <p className="text-sm text-fg/75">{inv.clientAddress}</p>}
                {inv.clientEmail && <p className="text-sm text-fg/75">{inv.clientEmail}</p>}
              </div>
              {inv.notes && (
                <div>
                  <p className="text-xs tracking-wider text-muted uppercase">Notes</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-fg/85">{inv.notes}</p>
                </div>
              )}
            </div>

            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
                  <th className="py-2 font-normal">Description</th>
                  <th className="py-2 text-right font-normal">Qty</th>
                  <th className="py-2 text-right font-normal">Rate</th>
                  <th className="py-2 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-3 pr-4 whitespace-pre-wrap">{it.description}</td>
                    <td className="py-3 text-right tabular-nums">{it.quantity}</td>
                    <td className="py-3 text-right tabular-nums">{usd(it.unitCents)}</td>
                    <td className="py-3 text-right font-medium tabular-nums">{usd(Math.round(it.unitCents * it.quantity))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-4 text-right text-muted">
                    Total
                  </td>
                  <td className="pt-4 text-right text-lg font-semibold tabular-nums">{usd(inv.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <InvoiceActions
          id={inv.id}
          registered={Boolean(inv.xflowReceivableId)}
          cancelled={state.key === "cancelled"}
          imported={inv.source === "xflow"}
          paymentLinkUrl={inv.paymentLinkUrl}
          clientEmail={inv.clientEmail}
          sentTo={inv.sentTo}
          sentAt={inv.sentAt?.toISOString() ?? null}
          waitingCents={waitingCents}
          testMode={xflowTestMode()}
          fullyPaid={state.key === "paid"}
          paidCents={paidCents}
          bankFeeCents={state.key === "fee" ? Math.max(0, inv.totalCents - paidCents) : 0}
        />
      </div>
    </div>
  );
}
