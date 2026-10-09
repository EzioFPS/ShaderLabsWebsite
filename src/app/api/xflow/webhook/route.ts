import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BANK_FEE_TOLERANCE_CENTS, getFxQuote, getReceivables, inr, liveRate, partnerName, toCents, usd } from "@/lib/billing";
import { db } from "@/lib/db";
import { notifyAll, type PushMessage } from "@/lib/push";
import { clearXflowCache, xflow, type XAccount, type XDeposit, type XPayout, type XReceivable } from "@/lib/xflow";

// Xflow webhook: money arriving, invoices approved or stuck, payouts reaching the bank.
// Each one becomes a phone notification (the same devices as the mail app) and refreshes Billing.
// Signed like Svix: HMAC-SHA256 over "<Webhook-Id>.<Webhook-Timestamp>.<raw body>",
// Webhook-Signature is a space-separated list of "v1,<base64>".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLERANCE_S = 5 * 60;

// Xflow's secrets look like "webhook_secret_…"; the key may be the whole string or the part after
// the prefix (raw or base64), so all three are tried.
function keysFor(secret: string) {
  const rest = secret.replace(/^webhook_secret_/, "").replace(/^whsec_/, "");
  const keys = [Buffer.from(secret), Buffer.from(rest)];
  if (/^[A-Za-z0-9+/=]+$/.test(rest)) keys.push(Buffer.from(rest, "base64"));
  return keys;
}

function verify(body: string, h: Headers) {
  const secret = process.env.XFLOW_WEBHOOK_SECRET;
  const id = h.get("webhook-id");
  const ts = h.get("webhook-timestamp");
  const sigs = h.get("webhook-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) return false;
  const given = sigs
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version, sig]) => version === "v1" && sig)
    .map(([, sig]) => Buffer.from(sig, "base64"));
  return keysFor(secret).some((key) => {
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
}

type XEvent = { id: string; type: string; linked_id: string; linked_object: string; created: number; livemode: boolean };

async function clientName(accountId?: string) {
  if (!accountId) return null;
  const a = await xflow<XAccount>(`/v1/accounts/${accountId}`).catch(() => null);
  return a && a.type === "partner" ? partnerName(a) : null;
}

/**
 * Who a payment is from. Payments land in the account's own USD account, so when the sender isn't
 * a client the open invoice it can settle (same amount, give or take the bank's fee) tells us.
 */
async function payer(d: XDeposit) {
  const direct = (await clientName(d.from?.account_id)) ?? (await clientName(d.to?.account_id));
  if (direct) return direct;
  const cents = toCents(d.amount);
  const open = (await getReceivables().catch(() => [] as XReceivable[])).filter((r) => r.status === "activated" && toCents(r.amount_reconcilable) > 0);
  const match = open.find((r) => {
    const gap = toCents(r.amount_reconcilable) - cents;
    return gap >= 0 && gap <= BANK_FEE_TOLERANCE_CENTS;
  });
  return match ? clientName(match.account_id) : null;
}

/** The notification for an event, or null for events that don't need one. */
async function messageFor(e: XEvent): Promise<PushMessage | null> {
  const billing = "/admin/billing";
  switch (e.type) {
    case "deposit.status.completed": {
      const d = await xflow<XDeposit>(`/v1/deposits/${e.linked_id}`);
      const cents = toCents(d.amount);
      const [quote, from] = await Promise.all([getFxQuote(cents), payer(d)]);
      return {
        title: `${usd(cents)} received${from ? ` from ${from}` : ""}`,
        body: quote ? `≈ ${inr(quote.inrCents)} at Xflow's live rate (₹${quote.rate.toFixed(2)}). Ready to withdraw in Billing.` : "Ready to withdraw in Billing.",
        url: billing,
        tag: `deposit-${d.id}`,
      };
    }
    case "payout.status.settled": {
      const p = await xflow<XPayout>(`/v1/payouts/${e.linked_id}`);
      return { title: `${p.currency === "INR" ? inr(toCents(p.amount)) : usd(toCents(p.amount))} reached your bank`, body: "Xflow's payout has settled.", url: billing, tag: `payout-${p.id}` };
    }
    case "payout.status.failed":
    case "payout.status.hold": {
      const p = await xflow<XPayout>(`/v1/payouts/${e.linked_id}`);
      const what = e.type.endsWith("failed") ? "failed" : "is on hold";
      return { title: `Payout ${what}`, body: `${p.currency === "INR" ? inr(toCents(p.amount)) : usd(toCents(p.amount))}. Check Xflow for details.`, url: billing, tag: `payout-${p.id}` };
    }
    case "receivable.status.activated":
    case "receivable.status.input_required":
    case "receivable.status.hold":
    case "receivable.status.completed": {
      const r = await xflow<XReceivable>(`/v1/receivables/${e.linked_id}`);
      const inv = await db.invoice.findFirst({ where: { xflowReceivableId: r.id }, select: { id: true, number: true } });
      const name = inv?.number ?? r.invoice?.reference_number?.trim() ?? "An invoice";
      const url = inv ? `/admin/billing/invoices/${inv.id}` : billing;
      const text: Record<string, [string, string]> = {
        "receivable.status.activated": [`${name} approved by Xflow`, "It can now be paid, and withdrawn once the money arrives."],
        "receivable.status.input_required": [`Xflow needs info on ${name}`, r.system_message?.[0]?.message ?? "Open the invoice to see what's needed."],
        "receivable.status.hold": [`${name} is on hold at Xflow`, r.system_message?.[0]?.message ?? "Open the invoice for details."],
        "receivable.status.completed": [`${name} completed`, "Fully settled in Xflow."],
      };
      const [title, body] = text[e.type];
      return { title, body, url, tag: `receivable-${r.id}` };
    }
    default:
      return null;
  }
}

export async function POST(req: Request) {
  if (!process.env.XFLOW_WEBHOOK_SECRET) return new Response("Webhook not configured", { status: 503 });
  const body = await req.text();
  if (!verify(body, req.headers)) return new Response("Invalid signature", { status: 401 });

  let event: XEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event?.id || !event.type) return new Response("Bad event", { status: 400 });

  // Xflow can deliver an event more than once; only the first delivery does anything.
  const first = await db.xflowEvent
    .create({ data: { id: event.id, type: event.type } })
    .then(() => true)
    .catch((err: { code?: string }) => {
      if (err?.code === "P2002") return false;
      throw err;
    });
  if (!first) return Response.json({ duplicate: true });

  try {
    clearXflowCache();
    const message = await messageFor(event);
    if (message) await notifyAll(message);
    await liveRate().catch(() => null); // a fresh point for the rate chart
    revalidatePath("/admin/billing", "layout");
    revalidatePath("/admin");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[xflow webhook] failed:", event.type, err);
    // Let Xflow retry later: forget this delivery so the retry is handled.
    await db.xflowEvent.delete({ where: { id: event.id } }).catch(() => {});
    return new Response("Handler failed", { status: 500 });
  }
}
