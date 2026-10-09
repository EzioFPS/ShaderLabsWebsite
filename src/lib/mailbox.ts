import "server-only";
import { randomUUID } from "node:crypto";
import type { MailMessage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { inlineImageUrl, MAILBOX_ADDRESS, type Address, type Folder, type ThreadMessage, type ThreadSummary } from "@/lib/mail-shared";
import { notifyAll } from "@/lib/push";

// The mail@shaderlabs.in mailbox: Resend receives and sends, Neon stores everything.

export { FOLDERS, MAILBOX_ADDRESS, MOVE_TARGETS, formatAddress, inlineImageUrl, type Address, type Folder } from "@/lib/mail-shared";
export const MAILBOX_FROM = process.env.MAILBOX_FROM || `Shader Labs <${MAILBOX_ADDRESS}>`;

const RESEND = "https://api.resend.com";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function resend<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RESEND}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

// ---------- addresses & text helpers ----------

export function parseAddress(raw: string): Address {
  const m = raw.trim().match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, address: m[2].trim().toLowerCase() };
  return { address: raw.trim().toLowerCase() };
}

export function parseAddressList(raw: string | string[] | null | undefined): Address[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[,;\n]/);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parseAddress)
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.address));
}

export const asAddresses = (v: Prisma.JsonValue): Address[] => (Array.isArray(v) ? (v as Address[]) : []);
const formatAddr = (a: Address) => (a.name ? `${a.name} <${a.address}>` : a.address);

// ---------- reading (list + conversation) ----------

export async function listThreads(folder: Folder, query: string, limit: number) {
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
    take: limit * 3,
    select: { threadKey: true, date: true, fromAddress: true, fromName: true, to: true, subject: true, snippet: true, read: true, starred: true, hasAttachments: true, direction: true },
  });
  const threads = new Map<string, ThreadSummary>();
  for (const r of rows) {
    const t = threads.get(r.threadKey);
    if (!t) {
      threads.set(r.threadKey, {
        threadKey: r.threadKey,
        date: r.date.toISOString(),
        direction: r.direction,
        fromAddress: r.fromAddress,
        fromName: r.fromName,
        to: asAddresses(r.to),
        subject: r.subject,
        snippet: r.snippet,
        count: 1,
        unread: !r.read && r.direction === "in",
        starred: r.starred,
        files: r.hasAttachments,
      });
    } else {
      t.count++;
      t.unread ||= !r.read && r.direction === "in";
      t.starred ||= r.starred;
      t.files ||= r.hasAttachments;
    }
  }
  const all = [...threads.values()];
  // A full window of rows means there may be older conversations even if they grouped into few threads.
  return { threads: all.slice(0, limit), hasMore: all.length > limit || rows.length === limit * 3 };
}

export async function unreadCounts() {
  const rows = await db.mailMessage.groupBy({ by: ["folder"], where: { read: false, direction: "in" }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.folder, r._count._all])) as Record<string, number>;
}

/** A whole conversation, oldest first, with cid: images inlined as data URIs. */
export async function loadThread(threadKey: string): Promise<ThreadMessage[]> {
  const messages = await db.mailMessage.findMany({
    where: { threadKey },
    orderBy: { date: "asc" },
    include: { attachments: { select: { id: true, filename: true, size: true, inline: true, contentId: true } } },
  });
  return messages.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    direction: m.direction,
    folder: m.folder,
    fromAddress: m.fromAddress,
    fromName: m.fromName,
    to: asAddresses(m.to),
    cc: asAddresses(m.cc),
    bcc: asAddresses(m.bcc),
    replyTo: asAddresses(m.replyTo),
    subject: m.subject,
    text: m.text,
    // Embedded images load from the attachment route (cached by the browser) instead of riding along as base64.
    html: m.html
      ? m.html.replace(/cid:([^"'\s)>]+)/gi, (all, cid) => {
          const a = m.attachments.find((x) => x.contentId === cid);
          return a ? inlineImageUrl(a.id) : all;
        })
      : null,
    snippet: m.snippet,
    read: m.read,
    starred: m.starred,
    attachments: m.attachments,
  }));
}

