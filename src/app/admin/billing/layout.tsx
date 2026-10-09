import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { xflowConfigured, xflowTestMode } from "@/lib/xflow";
import { refreshBillingAction } from "./actions";
import { BillingNav } from "./BillingNav";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const configured = xflowConfigured();
  const test = xflowTestMode();

  return (
    <section className="pt-24 pb-24 md:pt-28">
      <div className="container-x">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Admin</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="t-h1">Billing</h1>
              {configured && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider ${
                    test ? "border-[#fab219]/50 text-[#fab219]" : "border-lime/50 text-lime"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${test ? "bg-[#fab219]" : "bg-lime"}`} aria-hidden="true" />
                  {test ? "Test mode" : "Live"}
                </span>
              )}
            </div>
            <p className="mt-2 text-muted">Money coming in through Xflow, invoices and payouts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/billing/invoices/new" className="btn btn-primary btn-sm h-10">
              New invoice
            </Link>
            <form action={refreshBillingAction}>
              <button type="submit" className="btn btn-ghost btn-sm h-10" title="Fetch the latest from Xflow">
                Refresh
              </button>
            </form>
            <Link href="/admin/mail" className="btn btn-ghost btn-sm h-10">
              Mail
            </Link>
            <Link href="/admin" className="btn btn-ghost btn-sm h-10">
              Enquiries
            </Link>
          </div>
        </div>

        <BillingNav />

        <div className="mt-8">
          {configured ? (
            children
          ) : (
            <div className="card max-w-2xl p-8">
              <h2 className="t-h3">Connect Xflow</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-fg/85">
                <li>
                  In the Xflow dashboard, open <strong>Developers</strong> and create a live API key (it starts with{" "}
                  <code className="font-mono">sk_live_</code>). Copy it straight away.
                </li>
                <li>
                  Add it as <code className="font-mono text-lime">XFLOW_API_KEY</code> in Netlify (Project configuration → Environment variables, marked as a
                  secret) and in the local <code className="font-mono">.env</code> file, then redeploy.
                </li>
              </ol>
              <p className="mt-4 text-sm text-muted">
                Viewing the dashboard only reads from Xflow. Anything that creates something real (an invoice, a client, a payment link or a withdrawal)
                always asks you to confirm first.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
