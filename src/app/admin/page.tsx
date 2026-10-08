import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMailConfigured } from "@/lib/mail";
import { STATUSES } from "@/lib/statuses";
import { logout, updateStatus } from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const statusStyle: Record<string, string> = {
  new: "border-lime/50 text-lime",
  contacted: "text-sky-300",
  won: "border-emerald-400/50 text-emerald-300",
  closed: "border-line-strong text-muted",
  spam: "border-danger/50 text-[#ffb3b3]",
};

const emailStyle: Record<string, string> = {
  sent: "text-emerald-300",
  failed: "text-[#ffb3b3]",
  skipped: "text-muted",
  pending: "text-muted",
};

type Search = { q?: string; status?: string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { q = "", status = "all" } = await searchParams;
  const query = q.trim();

  const where: Prisma.EnquiryWhereInput = {
    ...(status !== "all" && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { company: { contains: query, mode: "insensitive" } },
            { message: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [enquiries, counts] = await Promise.all([
    db.enquiry.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    db.enquiry.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  const mailOn = isMailConfigured();

  const tabHref = (s: string) => {
    const p = new URLSearchParams();
    if (s !== "all") p.set("status", s);
    if (query) p.set("q", query);
    const str = p.toString();
    return str ? `/admin?${str}` : "/admin";
  };

  return (
    <section className="pt-28 pb-24 md:pt-32">
      <div className="container-x">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Admin</p>
            <h1 className="display display-md mt-4">Enquiries</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/admin/export" className="btn btn-ghost btn-sm">
              Export CSV
            </a>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {!mailOn && (
          <p className="mt-8 rounded-md border border-line-strong bg-surface px-4 py-3 text-sm text-fg/85">
            Email delivery is off: RESEND_API_KEY is not set in <code className="font-mono">.env</code>. Enquiries are
            still saved here. Add a Resend API key to also receive them at mail@shaderlabs.in.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {["all", ...STATUSES].map((s) => {
              const active = status === s || (s === "all" && !(STATUSES as readonly string[]).includes(status));
              return (
                <Link
                  key={s}
                  href={tabHref(s)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm capitalize transition-colors ${
                    active ? "border-lime bg-lime text-ink" : "border-line-strong text-fg hover:border-fg"
                  }`}
                >
                  {s}
                  <span className={`font-mono text-xs ${active ? "text-ink/70" : "text-muted"}`}>
                    {s === "all" ? total : countFor(s)}
                  </span>
                </Link>
              );
            })}
          </nav>
          <form action="/admin" className="flex w-full gap-2 lg:w-auto">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <label htmlFor="q" className="sr-only">
              Search enquiries
            </label>
            <input
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Search name, email, company, message"
              className="field field-box h-10 lg:w-80"
            />
            <button type="submit" className="btn btn-primary btn-sm h-10 flex-none">
              Search
            </button>
          </form>
        </div>

        {enquiries.length === 0 ? (
          <div className="card mt-8 p-10 text-center text-muted">
            {total === 0 ? "No enquiries yet. They'll appear here as soon as someone uses the contact form." : "Nothing matches this filter."}
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {enquiries.map((e) => {
              const services: string[] = (() => {
                try {
                  return JSON.parse(e.services);
                } catch {
                  return [];
                }
              })();
              return (
                <li key={e.id}>
                  <details className="group card overflow-hidden">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 md:flex-row md:items-center md:gap-6 md:p-6 [&::-webkit-details-marker]:hidden">
                      <span className={`chip w-fit flex-none capitalize ${statusStyle[e.status] ?? ""}`}>{e.status}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {e.name}
                          {e.company && <span className="font-normal text-muted"> · {e.company}</span>}
                        </span>
                        <span className="block truncate text-sm text-muted">{e.message}</span>
                      </span>
                      <span className="flex-none text-sm text-muted md:text-right">
                        {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                      </span>
                    </summary>
                    <div className="border-t border-line p-5 md:p-6">
                      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ["Email", e.email],
                          ["Phone / WhatsApp", e.phone],
                          ["Website", e.website],
                          ["Budget", e.budget],
                          ["Services", services.join(", ")],
                        ].map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
                            <dd className="mt-1 break-words">{v || "—"}</dd>
                          </div>
                        ))}
                        <div className="min-w-0">
                          <dt className="text-xs uppercase tracking-wider text-muted">Email notification</dt>
                          <dd className={`mt-1 capitalize ${emailStyle[e.emailStatus] ?? ""}`} title={e.emailError ?? undefined}>
                            {e.emailStatus}
                            {e.emailStatus === "failed" && e.emailError && (
                              <span className="block text-xs normal-case text-muted">{e.emailError}</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-6">
                        <p className="text-xs uppercase tracking-wider text-muted">Message</p>
                        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{e.message}</p>
                      </div>
                      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <form action={updateStatus} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={e.id} />
                          <label htmlFor={`status-${e.id}`} className="text-sm text-muted">
                            Status
                          </label>
                          <select id={`status-${e.id}`} name="status" defaultValue={e.status} className="field field-box h-10 w-40 capitalize">
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn btn-ghost btn-sm h-10">
                            Save
                          </button>
                        </form>
                        <a
                          href={`mailto:${e.email}?subject=${encodeURIComponent("Re: your enquiry to Shader Labs")}`}
                          className="btn btn-primary btn-sm h-10"
                        >
                          Reply by email
                        </a>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
