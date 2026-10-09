import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestReceivedEmail } from "@/lib/mailbox";

// Resend webhook (event: email.received). Signed with Svix: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" using the base64 secret after "whsec_".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLERANCE_S = 5 * 60;

function verify(body: string, h: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = h.get("svix-id");
  const ts = h.get("svix-timestamp");
  const sigs = h.get("svix-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET) return new Response("Webhook not configured", { status: 503 });
  const body = await req.text();
  if (!verify(body, req.headers)) return new Response("Invalid signature", { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ ignored: true });

  try {
    await ingestReceivedEmail(event.data.email_id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[mail inbound] failed:", err);
    // Non-2xx makes Resend retry; the inbox page also catches up on its own.
    return new Response("Ingest failed", { status: 500 });
  }
}