export function snippetOf(text?: string | null, html?: string | null) {
  const src = text || (html ? html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ") : "");
  return src
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export const normalizeSubject = (s: string) => s.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim().toLowerCase();

const ids = (s?: string | null) => (s ? s.match(/<[^>]+>/g) ?? [] : []);

// ---------- threading ----------

// Same conversation = replies whose In-Reply-To/References point at a stored message;
// fallback: a "Re:"-style subject with the same counterpart within 90 days.
export async function resolveThreadKey(m: {
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  subject: string;
  counterpart: string;
}) {
  const refs = [...ids(m.inReplyTo), ...ids(m.references)];
  if (refs.length) {
    const parent = await db.mailMessage.findFirst({ where: { rfcMessageId: { in: refs } }, select: { threadKey: true } });
    if (parent) return parent.threadKey;
  }
  const norm = normalizeSubject(m.subject);
  if (norm && norm !== m.subject.trim().toLowerCase()) {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const candidates = await db.mailMessage.findMany({
      where: { date: { gte: since }, subject: { endsWith: norm, mode: "insensitive" } },
      orderBy: { date: "desc" },
      take: 25,
      select: { threadKey: true, subject: true, fromAddress: true, to: true },
    });
    const hit = candidates.find(
      (c) =>
        normalizeSubject(c.subject) === norm &&
        (c.fromAddress === m.counterpart || asAddresses(c.to).some((a) => a.address === m.counterpart)),
    );
    if (hit) return hit.threadKey;
  }
  return m.rfcMessageId || `t-${randomUUID()}`;
}

// ---------- receiving (Resend) ----------

type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  message_id?: string;
  created_at: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { id: string; filename?: string; content_type?: string; content_disposition?: string | null; content_id?: string | null; size?: number }[];
};

const header = (h: Record<string, string> | undefined, name: string) => {
  if (!h) return undefined;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name);
  return key ? String(h[key]) : undefined;
};

/** Stores one received email (idempotent). Returns the stored message id. */
export async function ingestReceivedEmail(emailId: string) {
  const [existing, deleted] = await Promise.all([
    db.mailMessage.findUnique({ where: { externalId: emailId }, select: { id: true, complete: true } }),
    db.mailTombstone.findUnique({ where: { externalId: emailId } }),
  ]);
  if (existing?.complete) return existing.id;
  if (deleted) return null; // deleted for good; a late webhook retry mustn't bring it back

  const e = await resend<ReceivedEmail>(`/emails/receiving/${emailId}?html_format=cid`);
  const from = parseAddress(e.from);
  const subject = e.subject ?? "";
  const rfcMessageId = e.message_id || header(e.headers, "message-id") || null;
  const inReplyTo = header(e.headers, "in-reply-to") ?? null;
  const references = header(e.headers, "references") ?? null;
  const spam = e.authentication?.dmarc === "fail" || (e.authentication?.spf === "fail" && e.authentication?.dkim === "fail");

  let mailId = existing?.id;
  if (!mailId) {
    const threadKey = await resolveThreadKey({ rfcMessageId, inReplyTo, references, subject, counterpart: from.address });
    const created = await db.mailMessage.create({
      data: {
        date: new Date(e.created_at),
        folder: spam ? "spam" : "inbox",
        direction: "in",
        source: "resend",
        externalId: e.id,
        rfcMessageId,
        inReplyTo,
        references,
        threadKey,
        fromAddress: from.address,
        fromName: from.name,
        to: parseAddressList(e.to),
        cc: parseAddressList(e.cc),
        bcc: parseAddressList(e.bcc),
        replyTo: parseAddressList(e.reply_to),
        subject,
        text: e.text ?? null,
        html: e.html ?? null,
        snippet: snippetOf(e.text, e.html),
        hasAttachments: Boolean(e.attachments?.length),
        complete: !e.attachments?.length,
      },
    });
    mailId = created.id;
    if (!spam) {
      // Phone notification for the new email (never blocks or fails the ingest).
      await notifyAll({
        title: from.name || from.address,
        body: [subject || "(no subject)", snippetOf(e.text, e.html)].filter(Boolean).join("\n").slice(0, 240),
        url: `/admin/mail?thread=${encodeURIComponent(threadKey)}`,
        tag: threadKey,
      }).catch((err) => console.error("[mailbox] push failed:", err));
    }
  }

  if (e.attachments?.length) {
    const stored = await db.mailAttachment.findMany({ where: { mailId }, select: { externalId: true, filename: true } });
    // Matched by Resend's attachment id; rows stored before ids were kept fall back to the file name.
    const have = new Set(stored.map((s) => s.externalId ?? `name:${s.filename}`));
    await Promise.all(
      e.attachments.map(async (a) => {
        const filename = a.filename || "attachment";
        if (have.has(a.id) || have.has(`name:${filename}`) || (a.size ?? 0) > MAX_ATTACHMENT_BYTES) return;
        const meta = await resend<{ download_url: string }>(`/emails/receiving/${emailId}/attachments/${a.id}`);
        const file = await fetch(meta.download_url, { signal: AbortSignal.timeout(30_000) });
        if (!file.ok) throw new Error(`attachment download ${file.status}`);
        const data = Buffer.from(await file.arrayBuffer());
        await db.mailAttachment
          .create({
            data: {
              id: `${mailId}:${a.id}`, // fixed id: a second copy of the same attachment can never be stored
              mailId: mailId!,
              filename,
              contentType: a.content_type || "application/octet-stream",
              size: data.length,
              contentId: a.content_id ? a.content_id.replace(/^<|>$/g, "") : null,
              inline: a.content_disposition === "inline",
              externalId: a.id,
              data,
            },
          })
          .catch((err: { code?: string }) => {
            if (err?.code !== "P2002") throw err; // already stored by a parallel run
          });
      }),
    );
    await db.mailMessage.update({ where: { id: mailId }, data: { complete: true } });
  }
  return mailId;
}

