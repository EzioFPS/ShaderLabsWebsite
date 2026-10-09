import "server-only";

// Enquiry notifications via Resend (https://resend.com), plain HTTPS: no SMTP, no mailbox password.
// Without a verified domain Resend only delivers to the account's own sign-up address, so sign up
// with the address in CONTACT_TO (mail@shaderlabs.in) or verify shaderlabs.in and set MAIL_FROM.

type EnquiryEmail = {
  id: string;
  name: string;
  email: string;
  company?: string;
  website?: string;
  phone?: string;
  services: string[];
  budget?: string;
  message: string;
  createdAt: Date;
};

type MailResult = { status: "sent" | "skipped" | "failed"; error?: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEnquiryEmail(e: EnquiryEmail): Promise<MailResult> {
  if (!isMailConfigured()) return { status: "skipped", error: "RESEND_API_KEY not set" };

  const rows: [string, string | undefined][] = [
    ["Name", e.name],
    ["Email", e.email],
    ["Company", e.company],
    ["Website", e.website],
    ["Phone / WhatsApp", e.phone],
    ["Services", e.services.length ? e.services.join(", ") : undefined],
    ["Budget (USD)", e.budget],
  ];

  const text = [
    `New enquiry from shaderlabs.in`,
    ``,
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    ``,
    `Message:`,
    e.message,
    ``,
    `Received: ${e.createdAt.toISOString()}`,
    `Reference: ${e.id}`,
    ``,
    `Reply to this email to answer ${e.name} directly.`,
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#111">
    <div style="background:#0b0b0a;color:#ededE8;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c6ff3d">Shader Labs · New enquiry</div>
      <div style="font-size:22px;font-weight:bold;margin-top:6px">${esc(e.name)}${e.company ? ` · ${esc(e.company)}` : ""}</div>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:0;padding:20px 24px;border-radius:0 0 12px 12px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows
          .filter(([, v]) => v)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 0;color:#666;width:150px;vertical-align:top">${k}</td><td style="padding:6px 0">${esc(v!)}</td></tr>`,
          )
          .join("")}
      </table>
      <div style="margin-top:16px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">Message</div>
      <div style="margin-top:6px;white-space:pre-wrap;font-size:15px;line-height:1.55">${esc(e.message)}</div>
      <div style="margin-top:20px;font-size:12px;color:#888">Received ${e.createdAt.toUTCString()} · Ref ${e.id}<br>Reply to this email to answer ${esc(e.name)} directly.</div>
    </div>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "Shader Labs Website <onboarding@resend.dev>",
        to: [process.env.CONTACT_TO || "mail@shaderlabs.in"],
        reply_to: e.email,
        subject: `New enquiry: ${e.name}${e.company ? ` (${e.company})` : ""}`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[mail] Resend rejected the enquiry email:", res.status, detail);
      return { status: "failed", error: `Resend ${res.status}: ${detail}`.slice(0, 500) };
    }
    return { status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mail] failed to send enquiry email:", message);
    return { status: "failed", error: message.slice(0, 500) };
  }
}
