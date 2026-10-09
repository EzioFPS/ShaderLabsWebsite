import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { FOLDERS, type ComposeInit, type Folder } from "@/lib/mail-shared";
import { listThreads, loadThread, unreadCounts } from "@/lib/mailbox";
import { MailApp } from "./MailApp";

export const metadata: Metadata = { title: "Mail", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = { folder?: string; q?: string; thread?: string; compose?: string; to?: string; subject?: string; limit?: string };

// The inbox runs in the browser (MailApp): conversations open instantly from a small JSON route,
// actions update the screen first and save in the background, and new mail is checked in the
// background. This page only loads the folder's list (and a conversation when linked directly).
export default async function MailPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const folder: Folder = (FOLDERS as readonly string[]).includes(sp.folder ?? "") ? (sp.folder as Folder) : "inbox";
  const query = (sp.q ?? "").trim();
  const limit = Math.min(Number(sp.limit) || 60, 500);
  const threadKey = sp.thread || null;

  // A directly linked conversation counts as read before the counts are loaded.
  if (threadKey) await db.mailMessage.updateMany({ where: { threadKey, read: false }, data: { read: true } });

  const [{ threads, hasMore }, unread, initialThread] = await Promise.all([
    listThreads(folder, query, limit),
    unreadCounts(),
    threadKey ? loadThread(threadKey) : Promise.resolve(null),
  ]);

  const moreHref = hasMore
    ? `/admin/mail?${new URLSearchParams({ ...(folder !== "inbox" ? { folder } : {}), ...(query ? { q: query } : {}), limit: String(limit + 60) })}`
    : null;

  // "Reply by email" on the Enquiries page opens a pre-filled new message.
  const initialCompose: ComposeInit | null = sp.compose === "new" ? { mode: "new", to: sp.to ?? "", subject: sp.subject ?? "" } : null;

  return (
    <MailApp
      key={`${folder}|${query}|${limit}`}
      folder={folder}
      query={query}
      threads={threads}
      moreHref={moreHref}
      unread={unread}
      initialKey={initialThread?.length ? threadKey : null}
      initialThread={initialThread?.length ? initialThread : null}
      initialCompose={initialCompose}
      configured={Boolean(process.env.RESEND_API_KEY)}
    />
  );
}
