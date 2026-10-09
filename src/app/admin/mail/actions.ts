"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MOVE_TARGETS, parseAddressList, sendMail, type OutgoingAttachment } from "@/lib/mailbox";

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // Netlify Functions accept ~6 MB per request

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Deletes for good, remembering Resend ids so a later sync can't bring the mail back. */
async function purge(where: Prisma.MailMessageWhereInput) {
  const gone = await db.mailMessage.findMany({ where: { ...where, externalId: { not: null } }, select: { externalId: true } });
  await db.$transaction([
    db.mailTombstone.createMany({ data: gone.map((g) => ({ externalId: g.externalId! })), skipDuplicates: true }),
    db.mailMessage.deleteMany({ where }),
  ]);
}

export type ThreadOp = "read" | "unread" | "star" | "unstar" | "move" | "delete";

/**
 * Conversation-level changes. The inbox updates itself on screen first and calls this in the
 * background, then refreshes, so nothing here redirects.
 */
export async function threadOp(threadKey: string, op: ThreadOp, to?: string) {
  await guard();
  if (!threadKey) return;
  const where = { threadKey };

  if (op === "read") {
    await db.mailMessage.updateMany({ where: { ...where, read: false }, data: { read: true } });
  } else if (op === "unread") {
    // Only the newest incoming message, like most mail apps.
    const last = await db.mailMessage.findFirst({ where: { ...where, direction: "in" }, orderBy: { date: "desc" }, select: { id: true } });
    if (last) await db.mailMessage.update({ where: { id: last.id }, data: { read: false } });
  } else if (op === "star" || op === "unstar") {
    await db.mailMessage.updateMany({ where, data: { starred: op === "star" } });
  } else if (op === "move") {
    if (!to || !(MOVE_TARGETS as readonly string[]).includes(to)) return;
    // Sent copies stay in Sent unless the whole conversation goes to the trash.
    if (to === "trash") await db.mailMessage.updateMany({ where, data: { folder: "trash" } });
    else
      await Promise.all([
        db.mailMessage.updateMany({ where: { ...where, direction: "in" }, data: { folder: to } }),
        db.mailMessage.updateMany({ where: { ...where, direction: "out" }, data: { folder: "sent" } }),
      ]);
  } else if (op === "delete") {
    await purge({ ...where, folder: "trash" });
  }
}


export async function emptyTrash() {
  await guard();
  await purge({ folder: "trash" });
  revalidatePath("/admin/mail");
  redirect("/admin/mail?folder=trash");
}

export type SendState = { error?: string };

export async function sendAction(_prev: SendState, formData: FormData): Promise<SendState> {
  await guard();
  const to = parseAddressList(String(formData.get("to") ?? ""));
  const cc = parseAddressList(String(formData.get("cc") ?? ""));
  const bcc = parseAddressList(String(formData.get("bcc") ?? ""));
  const subject = String(formData.get("subject") ?? "").trim();
  const text = String(formData.get("body") ?? "");
  const refId = String(formData.get("ref") ?? "");
  const mode = String(formData.get("mode") ?? "new");

  if (!to.length) return { error: "Add at least one valid recipient in To." };
  if (!subject) return { error: "Add a subject." };
  if (!text.trim()) return { error: "Write a message." };

  const attachments: OutgoingAttachment[] = [];
  let uploaded = 0;
  for (const f of formData.getAll("files")) {
    if (!(f instanceof File) || !f.size) continue;
    uploaded += f.size;
    attachments.push({ filename: f.name, contentType: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) });
  }
  if (uploaded > MAX_UPLOAD_BYTES) return { error: "Attachments are over 4.5 MB in total. Send large files as a link instead." };

  const ref = refId ? await db.mailMessage.findUnique({ where: { id: refId }, include: { attachments: mode === "forward" } }) : null;
  if (mode === "forward" && ref?.attachments) {
    for (const a of ref.attachments) if (!a.inline) attachments.push({ filename: a.filename, contentType: a.contentType, data: Buffer.from(a.data) });
  }

  let sent;
  try {
    sent = await sendMail({ to, cc, bcc, subject, text, attachments, replyToMail: mode === "forward" ? null : ref });
  } catch (err) {
    console.error("[mailbox] send failed:", err);
    return { error: err instanceof Error ? err.message : "Sending failed." };
  }
  revalidatePath("/admin/mail");
  redirect(`/admin/mail?folder=sent&thread=${encodeURIComponent(sent.threadKey)}`);
}
