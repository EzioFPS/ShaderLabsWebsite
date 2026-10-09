"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createInvoiceAction, type ActionResult } from "../../actions";

type Client = { id: string; name: string; email?: string; taxId?: string };
type Row = { description: string; quantity: string; price: string };

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const cents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary h-11" disabled={pending}>
      {pending ? "Creating…" : "Create invoice"}
    </button>
  );
}

export function InvoiceForm({
  clients,
  purposeCodes,
  defaultPurpose,
  issueDate,
  dueDate,
  nextNumber,
}: {
  clients: Client[];
  purposeCodes: [string, string][];
  defaultPurpose: string;
  issueDate: string;
  dueDate: string;
  nextNumber: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createInvoiceAction, {});
  const [rows, setRows] = useState<Row[]>([{ description: "", quantity: "1", price: "" }]);
  const [taxId, setTaxId] = useState(""); // filled from the chosen client's saved tax ID, still editable
  const items = rows.map((r) => ({ description: r.description, quantity: Number(r.quantity) || 0, unitCents: cents(r.price) }));
  const total = items.reduce((s, i) => s + Math.round(i.unitCents * i.quantity), 0);
  const set = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className="card space-y-6 p-5 md:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-h3">New invoice</h2>
          <p className="font-mono text-sm text-muted">Will be {nextNumber}</p>
        </div>

        <div>
          <label htmlFor="client" className="text-sm text-muted">
            Client
          </label>
          {clients.length ? (
            <select
              id="client"
              name="client"
              required
              defaultValue=""
              onChange={(e) => setTaxId(clients.find((c) => c.id === e.target.value)?.taxId ?? "")}
              className="field field-box mt-1.5 h-11 w-full"
            >
              <option value="" disabled>
                Choose a client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-sm text-fg/85">
              No clients yet.{" "}
              <Link href="/admin/billing/clients" className="text-lime hover:underline">
                Add a client
              </Link>{" "}
              first.
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            Not listed?{" "}
            <Link href="/admin/billing/clients" className="hover:text-fg hover:underline">
              Add a new client
            </Link>
          </p>
        </div>

        <label className="block text-sm text-muted">
          Client tax ID (optional)
          <input name="clientTaxId" value={taxId} onChange={(e) => setTaxId(e.target.value)} className="field field-box mt-1.5 h-11 w-full" placeholder="e.g. VAT / EIN / RUT, printed under the client's name" />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-muted">
            Issue date
            <input type="date" name="issueDate" defaultValue={issueDate} required className="field field-box mt-1.5 h-11 w-full" />
          </label>
          <label className="text-sm text-muted">
            Due date
            <input type="date" name="dueDate" defaultValue={dueDate} required className="field field-box mt-1.5 h-11 w-full" />
          </label>
          <label className="text-sm text-muted">
            Purpose code
            <select name="purposeCode" defaultValue={defaultPurpose} className="field field-box mt-1.5 h-11 w-full">
              {purposeCodes.map(([code, label]) => (
                <option key={code} value={code}>
                  {code} · {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="text-sm text-muted">Line items</p>
          <div className="mt-2 space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-start sm:border-0 sm:p-0">
                <textarea
                  aria-label={`Item ${i + 1} description`}
                  placeholder="What was delivered, e.g. Backend development, September"
                  value={r.description}
                  onChange={(e) => set(i, { description: e.target.value })}
                  rows={1}
                  className="field field-box min-h-11 w-full resize-y py-2.5"
                />
                <input
                  aria-label={`Item ${i + 1} quantity`}
                  inputMode="decimal"
                  value={r.quantity}
                  onChange={(e) => set(i, { quantity: e.target.value })}
                  className="field field-box h-11 w-full text-right"
                  placeholder="Qty"
                />
                <input
                  aria-label={`Item ${i + 1} price in USD`}
                  inputMode="decimal"
                  value={r.price}
                  onChange={(e) => set(i, { price: e.target.value })}
                  className="field field-box h-11 w-full text-right"
                  placeholder="Price $"
                />
                <button
                  type="button"
                  onClick={() => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list))}
                  className="h-11 rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                  disabled={rows.length === 1}
                  aria-label={`Remove item ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((list) => [...list, { description: "", quantity: "1", price: "" }])} className="mt-3 text-sm text-lime hover:underline">
            + Add line item
          </button>
        </div>

        <label className="block text-sm text-muted">
          Notes on the invoice (optional)
          <textarea name="notes" rows={3} className="field field-box mt-1.5 w-full py-2.5" placeholder="e.g. Project reference, PO number" />
        </label>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5 md:p-6">
          <p className="text-sm text-muted">Total</p>
          <p className="mt-2 text-[2.25rem] leading-none font-semibold tracking-[-0.03em]">{money(total)}</p>
          <p className="mt-1 text-xs text-muted">USD</p>
          <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
            {items
              .filter((i) => i.description || i.unitCents)
              .map((i, k) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-fg/75">{i.description || "Untitled item"}</span>
                  <span className="flex-none tabular-nums">{money(Math.round(i.unitCents * i.quantity))}</span>
                </li>
              ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2">
            <Submit />
            <p className="text-xs text-muted">Saved as a draft first. You&apos;ll check the PDF before sending it to Xflow.</p>
          </div>
          {state.error && (
            <p role="alert" className="mt-4 text-sm text-[#ffb3b3]">
              {state.error}
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}
