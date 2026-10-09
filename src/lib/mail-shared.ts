// Mailbox types and helpers shared by the server and the inbox UI in the browser.

export const MAILBOX_ADDRESS = "mail@shaderlabs.in";
export const FOLDERS = ["inbox", "starred", "sent", "archive", "spam", "trash"] as const;
export type Folder = (typeof FOLDERS)[number];
export const FOLDER_LABELS: Record<Folder, string> = { inbox: "Inbox", starred: "Starred", sent: "Sent", archive: "Archive", spam: "Spam", trash: "Trash" };
export const MOVE_TARGETS = ["inbox", "archive", "spam", "trash"] as const;

export type Address = { name?: string; address: string };

/** One row of the conversation list. */
export type ThreadSummary = {
  threadKey: string;
  date: string;
  direction: string;
  fromAddress: string;
  fromName: string | null;
  to: Address[];
  subject: string;
  snippet: string;
  count: number;
  unread: boolean;
  starred: boolean;
  files: boolean;
};

/** One message of an open conversation (HTML already has cid: images inlined). */
export type ThreadMessage = {
  id: string;
  date: string;
  direction: string;
  folder: string;
  fromAddress: string;
  fromName: string | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  subject: string;
  text: string | null;
  html: string | null;
  snippet: string;
  read: boolean;
  starred: boolean;
  attachments: { id: string; filename: string; size: number; inline: boolean; contentId: string | null }[];
};

export type ComposeMode = "new" | "reply" | "replyall" | "forward";
export type ComposeInit = {
  mode: ComposeMode;
  refId?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  forwardedFiles?: string[];
};

export const formatAddress = (a: Address) => (a.name ? `${a.name} <${a.address}>` : a.address);

const TZ = "Asia/Kolkata";
export const longDate = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });

export function shortDate(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const day = (x: Date) => x.toLocaleDateString("en-IN", { timeZone: TZ });
  if (day(date) === day(now)) return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const year = (x: Date) => x.toLocaleDateString("en-IN", { year: "numeric", timeZone: TZ });
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year(date) === year(now) ? {} : { year: "numeric" }), timeZone: TZ });
}

/** Pre-fills a reply, reply-all or forward from a conversation. */
export function buildCompose(mode: Exclude<ComposeMode, "new">, messages: ThreadMessage[]): ComposeInit {
  const last = messages[messages.length - 1];
  const ref = mode === "forward" ? last : ([...messages].reverse().find((m) => m.direction === "in") ?? last);
  const from = ref.fromName ? `${ref.fromName} <${ref.fromAddress}>` : ref.fromAddress;

  if (mode === "forward") {
    return {
      mode,
      refId: ref.id,
      subject: /^fwd?:/i.test(ref.subject) ? ref.subject : `Fwd: ${ref.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${longDate(ref.date)}\nSubject: ${ref.subject}\nTo: ${ref.to
        .map(formatAddress)
        .join(", ")}\n\n${ref.text || ref.snippet}`,
      forwardedFiles: ref.attachments.filter((a) => !a.inline).map((a) => a.filename),
    };
  }

  const targets = ref.direction === "out" ? ref.to : ref.replyTo.length ? ref.replyTo : [{ name: ref.fromName ?? undefined, address: ref.fromAddress }];
  const to = targets.filter((a) => a.address !== MAILBOX_ADDRESS);
  const cc =
    mode === "replyall" ? [...ref.to, ...ref.cc].filter((a) => a.address !== MAILBOX_ADDRESS && !to.some((t) => t.address === a.address)) : [];
  const quoted = (ref.text || ref.snippet || "")
    .trim()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return {
    mode,
    refId: ref.id,
    to: to.map(formatAddress).join(", "),
    cc: cc.map(formatAddress).join(", "),
    subject: /^re:/i.test(ref.subject.trim()) ? ref.subject : `Re: ${ref.subject}`,
    body: `\n\nOn ${longDate(ref.date)}, ${from} wrote:\n${quoted}`,
  };
}
