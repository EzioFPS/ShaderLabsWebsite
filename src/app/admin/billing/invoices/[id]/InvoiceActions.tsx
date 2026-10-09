"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelInvoiceAction,
  deleteDraftAction,
  emailInvoiceAction,
  paymentLinkAction,
  previewWithdrawAction,
  registerAction,
  simulatePaymentAction,
  withdrawAction,
  type ActionResult,
  type WithdrawPreview,
} from "../../actions";

type Props = {
  id: string;
  registered: boolean;
  cancelled: boolean;
  imported: boolean;
  paymentLinkUrl: string | null;
  clientEmail: string | null;
  sentTo: string | null;
  sentAt: string | null;
  waitingCents: number;
  testMode: boolean;
  fullyPaid: boolean;
};

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-xs ${done ? "bg-lime text-ink" : "border border-line-strong text-muted"}`}
          aria-hidden="true"
        >
          {done ? "✓" : n}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-3 pl-9">{children}</div>
    </li>
  );
}

export function InvoiceActions(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [email, setEmail] = useState(p.clientEmail ?? "");
  const [preview, setPreview] = useState<WithdrawPreview | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (name: string, fn: () => Promise<ActionResult>) => {
    setBusy(name);
    setResult(null);
    start(async () => {
      const r = await fn();
      setResult(r);
      setBusy(null);
      router.refresh();
    });
  };
  const btn = "btn btn-sm h-10";
  const isBusy = (name: string) => pending && busy === name;

  return (
    <div className="card p-5 md:p-6">
      <h2 className="t-h3">Actions</h2>

      {result?.error && (
        <p role="alert" className="mt-4 rounded-md border border-[#d03b3b]/60 bg-[#d03b3b]/10 p-3 text-sm break-words text-fg">
          {result.error}
        </p>
      )}
      {result?.message && (
        <p role="status" className="mt-4 rounded-md border border-lime/40 bg-lime/10 p-3 text-sm text-fg">
          {result.message}
        </p>
      )}

      <ol className="mt-5">
        <Step n={1} title="Check the PDF" done={p.registered}>
          <div className="flex flex-wrap gap-2">
            <a href={`/admin/billing/invoices/${p.id}/pdf`} target="_blank" rel="noopener" className={`${btn} btn-ghost`}>
              Open PDF
            </a>
            <a href={`/admin/billing/invoices/${p.id}/pdf?download=1`} className={`${btn} btn-ghost`}>
              Download
            </a>
          </div>
        </Step>

        <Step n={2} title="Register with Xflow" done={p.registered}>
          {p.registered ? (
            <p className="text-sm text-muted">{p.imported ? "Imported from Xflow." : "Uploaded and sent to Xflow for verification."}</p>
          ) : p.cancelled ? (
            <p className="text-sm text-muted">Cancelled.</p>
          ) : (
            <>
              <p className="text-sm text-muted">Uploads the PDF to Xflow so the client&apos;s payment can be matched to this invoice.</p>
              <button
                type="button"
                onClick={() =>
                  window.confirm(
                    `${p.testMode ? "" : "This creates a real invoice in your live Xflow account and sends it to Xflow for verification.\n\n"}Register this invoice with Xflow?`,
                  ) && run("register", () => registerAction(p.id))
                }
                disabled={pending}
                className={`${btn} btn-primary mt-3`}
              >
                {isBusy("register") ? "Registering…" : "Register with Xflow"}
              </button>
            </>
          )}
        </Step>

        <Step n={3} title="Payment link" done={Boolean(p.paymentLinkUrl)}>
          {p.paymentLinkUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">{p.paymentLinkUrl}</code>
              <button
                type="button"
                className={`${btn} btn-ghost`}
                onClick={() => navigator.clipboard.writeText(p.paymentLinkUrl!).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">A link the client can pay from online. Optional: they can also pay by bank transfer.</p>
              <button
                type="button"
                onClick={() => window.confirm("Create a live payment link for this invoice in Xflow?") && run("link", () => paymentLinkAction(p.id))}
                disabled={pending || !p.registered || p.cancelled}
                className={`${btn} btn-ghost mt-3`}
              >
                {isBusy("link") ? "Creating…" : "Create payment link"}
              </button>
              {!p.registered && <p className="mt-2 text-xs text-muted">Register with Xflow first.</p>}
            </>
          )}
        </Step>

        <Step n={4} title="Email it to the client" done={Boolean(p.sentAt)}>
          {p.sentAt && (
            <p className="mb-3 text-sm text-muted">
              Sent to {p.sentTo} on {new Date(p.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
              aria-label="Client email"
              className="field field-box h-10 min-w-0 flex-1"
            />
            <button type="button" onClick={() => run("email", () => emailInvoiceAction(p.id, email))} disabled={pending || p.cancelled || !email} className={`${btn} btn-ghost`}>
              {isBusy("email") ? "Sending…" : p.sentAt ? "Send again" : "Send"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">From mail@shaderlabs.in with the PDF attached{p.paymentLinkUrl ? " and the payment link" : ""}.</p>
        </Step>

        <Step n={5} title="Withdraw to your bank" done={p.fullyPaid}>
          {p.fullyPaid ? (
            <p className="text-sm text-muted">Fully paid and withdrawn.</p>
          ) : p.waitingCents > 0 ? (
            <>
              <p className="text-sm text-fg/85">
                <span className="font-semibold text-lime">{usd(p.waitingCents)}</span> has arrived from this client and is waiting in Xflow.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusy("preview");
                  setResult(null);
                  start(async () => {
                    setPreview(await previewWithdrawAction(p.id));
                    setBusy(null);
                  });
                }}
                disabled={pending}
                className={`${btn} btn-primary mt-3`}
              >
                {isBusy("preview") ? "Checking…" : "Withdraw…"}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">Available once the client&apos;s payment arrives in Xflow.</p>
          )}
        </Step>
      </ol>

      {p.testMode && p.registered && !p.cancelled && !p.fullyPaid && (
        <div className="mt-2 rounded-md border border-dashed border-[#fab219]/50 p-4">
          <p className="text-sm text-[#fab219]">Test mode</p>
          <p className="mt-1 text-xs text-muted">Pretend the client paid this invoice, to try the withdrawal flow with fake money.</p>
          <button type="button" onClick={() => run("sim", () => simulatePaymentAction(p.id))} disabled={pending} className={`${btn} btn-ghost mt-3`}>
            {isBusy("sim") ? "Simulating…" : "Simulate client payment"}
          </button>
        </div>
      )}

      {!p.cancelled && !p.fullyPaid && (
        <div className="mt-6 border-t border-line pt-4">
          {p.registered ? (
            <button
              type="button"
              onClick={() => window.confirm("Cancel this invoice in Xflow? The client can no longer pay against it.") && run("cancel", () => cancelInvoiceAction(p.id))}
              disabled={pending}
              className="text-sm text-[#ffb3b3] hover:underline"
            >
              {isBusy("cancel") ? "Cancelling…" : "Cancel invoice"}
            </button>
          ) : (
            <form action={deleteDraftAction.bind(null, p.id)} onSubmit={(e) => !window.confirm("Delete this draft invoice?") && e.preventDefault()}>
              <button type="submit" className="text-sm text-[#ffb3b3] hover:underline">
                Delete draft
              </button>
            </form>
          )}
        </div>
      )}

      {/* withdrawal confirmation */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="wd-title">
          <div className="card w-full max-w-md p-6">
            <h2 id="wd-title" className="t-h3">
              Withdraw to your bank
            </h2>
            {preview.error ? (
              <>
                <p className="mt-4 text-sm break-words text-fg/85">{preview.error}</p>
                <div className="mt-6 flex justify-end">
                  <button type="button" onClick={() => setPreview(null)} className={`${btn} btn-ghost`}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-[2rem] leading-none font-semibold">{usd(preview.amountCents ?? 0)}</p>
                <p className="mt-2 text-sm text-muted">
                  Matched to this invoice and paid out in INR to {preview.bank || "your payout bank account"} at Xflow&apos;s rate.
                </p>
                {preview.details && <PreviewDetails details={preview.details} />}
                <p className="mt-4 text-xs text-muted">
                  {p.testMode ? "Test mode: no real money moves." : "This moves real money and can't be undone from here. Xflow pays it out to your bank, usually the next business day."}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setPreview(null)} className={`${btn} btn-ghost`} disabled={pending}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`${btn} btn-primary`}
                    disabled={pending}
                    onClick={() => {
                      const amount = preview.amountCents ?? 0;
                      setPreview(null);
                      run("withdraw", () => withdrawAction(p.id, amount));
                    }}
                  >
                    Confirm withdrawal
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shows the useful parts of Xflow's reconciliation preview (settlement date, events). */
function PreviewDetails({ details }: { details: Record<string, unknown> }) {
  const lines: string[] = [];
  const date = (v: unknown) => (typeof v === "number" ? new Date(v * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : String(v));
  for (const [k, v] of Object.entries(details)) {
    if (v === null || typeof v === "object") continue;
    if (/date|settle|arriv/i.test(k)) lines.push(`${k.replace(/_/g, " ")}: ${date(v)}`);
  }
  if (!lines.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-fg/80">
      {lines.map((l) => (
        <li key={l} className="capitalize">
          {l}
        </li>
      ))}
    </ul>
  );
}
