import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  asAddresses,
  FOLDERS,
  formatAddress,
  MAILBOX_ADDRESS,
  syncReceived,
  type Address,
  type Folder,
} from "@/lib/mailbox";
import { logout } from "../actions";
import { emptyTrash, refreshInbox, threadAction } from "./actions";
import { Compose } from "./Compose";
import { MailFrame } from "./MailFrame";

export const metadata: Metadata = { title: "Mail", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { folder?: string; q?: string; thread?: string; compose?: string; ref?: string; to?: string; subject?: string; limit?: string };

const LABELS: Record<Folder, string> = { inbox: "Inbox", starred: "Starred", sent: "Sent", archive: "Archive", spam: "Spam", trash: "Trash" };
const TZ = "Asia/Kolkata";

function shortDate(d: Date) {
  const now = new Date();
  const day = (x: Date) => x.toLocaleDateString("en-IN", { timeZone: TZ });
  if (day(d) === day(now)) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const sameYear = d.toLocaleDateString("en-IN", { year: "numeric", timeZone: TZ }) === now.toLocaleDateString("en-IN", { year: "numeric", timeZone: TZ });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: TZ });
}
const longDate = (d: Date) => d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const who = (a: Address) => a.name || a.address;

function quote(m: { date: Date; fromName: string | null; fromAddress: string; text: string | null; snippet: string }) {
  const body = (m.text || m.snippet || "").trim();
  return `\n\nOn ${longDate(m.date)}, ${m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress} wrote:\n${body
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

export default async function MailPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const folder: Folder = (FOLDERS as readonly string[]).includes(sp.folder ?? "") ? (sp.folder as Folder) : "inbox";
  const query = (sp.q ?? "").trim();
  const limit = Math.min(Number(sp.limit) || 60, 500);
  const configured = Boolean(process.env.RESEND_API_KEY);

  if (folder === "inbox" && configured) {
    // Pick up anything the webhook missed. Never let a Resend hiccup break the page.
    await syncReceived().catch((err) => console.error("[mailbox] sync failed:", err));
  }

  const hrefFor = (p: Partial<Search>) => {
    const s = new URLSearchParams();
    const merged = { folder, q: query || undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "folder" && v === "inbox")) s.set(k, String(v));
    const str = s.toString();
    return str ? `/admin/mail?${str}` : "/admin/mail";
  };

  // Opening a conversation marks it read (before the list and counts are loaded).
  const threadKey = sp.thread ?? "";
  if (threadKey) await db.mailMessage.updateMany({ where: { threadKey, read: false }, data: { read: true } });

  // ---------- conversation list ----------
  const where: Prisma.MailMessageWhereInput = {
    ...(folder === "starred" ? { starred: true, folder: { not: "trash" } } : { folder }),
    ...(query
      ? {
          OR: [
            { subject: { contains: query, mode: "insensitive" } },
            { fromAddress: { contains: query, mode: "insensitive" } },
            { fromName: { contains: query, mode: "insensitive" } },
            { text: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await db.mailMessage.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit * 4,
    select: { id: true, threadKey: true, date: true, fromAddress: true, fromName: true, to: true, subject: true, snippet: true, read: true, starred: true, hasAttachments: true, direction: true },
  });
  type Row = (typeof rows)[number];
  const threads = new Map<string, { latest: Row; count: number; unread: boolean; starred: boolean; files: boolean }>();
  for (const r of rows) {
    const t = threads.get(r.threadKey);
    if (!t) threads.set(r.threadKey, { latest: r, count: 1, unread: !r.read, starred: r.starred, files: r.hasAttachments });
    else {
      t.count++;
      t.unread ||= !r.read;
      t.starred ||= r.starred;
      t.files ||= r.hasAttachments;
    }
  }
  const list = [...threads.values()].slice(0, limit);
  const unreadCounts = await db.mailMessage.groupBy({ by: ["folder"], where: { read: false, direction: "in" }, _count: { _all: true } });
  const unreadIn = (f: string) => unreadCounts.find((c) => c.folder === f)?._count._all ?? 0;

  // ---------- open conversation ----------
  const messages = threadKey
    ? await db.mailMessage.findMany({
        where: { threadKey },
        orderBy: { date: "asc" },
        include: { attachments: { select: { id: true, filename: true, size: true, inline: true, contentId: true } } },
      })
    : [];

  // cid: images become data URIs (the email HTML is rendered in a sandbox that can't fetch our routes)
  const inlineData = new Map<string, string>();
  const withCid = messages.filter((m) => m.html?.includes("cid:")).map((m) => m.id);
  if (withCid.length) {
    const parts = await db.mailAttachment.findMany({ where: { mailId: { in: withCid }, contentId: { not: null }, size: { lte: 3 * 1024 * 1024 } } });
    for (const p of parts) inlineData.set(`${p.mailId}:${p.contentId}`, `data:${p.contentType};base64,${Buffer.from(p.data).toString("base64")}`);
  }
  const htmlFor = (m: (typeof messages)[number]) =>
    m.html!.replace(/cid:([^"'\s)>]+)/gi, (all, cid) => inlineData.get(`${m.id}:${cid}`) ?? all);

  // ---------- compose ----------
  const composeMode = (["new", "reply", "replyall", "forward"] as const).find((x) => x === sp.compose);
  const ref = sp.ref ? await db.mailMessage.findUnique({ where: { id: sp.ref }, include: { attachments: { select: { filename: true, inline: true } } } }) : null;
  let composeProps: React.ComponentProps<typeof Compose> | null = null;
  if (composeMode) {
    const cancelHref = hrefFor({ compose: undefined, ref: undefined, to: undefined, subject: undefined, thread: threadKey || undefined });
    if (composeMode === "new" || !ref) {
      composeProps = { mode: "new", to: sp.to ?? "", subject: sp.subject ?? "", cancelHref };
    } else {
      const self = MAILBOX_ADDRESS;
      const replyTargets = ref.direction === "out" ? asAddresses(ref.to) : asAddresses(ref.replyTo).length ? asAddresses(ref.replyTo) : [{ name: ref.fromName ?? undefined, address: ref.fromAddress }];
      const re = (s: string) => (/^re:/i.test(s.trim()) ? s : `Re: ${s}`);
      if (composeMode === "forward") {
        composeProps = {
          mode: "forward",
          refId: ref.id,
          subject: /^fwd?:/i.test(ref.subject) ? ref.subject : `Fwd: ${ref.subject}`,
          body: `\n\n---------- Forwarded message ----------\nFrom: ${ref.fromName ? `${ref.fromName} <${ref.fromAddress}>` : ref.fromAddress}\nDate: ${longDate(ref.date)}\nSubject: ${ref.subject}\nTo: ${asAddresses(ref.to).map(formatAddress).join(", ")}\n\n${ref.text || ref.snippet}`,
          forwardedFiles: ref.attachments.filter((a) => !a.inline).map((a) => a.filename),
          cancelHref,
        };
      } else {
        const toList = replyTargets.filter((a) => a.address !== self);
        const ccList =
          composeMode === "replyall"
            ? [...asAddresses(ref.to), ...asAddresses(ref.cc)].filter(
                (a) => a.address !== self && !toList.some((t) => t.address === a.address),
              )
            : [];
        composeProps = {
          mode: composeMode,
          refId: ref.id,
          to: toList.map(formatAddress).join(", "),
          cc: ccList.map(formatAddress).join(", "),
          subject: re(ref.subject),
          body: quote(ref),
          cancelHref,
        };
      }
    }
  }

  const readerOpen = Boolean(composeProps || messages.length);
  const current = hrefFor({ thread: threadKey || undefined });
  const lastIncoming = [...messages].reverse().find((m) => m.direction === "in") ?? messages[messages.length - 1];
  const threadFolder = messages.find((m) => m.direction === "in")?.folder ?? messages[0]?.folder;
  const threadStarred = messages.some((m) => m.starred);

  const ActionButton = ({ op, to, label, danger }: { op: string; to?: string; label: string; danger?: boolean }) => (
    <form action={threadAction}>
      <input type="hidden" name="thread" value={threadKey} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="back" value={current} />
      {to && <input type="hidden" name="to" value={to} />}
      <button type="submit" className={`btn btn-ghost btn-sm h-9 ${danger ? "text-[#ffb3b3]" : ""}`}>
        {label}
      </button>
    </form>
  );

  return (
    <section className="pt-24 pb-10 md:pt-28">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Admin</p>
            <h1 className="t-h1 mt-2">Mail</h1>
            <p className="meta mt-1">{MAILBOX_ADDRESS}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={hrefFor({ compose: "new", thread: undefined, ref: undefined })} className="btn btn-primary btn-sm h-10">
              Compose
            </Link>
            <form action={refreshInbox}>
              <button type="submit" className="btn btn-ghost btn-sm h-10">
                Refresh
              </button>
            </form>
            <Link href="/admin" className="btn btn-ghost btn-sm h-10">
              Enquiries
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm h-10">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {!configured && (
          <p className="mt-6 rounded-md border border-line-strong bg-surface px-4 py-3 text-sm text-fg/85">
            Mail is off: RESEND_API_KEY is not set.
          </p>
        )}

        <div className="mt-6 grid overflow-hidden rounded-md border border-line bg-surface lg:h-[calc(100svh-18rem)] lg:min-h-[30rem] lg:grid-cols-[10.5rem_minmax(0,22rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          {/* folders */}
          <nav aria-label="Folders" className={`border-line lg:border-r ${readerOpen ? "hidden lg:block" : ""}`}>
            <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-3">
              {FOLDERS.map((f) => {
                const active = f === folder;
                const unread = f === "inbox" || f === "spam" ? unreadIn(f) : 0;
                return (
                  <li key={f} className="flex-none">
                    <Link
                      href={hrefFor({ folder: f, q: undefined })}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        active ? "bg-lime text-ink" : "text-fg/85 hover:bg-surface-2"
                      }`}
                    >
                      {LABELS[f]}
                      {unread > 0 && <span className={`font-mono text-xs ${active ? "text-ink/70" : "text-lime"}`}>{unread}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {folder === "trash" && list.length > 0 && (
              <form action={emptyTrash} className="px-3 pb-3">
                <button type="submit" className="text-xs text-[#ffb3b3] hover:underline">
                  Empty trash
                </button>
              </form>
            )}
          </nav>

          {/* conversation list */}
          <div className={`flex min-h-0 flex-col border-line lg:border-r ${readerOpen ? "hidden lg:flex" : ""}`}>
            <form action="/admin/mail" className="flex gap-2 border-b border-line p-3">
              {folder !== "inbox" && <input type="hidden" name="folder" value={folder} />}
              <label htmlFor="mail-q" className="sr-only">
                Search mail
              </label>
              <input id="mail-q" name="q" defaultValue={query} placeholder={`Search ${LABELS[folder].toLowerCase()}`} className="field field-box h-9 min-w-0 flex-1 text-sm" />
            </form>
            <ul className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
              {list.length === 0 && (
                <li className="p-6 text-center text-sm text-muted">{query ? "Nothing matches your search." : `No mail in ${LABELS[folder]}.`}</li>
              )}
              {list.map(({ latest: m, count, unread, starred, files }) => {
                const active = m.threadKey === threadKey;
                const name = m.direction === "out" ? `To: ${asAddresses(m.to).map(who).join(", ")}` : m.fromName || m.fromAddress;
                return (
                  <li key={m.threadKey}>
                    <Link
                      href={hrefFor({ thread: m.threadKey, compose: undefined, ref: undefined })}
                      className={`block border-b border-line px-4 py-3 transition-colors ${active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
                    >
                      <span className="flex items-baseline gap-2">
                        {unread && <span className="h-2 w-2 flex-none translate-y-[-1px] rounded-full bg-lime" aria-label="Unread" />}
                        <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold text-fg" : "text-fg/80"}`}>
                          {name}
                          {count > 1 && <span className="ml-1 font-mono text-xs text-muted">{count}</span>}
                        </span>
                        {starred && <span className="text-xs text-lime" aria-label="Starred">★</span>}
                        {files && <span className="text-xs text-muted" aria-label="Has attachments">📎</span>}
                        <span className="flex-none font-mono text-xs text-muted">{shortDate(m.date)}</span>
                      </span>
                      <span className={`mt-0.5 block truncate text-sm ${unread ? "text-fg" : "text-fg/75"}`}>{m.subject || "(no subject)"}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{m.snippet}</span>
                    </Link>
                  </li>
                );
              })}
              {threads.size > limit && (
                <li className="p-3 text-center">
                  <Link href={hrefFor({ limit: String(limit + 60), thread: threadKey || undefined })} className="text-sm text-muted hover:text-fg">
                    Load more
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* reading pane */}
          <div className={`min-h-[60svh] min-w-0 lg:h-full lg:min-h-0 ${readerOpen ? "" : "hidden lg:block"}`}>
            {composeProps ? (
              <Compose key={`${sp.compose}-${sp.ref ?? ""}`} {...composeProps} />
            ) : messages.length ? (
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
                  <Link href={hrefFor({ thread: undefined })} className="btn btn-ghost btn-sm h-9 lg:hidden">
                    ← Back
                  </Link>
                  <Link href={hrefFor({ thread: threadKey, compose: "reply", ref: lastIncoming.id })} className="btn btn-primary btn-sm h-9">
                    Reply
                  </Link>
                  <Link href={hrefFor({ thread: threadKey, compose: "replyall", ref: lastIncoming.id })} className="btn btn-ghost btn-sm h-9">
                    Reply all
                  </Link>
                  <Link href={hrefFor({ thread: threadKey, compose: "forward", ref: messages[messages.length - 1].id })} className="btn btn-ghost btn-sm h-9">
                    Forward
                  </Link>
                  <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                  <ActionButton op={threadStarred ? "unstar" : "star"} label={threadStarred ? "Unstar" : "Star"} />
                  <ActionButton op="unread" label="Mark unread" />
                  {threadFolder !== "inbox" && threadFolder !== "sent" && <ActionButton op="move" to="inbox" label="Move to inbox" />}
                  {threadFolder === "inbox" && <ActionButton op="move" to="archive" label="Archive" />}
                  {threadFolder !== "spam" && threadFolder !== "sent" && <ActionButton op="move" to="spam" label="Spam" />}
                  {threadFolder === "trash" ? (
                    <ActionButton op="delete" label="Delete forever" danger />
                  ) : (
                    <ActionButton op="move" to="trash" label="Trash" />
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" data-lenis-prevent>
                  <h2 className="t-h3 break-words">{messages[0].subject || "(no subject)"}</h2>
                  <ol className="mt-5 space-y-4">
                    {messages.map((m, i) => {
                      const last = i === messages.length - 1;
                      const files = m.attachments.filter((a) => !a.inline || !(m.html ?? "").includes(`cid:${a.contentId}`));
                      const header = (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="min-w-0 break-words">
                            <span className="font-semibold">{m.fromName || m.fromAddress}</span>
                            {m.fromName && <span className="text-sm text-muted"> &lt;{m.fromAddress}&gt;</span>}
                          </span>
                          <span className="flex-none font-mono text-xs text-muted">{longDate(m.date)}</span>
                        </div>
                      );
                      const details = (
                        <>
                          <p className="mt-1 break-words text-xs text-muted">
                            To: {asAddresses(m.to).map(formatAddress).join(", ") || "—"}
                            {asAddresses(m.cc).length > 0 && <> · Cc: {asAddresses(m.cc).map(formatAddress).join(", ")}</>}
                            {m.direction === "out" && asAddresses(m.bcc).length > 0 && <> · Bcc: {asAddresses(m.bcc).map(formatAddress).join(", ")}</>}
                          </p>
                          <div className="mt-4">
                            {m.html ? (
                              <MailFrame html={htmlFor(m)} title={`Email from ${m.fromAddress}`} />
                            ) : (
                              <pre className="whitespace-pre-wrap break-words font-sans text-[0.95rem] leading-relaxed text-fg/90">{m.text || "(empty message)"}</pre>
                            )}
                          </div>
                          {files.length > 0 && (
                            <ul className="mt-4 flex flex-wrap gap-2">
                              {files.map((a) => (
                                <li key={a.id}>
                                  <a href={`/admin/mail/attachment/${a.id}`} className="chip hover:border-fg">
                                    📎 {a.filename} <span className="text-muted">· {sizeLabel(a.size)}</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      );
                      return (
                        <li key={m.id} className="rounded-md border border-line bg-ink/40 p-4">
                          {last ? (
                            <>
                              {header}
                              {details}
                            </>
                          ) : (
                            <details>
                              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                                {header}
                                <p className="mt-1 truncate text-sm text-muted">{m.snippet}</p>
                              </summary>
                              {details}
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted">Select a conversation to read it.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
