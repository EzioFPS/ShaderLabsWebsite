// One-time import of the old Titan mailbox into the site's mailbox (Neon database).
//
//   npm run import:titan            scan, show totals, ask, then import
//   npm run import:titan -- --scan  only show folders, message counts and sizes
//
// Reads Titan over IMAP in read-only mode (nothing in Titan is changed or marked read).
// The password is typed here and only sent to Titan. Safe to re-run: already-imported
// messages are skipped. Uses DATABASE_URL from .env.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";

const HOST = "imap.titan.email";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SCAN_ONLY = process.argv.includes("--scan");

// ---------- helpers ----------

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : s.replace(/[^\r\n]/g, "*"));
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const ids = (s) => (s ? String(s).match(/<[^>]+>/g) ?? [] : []);
const normalizeSubject = (s) => (s || "").replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim().toLowerCase();
const lower = (a) => (a || "").trim().toLowerCase();

function addresses(field) {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  return list
    .flatMap((f) => f.value ?? [])
    .filter((a) => a.address)
    .map((a) => ({ ...(a.name ? { name: a.name } : {}), address: lower(a.address) }));
}

function snippetOf(text, html) {
  const src = text || (html ? html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ") : "");
  return src.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 180);
}

function folderFor(box) {
  const use = box.specialUse;
  if (use === "\\Inbox" || box.path.toUpperCase() === "INBOX") return "inbox";
  if (use === "\\Sent") return "sent";
  if (use === "\\Junk") return "spam";
  if (use === "\\Trash") return "trash";
  if (use === "\\Drafts") return null; // drafts aren't imported
  if (use === "\\All" || use === "\\Flagged") return null; // virtual folders: would duplicate everything
  return "archive"; // Archive and any custom folders
}

// ---------- main ----------

const user = (await ask("Titan email [mail@shaderlabs.in]: ")) || "mail@shaderlabs.in";
const pass = await ask(`Titan password for ${user}: `, true);
process.stdout.write("\n");

const client = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user, pass }, logger: false });
try {
  await client.connect();
} catch (err) {
  console.error(`\nCould not sign in to Titan: ${err.responseText || err.message}`);
  if (err.serverResponseCode) console.error(`Titan's response code: ${err.serverResponseCode}`);
  if (err.authenticationFailed) {
    console.error(
      "\nTitan rejected the login. If the password is right, Titan is blocking outside mail apps:\n" +
        "  - turn on third-party / IMAP access for this mailbox in Titan's settings, or\n" +
        "  - if two-step verification is on, create an app password in Titan and use that here.",
    );
  }
  process.exit(1);
}

const boxes = (await client.list()).map((b) => ({ ...b, target: folderFor(b) })).filter((b) => b.target && !b.flags?.has("\\Noselect"));

// Pass 1: headers only, to count, size and thread everything.
console.log("\nScanning Titan…");
const all = [];
for (const box of boxes) {
  const lock = await client.getMailboxLock(box.path, { readOnly: true });
  try {
    let count = 0;
    let bytes = 0;
    const uidValidity = String(client.mailbox.uidValidity);
    if (client.mailbox.exists) {
      for await (const msg of client.fetch("1:*", { uid: true, size: true, envelope: true, internalDate: true, headers: ["references"] })) {
        const env = msg.envelope ?? {};
        const refs = msg.headers ? String(msg.headers).replace(/^references:\s*/i, "").replace(/\r?\n\s+/g, " ") : "";
        all.push({
          box: box.path,
          target: box.target,
          uid: msg.uid,
          externalId: `titan:${box.path}:${uidValidity}:${msg.uid}`,
          size: msg.size ?? 0,
          date: env.date ? new Date(env.date) : msg.internalDate ? new Date(msg.internalDate) : new Date(0),
          rfcMessageId: env.messageId || null,
          inReplyTo: env.inReplyTo || null,
          references: refs || null,
          subject: env.subject || "",
          from: lower(env.from?.[0]?.address),
          to: lower(env.to?.[0]?.address),
        });
        count++;
        bytes += msg.size ?? 0;
      }
    }
    console.log(`  ${box.path.padEnd(28)} → ${box.target.padEnd(8)} ${String(count).padStart(6)} messages  ${mb(bytes)}`);
  } finally {
    lock.release();
  }
}
const total = all.reduce((n, m) => n + m.size, 0);
console.log(`  ${"Total".padEnd(40)} ${String(all.length).padStart(6)} messages  ${mb(total)}`);
console.log("  (Drafts are not imported.)");

if (SCAN_ONLY) {
  await client.logout();
  process.exit(0);
}

const db = new PrismaClient();
const done = new Set(
  (await db.mailMessage.findMany({ where: { source: "titan" }, select: { externalId: true } })).map((m) => m.externalId),
);
const todo = all.filter((m) => !done.has(m.externalId));
if (done.size) console.log(`\n${done.size} messages were already imported and will be skipped.`);
if (!todo.length) {
  console.log("Nothing left to import.");
  await client.logout();
  await db.$disconnect();
  process.exit(0);
}