let lastSync = 0;
/** Catches up on anything the webhook missed (Resend keeps received mail only briefly). */
export async function syncReceived(force = false) {
  if (!process.env.RESEND_API_KEY || (!force && Date.now() - lastSync < 60_000)) return 0;
  lastSync = Date.now();
  const list = await resend<{ data: { id: string }[] }>(`/emails/receiving?limit=50`);
  const ids = list.data.map((d) => d.id);
  const [done, deleted] = await Promise.all([
    db.mailMessage.findMany({ where: { externalId: { in: ids }, complete: true }, select: { externalId: true } }),
    db.mailTombstone.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }),
  ]);
  const known = new Set<string | null>([...done, ...deleted].map((m) => m.externalId));
  let added = 0;
  for (const { id } of list.data) {
    if (known.has(id)) continue;
    try {
      await ingestReceivedEmail(id);
      added++;
    } catch (err) {
      console.error("[mailbox] sync failed for", id, err);
    }
  }
  return added;
}

// ---------- sending ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function textToHtml(text: string) {
  const body = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .split("\n")
    .map((line) => (line.startsWith("&gt;") ? `<span style="color:#666">${line}</span>` : line))
    .join("<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111">${body}</div>`;
}

export type OutgoingAttachment = { filename: string; contentType: string; data: Buffer };

export async function sendMail(input: {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
  replyToMail?: Pick<MailMessage, "rfcMessageId" | "references" | "threadKey"> | null;
}) {
  const rfcMessageId = `<${randomUUID()}@shaderlabs.in>`;
  const references = input.replyToMail
    ? [...ids(input.replyToMail.references), ...ids(input.replyToMail.rfcMessageId)].slice(-20).join(" ") || null
    : null;
  const inReplyTo = input.replyToMail?.rfcMessageId ?? null;
  const html = textToHtml(input.text);

  // Values come from received mail, so keep them on one line.
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const headers: Record<string, string> = { "Message-ID": rfcMessageId };
  if (inReplyTo) headers["In-Reply-To"] = oneLine(inReplyTo);
  if (references) headers["References"] = oneLine(references);

  const sent = await resend<{ id: string }>("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: MAILBOX_FROM,
      to: input.to.map(formatAddr),
      cc: input.cc.length ? input.cc.map(formatAddr) : undefined,
      bcc: input.bcc.length ? input.bcc.map(formatAddr) : undefined,
      subject: input.subject,
      text: input.text,
      html,
      headers,
      attachments: input.attachments.length
        ? input.attachments.map((a) => ({ filename: a.filename, content: a.data.toString("base64"), content_type: a.contentType }))
        : undefined,
    }),
  });

  const threadKey =
    input.replyToMail?.threadKey ??
    (await resolveThreadKey({ rfcMessageId, subject: input.subject, counterpart: input.to[0]?.address ?? "" }));

  const from = parseAddress(MAILBOX_FROM);
  return db.mailMessage.create({
    data: {
      date: new Date(),
      folder: "sent",
      direction: "out",
      source: "compose",
      externalId: `sent:${sent.id}`,
      rfcMessageId,
      inReplyTo,
      references,
      threadKey,
      fromAddress: from.address,
      fromName: from.name,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html,
      snippet: snippetOf(input.text),
      read: true,
      hasAttachments: input.attachments.length > 0,
      attachments: input.attachments.length
        ? { create: input.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.data.length, data: new Uint8Array(a.data) })) }
        : undefined,
    },
  });
}
