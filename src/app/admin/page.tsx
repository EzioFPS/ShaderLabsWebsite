import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { loadDashboard, usd } from "@/lib/billing";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/mail-shared";
import { listThreads, unreadCounts } from "@/lib/mailbox";
import { xflowConfigured } from "@/lib/xflow";
import { logout } from "./actions";
import { LiveRateCard } from "./billing/LiveRateCard";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

// Xflow can be slow; the dashboard never waits on it for long.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const PATHS = {
  mail: "M3 6h18v12H3V6zm0 0l9 7 9-7",
  billing: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6m-6 4h3",
  enquiries: "M4 5h16v11H8l-4 4V5zm4 5h8m-8-3h5",
  arrow: "M5 12h14m-6-6l6 6-6 6",
};

function Glyph({ name, className = "h-5 w-5" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

function Panel({
  href,
  icon,
  title,
  figure,
  figureLabel,
  badge,
  children,
  actions,
}: {
  href: string;
  icon: keyof typeof PATHS;
  title: string;
  figure: string;
  figureLabel: string;
  badge?: string | null;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <article className="card group relative flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-lime/[0.07] blur-3xl transition-opacity group-hover:opacity-100 md:opacity-60" aria-hidden="true" />
      <Link href={href} className="relative flex items-start justify-between gap-4 p-6 pb-0 md:p-7 md:pb-0">
        <span className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-line-strong text-lime">
            <Glyph name={icon} />
          </span>
          <span className="text-lg font-semibold tracking-[-0.01em]">{title}</span>
        </span>
        <span className="mt-2 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg">
          <Glyph name="arrow" className="h-4 w-4" />
        </span>
      </Link>
      <div className="relative px-6 pt-6 md:px-7">
        <p className="flex items-baseline gap-3">
          <span className="text-[clamp(2.5rem,4.2vw,3.5rem)] leading-none font-semibold tracking-[-0.035em]">{figure}</span>
          {badge && <span className="rounded-full border border-lime/50 px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider text-lime">{badge}</span>}
        </p>
        <p className="mt-2 text-sm text-muted">{figureLabel}</p>
      </div>
      <div className="relative mt-6 flex-1 border-t border-line">{children}</div>
      <div className="relative flex flex-wrap gap-2 border-t border-line p-4 md:px-7">{actions}</div>
    </article>
  );
}

function Row({ href, title, sub, meta, strong }: { href: string; title: string; sub?: string; meta: string; strong?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-surface-2 md:px-7">
        <span className={`h-1.5 w-1.5 flex-none rounded-full ${strong ? "bg-lime" : "bg-transparent"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${strong ? "font-semibold text-fg" : "text-fg/85"}`}>{title}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        <span className="flex-none font-mono text-xs text-muted">{meta}</span>
      </Link>
    </li>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-6 py-8 text-sm text-muted md:px-7">{children}</p>;

export default async function AdminDashboard() {
  if (!(await isAdmin())) redirect("/admin/login");

  const xflowOn = xflowConfigured();
  const [unread, { threads }, enquiryCounts, latestEnquiries, invoices, invoiceCount, devices, xflow] = await Promise.all([
    unreadCounts(),
    listThreads("inbox", "", 4),
    db.enquiry.groupBy({ by: ["status"], _count: { _all: true } }),
    db.enquiry.findMany({ orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true, company: true, message: true, status: true, createdAt: true } }),
    db.invoice.findMany({ orderBy: { issueDate: "desc" }, take: 4, select: { id: true, number: true, clientName: true, totalCents: true, status: true, issueDate: true, dueDate: true } }),
    db.invoice.count({ where: { status: { not: "cancelled" } } }),
    db.pushSubscription.count(),
    xflowOn ? withTimeout(loadDashboard("12m"), 6000) : Promise.resolve(null),
  ]);

  const inboxUnread = unread.inbox ?? 0;
  const newEnquiries = enquiryCounts.find((c) => c.status === "new")?._count._all ?? 0;
  const totalEnquiries = enquiryCounts.reduce((n, c) => n + c._count._all, 0);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });

  const billingFigure = xflow ? usd(xflow.totals.receivedAll, true) : String(invoiceCount);
  const billingLabel = xflow
    ? `received through Xflow · ${usd(xflow.totals.outstanding, true)} outstanding`
    : `invoice${invoiceCount === 1 ? "" : "s"} on record${xflowOn ? " · Xflow didn't respond in time" : " · Xflow not connected yet"}`;
  const overdue = xflow?.totals.overdueCount ?? 0;

  return (
    <section className="pt-28 pb-24 md:pt-32">
      <div className="container-x">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Admin · {today}</p>
            <h1 className="t-h1 mt-4">{greeting()}.</h1>
            <p className="mt-3 max-w-xl text-muted">
              {inboxUnread || newEnquiries || overdue ? (
                <>
                  You have{" "}
                  {[
                    inboxUnread && `${inboxUnread} unread email${inboxUnread === 1 ? "" : "s"}`,
                    newEnquiries && `${newEnquiries} new enquir${newEnquiries === 1 ? "y" : "ies"}`,
                    overdue && `${overdue} overdue invoice${overdue === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  .
                </>
              ) : (
                "You're all caught up."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-ghost btn-sm h-10">
              View site
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm h-10">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:mt-12 lg:grid-cols-3">
          {/* ---------- Mail ---------- */}
          <Panel
            href="/admin/mail"
            icon="mail"
            title="Mail"
            figure={String(inboxUnread)}
            figureLabel={`unread in mail@shaderlabs.in · ${devices} device${devices === 1 ? "" : "s"} with notifications`}
            badge={inboxUnread ? "New" : null}
            actions={
              <>
                <Link href="/admin/mail" className="btn btn-primary btn-sm h-10">
                  Open inbox
                </Link>
                <Link href="/admin/mail?compose=new" className="btn btn-ghost btn-sm h-10">
                  Compose
                </Link>
              </>
            }
          >
            {threads.length ? (
              <ul className="divide-y divide-line">
                {threads.map((t) => (
                  <Row
                    key={t.threadKey}
                    href={`/admin/mail?thread=${encodeURIComponent(t.threadKey)}`}
                    title={t.fromName || t.fromAddress}
                    sub={t.subject || "(no subject)"}
                    meta={shortDate(t.date)}
                    strong={t.unread}
                  />
                ))}
              </ul>
            ) : (
              <Empty>The inbox is empty.</Empty>
            )}
          </Panel>

          {/* ---------- Billing ---------- */}
          <Panel
            href="/admin/billing"
            icon="billing"
            title="Billing"
            figure={billingFigure}
            figureLabel={billingLabel}
            badge={overdue ? `${overdue} overdue` : null}
            actions={
              <>
                <Link href="/admin/billing" className="btn btn-primary btn-sm h-10">
                  Open billing
                </Link>
                <Link href="/admin/billing/invoices/new" className="btn btn-ghost btn-sm h-10">
                  New invoice
                </Link>
              </>
            }
          >
            {invoices.length ? (
              <ul className="divide-y divide-line">
                {invoices.map((inv) => (
                  <Row
                    key={inv.id}
                    href={`/admin/billing/invoices/${inv.id}`}
                    title={`${inv.number} · ${inv.clientName}`}
                    sub={`${usd(inv.totalCents)} · ${inv.status === "registered" ? `due ${inv.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ })}` : inv.status}`}
                    meta={inv.issueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ })}
                  />
                ))}
              </ul>
            ) : (
              <Empty>No invoices yet. Create the first one and it&apos;ll show up here.</Empty>
            )}
          </Panel>

          {/* ---------- Enquiries ---------- */}
          <Panel
            href="/admin/enquiries"
            icon="enquiries"
            title="Enquiries"
            figure={String(newEnquiries)}
            figureLabel={`new from the contact form · ${totalEnquiries} in total`}
            badge={newEnquiries ? "New" : null}
            actions={
              <>
                <Link href="/admin/enquiries" className="btn btn-primary btn-sm h-10">
                  Open enquiries
                </Link>
                <a href="/admin/export" className="btn btn-ghost btn-sm h-10">
                  Export CSV
                </a>
              </>
            }
          >
            {latestEnquiries.length ? (
              <ul className="divide-y divide-line">
                {latestEnquiries.map((e) => (
                  <Row
                    key={e.id}
                    href={`/admin/enquiries${e.status === "new" ? "?status=new" : ""}`}
                    title={e.company ? `${e.name} · ${e.company}` : e.name}
                    sub={e.message}
                    meta={shortDate(e.createdAt)}
                    strong={e.status === "new"}
                  />
                ))}
              </ul>
            ) : (
              <Empty>No enquiries yet. They&apos;ll appear here as soon as someone uses the contact form.</Empty>
            )}
          </Panel>
        </div>

        {xflowOn && (
          <div className="mt-4">
            <LiveRateCard compact availableCents={xflow?.totals.withdrawable ?? 0} />
          </div>
        )}
      </div>
    </section>
  );
}