const go = await ask(`\nImport ${todo.length} messages (${mb(todo.reduce((n, m) => n + m.size, 0))}) into the site's mailbox? (y/N) `);
if (!/^y(es)?$/i.test(go)) {
  console.log("Cancelled. Nothing was imported.");
  await client.logout();
  await db.$disconnect();
  process.exit(0);
}

// Thread everything oldest-first: replies join their parent's thread; "Re:" subjects with the
// same counterpart join too. Existing threads in the database are reused.
const byRfc = new Map(
  (await db.mailMessage.findMany({ where: { rfcMessageId: { not: null } }, select: { rfcMessageId: true, threadKey: true } })).map((m) => [
    m.rfcMessageId,
    m.threadKey,
  ]),
);
const bySubject = new Map();
for (const m of [...all].sort((a, b) => a.date - b.date)) {
  const counterpart = m.target === "sent" ? m.to : m.from;
  const norm = normalizeSubject(m.subject);
  let key = [...ids(m.inReplyTo), ...ids(m.references)].map((r) => byRfc.get(r)).find(Boolean);
  if (!key && norm && norm !== m.subject.trim().toLowerCase()) key = bySubject.get(`${norm}|${counterpart}`);
  key ||= m.rfcMessageId || `t-${randomUUID()}`;
  m.threadKey = key;
  if (m.rfcMessageId && !byRfc.has(m.rfcMessageId)) byRfc.set(m.rfcMessageId, key);
  if (norm) bySubject.set(`${norm}|${counterpart}`, key);
}

// Pass 2: full messages, folder by folder, in batches.
let imported = 0;
let failed = 0;
let skippedFiles = 0;
const started = Date.now();
for (const box of boxes) {
  const mine = todo.filter((m) => m.box === box.path);
  if (!mine.length) continue;
  const byUid = new Map(mine.map((m) => [m.uid, m]));
  const lock = await client.getMailboxLock(box.path, { readOnly: true });
  try {
    for (let i = 0; i < mine.length; i += 25) {
      const batch = mine.slice(i, i + 25).map((m) => m.uid);
      const fetched = [];
      for await (const msg of client.fetch(batch, { uid: true, source: true, flags: true, internalDate: true }, { uid: true })) fetched.push(msg);

      for (const msg of fetched) {
        const meta = byUid.get(msg.uid);
        try {
          const p = await simpleParser(msg.source, { skipImageLinks: true });
          const out = meta.target === "sent";
          const from = addresses(p.from)[0] ?? { address: meta.from || "unknown" };
          const files = (p.attachments ?? []).filter((a) => {
            if (a.size > MAX_ATTACHMENT_BYTES) skippedFiles++;
            return a.size <= MAX_ATTACHMENT_BYTES;
          });
          const html = typeof p.html === "string" ? p.html : null;
          await db.mailMessage.create({
            data: {
              date: p.date ?? meta.date,
              folder: meta.target,
              direction: out ? "out" : "in",
              source: "titan",
              externalId: meta.externalId,
              rfcMessageId: p.messageId ?? meta.rfcMessageId,
              inReplyTo: p.inReplyTo ?? meta.inReplyTo,
              references: Array.isArray(p.references) ? p.references.join(" ") : (p.references ?? meta.references),
              threadKey: meta.threadKey,
              fromAddress: from.address,
              fromName: from.name ?? null,
              to: addresses(p.to),
              cc: addresses(p.cc),
              bcc: addresses(p.bcc),
              replyTo: addresses(p.replyTo),
              subject: p.subject ?? "",
              text: p.text ?? null,
              html,
              snippet: snippetOf(p.text, html),
              read: out || msg.flags?.has("\\Seen") || false,
              starred: msg.flags?.has("\\Flagged") || false,
              hasAttachments: files.some((a) => a.contentDisposition !== "inline"),
              attachments: files.length
                ? {
                    create: files.map((a) => ({
                      filename: a.filename || "attachment",
                      contentType: a.contentType || "application/octet-stream",
                      size: a.size,
                      contentId: a.contentId ? a.contentId.replace(/^<|>$/g, "") : null,
                      inline: a.contentDisposition === "inline" || Boolean(a.related),
                      data: a.content,
                    })),
                  }
                : undefined,
            },
          });
          imported++;
        } catch (err) {
          failed++;
          console.error(`\n  Failed: ${box.path} uid ${msg.uid}: ${err.message}`);
        }
      }
      process.stdout.write(`\r  Imported ${imported} / ${todo.length}${failed ? `, ${failed} failed` : ""}   `);
    }
  } finally {
    lock.release();
  }
}

console.log(`\n\nDone in ${Math.round((Date.now() - started) / 1000)}s: ${imported} imported, ${failed} failed.`);
if (skippedFiles) console.log(`${skippedFiles} attachments over 20 MB were not imported (they stay in Titan).`);
if (failed) console.log("Re-run the import to retry the failed ones.");
await client.logout();
await db.$disconnect();
