import "server-only";
import type { BillingSettings, Invoice, Prisma } from "@prisma/client";
import {
  concatTransformationMatrix,
  PDFDocument,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { db } from "@/lib/db";
import {
  cached,
  clearXflowCache,
  listAll,
  xflow,
  type XAccount,
  type XAddress,
  type XBalance,
  type XDeposit,
  type XPaymentLink,
  type XPayout,
  type XReceivable,
} from "@/lib/xflow";

// ---------- money ----------

export const toCents = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100) || 0;
export const fromCents = (c: number) => (c / 100).toFixed(2);
export const usd = (cents: number, compact = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(cents / 100);
export const inr = (cents: number, compact = false) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(cents / 100);

export type LineItem = { description: string; quantity: number; unitCents: number };
export const lineItems = (v: unknown): LineItem[] => (Array.isArray(v) ? (v as LineItem[]) : []);

// Export purpose codes from Xflow's "most commonly used" list that fit a tech studio,
// with the transaction type Xflow pairs each one with.
const PURPOSES: [code: string, label: string, type: "services" | "software"][] = [
  ["P0802", "Software consultancy / implementation", "services"],
  ["P0807", "Off-site software exports", "software"],
  ["P0804", "Repair and maintenance of computer and software", "software"],
  ["P0806", "Other information services", "software"],
  ["P0803", "Database and data processing", "services"],
  ["P1014", "Engineering services", "services"],
  ["P1022", "Other technical services", "services"],
  ["P1006", "Business and management consultancy", "services"],
];
export const PURPOSE_CODES: [string, string][] = PURPOSES.map(([c, l]) => [c, l]);
export const transactionTypeFor = (code: string) => PURPOSES.find(([c]) => c === code)?.[2] ?? "services";

// ---------- settings & numbering ----------

export async function getSettings(): Promise<BillingSettings> {
  return (await db.billingSettings.findUnique({ where: { id: 1 } })) ?? db.billingSettings.create({ data: { id: 1 } });
}

/** Indian financial year (starts 1 April), worked out in IST rather than the server's UTC. */
export const financialYear = (d = new Date()) => {
  const [year, month] = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-").map(Number);
  const y = month >= 4 ? year : year - 1;
  return `${y}-${String(y + 1).slice(2)}`;
};

/** Reserves the next invoice number, e.g. SL/2026-27/001, then 002, 003… Restarts at 001 each April. */
export async function nextInvoiceNumber() {
  const fy = financialYear();
  await getSettings();
  // Conditional updates, so only one request can roll the year over ("2025-26" < "2026-27" as text).
  await db.billingSettings.updateMany({ where: { id: 1, numberYear: null }, data: { numberYear: fy } });
  await db.billingSettings.updateMany({ where: { id: 1, numberYear: { lt: fy } }, data: { numberYear: fy, nextNumber: 1 } });
  // A single atomic increment, so two invoices can never get the same number.
  const s = await db.billingSettings.update({ where: { id: 1 }, data: { nextNumber: { increment: 1 } } });
  return `${s.invoicePrefix}/${s.numberYear ?? fy}/${String(s.nextNumber - 1).padStart(3, "0")}`;
}

// ---------- Xflow data (cached briefly) ----------

const TTL = 60_000;
export const getPartners = () => cached("partners", TTL, () => listAll<XAccount>("/v1/accounts", { type: "partner" }));
export const getReceivables = () => cached("receivables", TTL, () => listAll<XReceivable>("/v1/receivables"));
export const getDeposits = () => cached("deposits", TTL, () => listAll<XDeposit>("/v1/deposits"));
export const getPayouts = () => cached("payouts", TTL, () => listAll<XPayout>("/v1/payouts"));
export const getBalance = () => cached("balance", TTL, () => xflow<XBalance>("/v1/balance"));

/** Live USD→INR payout rate (₹ per $1), or null if Xflow doesn't return one. */
export const getUsdInrRate = () =>
  cached("rate", TTL, async () => {
    try {
      const q = await xflow<Record<string, unknown>>("/v1/quotes", {
        query: { "sell.currency": "USD", "sell.amount": "100.00", "buy.currency": "INR", type: "payout_fx" },
      });
      const buy = (q.buy as { amount?: string } | undefined)?.amount;
      const sell = (q.sell as { amount?: string } | undefined)?.amount;
      if (buy && sell) return Math.abs(Number(buy)) / Math.abs(Number(sell));
      const rate = Number((q.rate ?? q.fx_rate ?? q.exchange_rate) as string);
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    } catch {
      return null;
    }
  });

export const partnerName = (p?: XAccount) => p?.business_details?.legal_name || p?.nickname || "Unknown client";

const isReceived = (d: XDeposit) => d.status === "completed" && d.currency === "USD" && toCents(d.amount) > 0;

/**
 * Which client each payment came from. Xflow books payments to the account's own USD receiving
 * account (not to the client), so a payment is tied to a client through the invoice it settled:
 * the reconciled invoice with the same amount, closest in time. A payment sent straight to a
 * client's own virtual account is tied to that client directly.
 */
export function depositClients(deposits: XDeposit[], receivables: XReceivable[], partnerIds: Set<string>) {
  const out = new Map<string, string>();
  const unused = receivables.filter((r) => toCents(r.amount_reconciled) > 0);
  for (const d of deposits.filter(isReceived).sort((a, b) => a.created - b.created)) {
    const direct = [d.to?.account_id, d.from?.account_id].find((id) => id && partnerIds.has(id));
    if (direct) {
      out.set(d.id, direct);
      continue;
    }
    const cents = toCents(d.amount);
    let best = -1;
    for (let i = 0; i < unused.length; i++) {
      if (toCents(unused[i].amount_reconciled) !== cents) continue;
      if (best < 0 || Math.abs(unused[i].created - d.created) < Math.abs(unused[best].created - d.created)) best = i;
    }
    if (best >= 0) out.set(d.id, unused.splice(best, 1)[0].account_id);
  }
  return out;
}

/**
 * USD received that hasn't been matched to an invoice yet. Payments land in one shared account,
 * so this is the account-wide amount: everything received minus everything already matched.
 */
export function unmatchedFunds(_partnerId: string, deposits: XDeposit[], receivables: XReceivable[]) {
  const paid = deposits.filter(isReceived).reduce((n, d) => n + toCents(d.amount), 0);
  const matched = receivables.reduce((n, r) => n + toCents(r.amount_reconciled), 0);
  return Math.max(0, paid - matched);
}

// ---------- invoice state (what the dashboard shows) ----------

export type InvoiceState = { key: "draft" | "review" | "action" | "awaiting" | "overdue" | "partial" | "ready" | "paid" | "cancelled"; label: string; tone: "good" | "warning" | "critical" | "neutral" };

export function invoiceState(inv: Pick<Invoice, "status" | "dueDate" | "totalCents">, r?: XReceivable, unmatchedCents = 0): InvoiceState {
  if (inv.status === "cancelled" || r?.status === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "neutral" };
  if (!r) return { key: "draft", label: "Draft", tone: "neutral" };
  if (r.status === "input_required" || r.status === "hold") return { key: "action", label: r.status === "hold" ? "On hold at Xflow" : "Xflow needs info", tone: "critical" };
  if (r.status === "draft" || r.status === "verifying") return { key: "review", label: "Xflow reviewing", tone: "neutral" };
  const total = toCents(r.invoice?.amount) || inv.totalCents;
  const done = toCents(r.amount_reconciled);
  // "completed" is Xflow's settled state. The settled amount is after Xflow's fee, so it can be a
  // little under the invoice total; fully reconciled against its maximum also counts as paid.
  const max = toCents(r.amount_maximum_reconcilable);
  if (r.status === "completed" || (done > 0 && (done >= total || (max > 0 && done >= max)))) return { key: "paid", label: "Paid", tone: "good" };
  if (unmatchedCents > 0) return { key: "ready", label: "Payment received", tone: "good" };
  if (done > 0) return { key: "partial", label: "Part paid", tone: "warning" };
  if (inv.dueDate.toISOString().slice(0, 10) < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })) return { key: "overdue", label: "Overdue", tone: "critical" };
  return { key: "awaiting", label: "Awaiting payment", tone: "warning" };
}

// ---------- dashboard ----------

const monthKey = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function lastMonths(n: number) {
  const out: string[] = [];
  const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type Range = "3m" | "6m" | "12m" | "all";

/**
 * Copies Xflow invoices (receivables) that aren't in the dashboard yet: older ones, or ones made
 * in Xflow's own dashboard. Their PDF stays the document uploaded to Xflow.
 */
export async function importFromXflow(receivables: XReceivable[], partners: XAccount[]) {
  const existing = await db.invoice.findMany({ select: { number: true, xflowReceivableId: true } });
  const known = new Set(existing.map((i) => i.xflowReceivableId));
  // Skip ones this dashboard created itself (tagged with our invoice id), even mid-registration.
  const missing = receivables.filter((r) => !known.has(r.id) && r.invoice && !r.metadata?.invoice_id);
  if (!missing.length) return 0;
  const byId = new Map(partners.map((p) => [p.id, p]));
  const taken = new Set(existing.map((i) => i.number));
  const rows: Prisma.InvoiceCreateManyInput[] = [];
  for (const r of missing) {
    const p = byId.get(r.account_id);
    const a = p?.business_details?.physical_address;
    const totalCents = toCents(r.invoice?.amount);
    let number = r.invoice?.reference_number?.trim() || r.id;
    while (taken.has(number)) number = `${number} (Xflow)`;
    taken.add(number);
    const created = new Date(r.created * 1000);
    rows.push({
          number,
          clientAccountId: r.account_id,
          clientName: partnerName(p),
          clientEmail: p?.business_details?.email ?? null,
          clientAddress: a ? [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : null,
          issueDate: r.invoice?.creation_date ? new Date(`${r.invoice.creation_date}T00:00:00Z`) : created,
          dueDate: r.invoice?.due_date ? new Date(`${r.invoice.due_date}T00:00:00Z`) : created,
          currency: r.invoice?.currency ?? r.currency,
          items: [{ description: r.metadata?.description || "As per the attached invoice", quantity: 1, unitCents: totalCents }],
          totalCents,
          purposeCode: (r as { purpose_code?: string }).purpose_code ?? "P0802",
          status: r.status === "cancelled" ? "cancelled" : "registered",
          source: "xflow",
          xflowFileId: r.invoice?.document ?? null,
          xflowReceivableId: r.id,
          createdAt: created,
    });
  }
  // One insert for all of them; anything a parallel request already added is skipped.
  const { count } = await db.invoice.createMany({ data: rows, skipDuplicates: true });
  return count;
}

export async function loadDashboard(range: Range) {
  const [partners, receivables, deposits, payouts, balance, rate] = await Promise.all([
    getPartners(),
    getReceivables(),
    getDeposits(),
    getPayouts(),
    getBalance().catch(() => null),
    getUsdInrRate(),
  ]);
  // A failed import must not take the whole dashboard down; the next load tries again.
  await importFromXflow(receivables, partners).catch((err) => console.error("[billing] import from Xflow failed:", err));
  const invoices = await db.invoice.findMany({ orderBy: { issueDate: "desc" } });
  const byPartner = new Map(partners.map((p) => [p.id, p]));

  const received = deposits.filter((d) => d.status === "completed" && d.currency === "USD" && toCents(d.amount) > 0);
  const settledPayouts = payouts.filter((p) => p.status !== "failed");

  const firstMonth = [...received.map((d) => monthKey(d.created)), ...settledPayouts.map((p) => monthKey(p.created))].sort()[0];
  const monthsSinceFirst = firstMonth ? lastMonths(36).length - Math.max(0, lastMonths(36).indexOf(firstMonth)) : 6;
  const n = range === "3m" ? 3 : range === "6m" ? 6 : range === "12m" ? 12 : Math.max(6, Math.min(36, monthsSinceFirst));
  const months = lastMonths(n);
  const inRange = (ts: number) => monthKey(ts) >= months[0];

  const monthly = months.map((m) => ({
    key: m,
    label: monthLabel(m),
    received: received.filter((d) => monthKey(d.created) === m).reduce((s, d) => s + toCents(d.amount), 0),
    paidOut: settledPayouts.filter((p) => monthKey(p.created) === m).reduce((s, p) => s + toCents(p.amount), 0),
  }));

  const sum = (list: XDeposit[]) => list.reduce((s, d) => s + toCents(d.amount), 0);
  const thisMonth = monthly[monthly.length - 1]?.received ?? 0;
  const lastMonth = monthly[monthly.length - 2]?.received ?? 0;

  // Per-client totals within the range
  const clientOf = depositClients(deposits, receivables, new Set(byPartner.keys()));
  const clientTotals = new Map<string, number>();
  for (const d of received.filter((d) => inRange(d.created))) {
    const id = clientOf.get(d.id) ?? "unknown";
    clientTotals.set(id, (clientTotals.get(id) ?? 0) + toCents(d.amount));
  }
  const byClient = [...clientTotals.entries()]
    .map(([id, cents]) => ({ id, label: partnerName(byPartner.get(id)), value: cents }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Invoices joined with their Xflow receivables
  const rById = new Map(receivables.map((r) => [r.id, r]));
  const rows = invoices.map((inv) => {
    const r = inv.xflowReceivableId ? rById.get(inv.xflowReceivableId) : undefined;
    const funds = r ? unmatchedFunds(r.account_id, deposits, receivables) : 0;
    const state = invoiceState(inv, r, funds);
    const paidCents = r ? toCents(r.amount_reconciled) : 0;
    return { inv, r, state, paidCents, dueCents: state.key === "paid" ? 0 : Math.max(0, inv.totalCents - paidCents) };
  });
  const open = rows.filter((x) => !["paid", "cancelled", "draft"].includes(x.state.key));
  const outstanding = open.reduce((s, x) => s + x.dueCents, 0);
  const overdue = open.filter((x) => x.state.key === "overdue");

  const statusCounts = {
    paid: rows.filter((x) => x.state.key === "paid" || x.state.key === "ready").length,
    awaiting: rows.filter((x) => ["awaiting", "partial", "review"].includes(x.state.key)).length,
    overdue: rows.filter((x) => x.state.key === "overdue" || x.state.key === "action").length,
  };

  const usdIn = (list?: { amount: string; currency: string }[]) => (list ?? []).filter((m) => m.currency === "USD").reduce((s, m) => s + toCents(m.amount), 0);
  const inrIn = (list?: { amount: string; currency: string }[]) => (list ?? []).filter((m) => m.currency === "INR").reduce((s, m) => s + toCents(m.amount), 0);

  return {
    months,
    monthly,
    totals: {
      receivedAll: sum(received),
      receivedRange: sum(received.filter((d) => inRange(d.created))),
      thisMonth,
      lastMonth,
      paidOutAll: settledPayouts.reduce((s, p) => s + toCents(p.amount), 0),
      paidOutRange: settledPayouts.filter((p) => inRange(p.created)).reduce((s, p) => s + toCents(p.amount), 0),
      outstanding,
      overdueCount: overdue.length,
      overdueCents: overdue.reduce((s, x) => s + x.dueCents, 0),
      waitingUsd: usdIn(balance?.pending) + usdIn(balance?.available),
      onTheWayInr: inrIn(balance?.payout_processing),
    },
    rate,
    byClient,
    statusCounts,
    invoices: rows,
    recentDeposits: [...received].sort((a, b) => b.created - a.created).slice(0, 8).map((d) => ({ ...d, client: partnerName(byPartner.get(clientOf.get(d.id) ?? "")) })),
    recentPayouts: [...payouts].sort((a, b) => b.created - a.created).slice(0, 8),
    partnersCount: partners.length,
  };
}

// ---------- receiving bank details & payout destination ----------

/**
 * The USD bank account a client pays into: the client's own virtual account (VBAN) if Xflow
 * made one, otherwise the account-level USD receiving account (e.g. the JPMorgan one on the
 * Xflow home page), which is how Shader Labs' account is set up.
 */
export async function receivingAccount(partnerId: string) {
  const usdActive = (list: XAddress[]) => list.find((a) => a.currency === "USD" && a.status === "activated") ?? null;
  return cached(`receive:${partnerId}`, 10 * TTL, async () => {
    const [own, shared] = await Promise.all([
      listAll<XAddress>("/v1/addresses", { account_id: partnerId, category: "xflow_receive" }, 3).catch(() => [] as XAddress[]),
      listAll<XAddress>("/v1/addresses", { category: "xflow_receive" }, 3).catch(() => [] as XAddress[]),
    ]);
    if (usdActive(own)) return usdActive(own);
    return usdActive(shared.filter((a) => a.linked_id !== partnerId));
  });
}

/** The Indian bank account Xflow pays out to (set up in the Xflow dashboard). Display only. */
export async function payoutAddress() {
  return cached("payout-address", 10 * TTL, async () => {
    const list = await listAll<XAddress>("/v1/addresses", { category: "user_payout" }, 3).catch(() => [] as XAddress[]);
    return list.find((a) => a.status === "activated") ?? null;
  });
}

// ---------- invoice PDF ----------

// Standard PDF fonts only cover Latin-1; swap anything else for a safe character.
const safe = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");

const INK = rgb(0.043, 0.043, 0.039); // site ink #0b0b0a
const TEXT = rgb(0.1, 0.1, 0.095);
const MUTED = rgb(0.45, 0.45, 0.43);
const SOFT = rgb(0.62, 0.62, 0.6);
const LINE = rgb(0.88, 0.88, 0.86);
const PANEL = rgb(0.965, 0.965, 0.955);
const WHITE = rgb(1, 1, 1);
const ON_DARK = rgb(0.93, 0.93, 0.91); // site fg #ededE8
const ON_DARK_MUTED = rgb(0.6, 0.6, 0.57);
const LIME = rgb(0.776, 1, 0.239); // #c6ff3d, used as fills only (never text on white)

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (let word of para.split(/\s+/)) {
      // A single word wider than the column (a long URL or ID) is broken so it can't overrun.
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let k = word.length - 1;
        while (k > 1 && font.widthOfTextAtSize(word.slice(0, k), size) > width) k--;
        if (line) lines.push(line);
        lines.push(word.slice(0, k));
        line = "";
        word = word.slice(k);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The Shader Labs logo on the site's exact geometry (components/Logo.tsx): "SHADER" stretched
 * across the full width, "LABS" below it, and the four-sphere trail filling the rest of that line.
 * `width` is the logo's width in points; (x, top) is its top-left corner.
 */
function drawLogo(page: PDFPage, bold: PDFFont, x: number, top: number, width: number, color = ON_DARK) {
  const VB = { x: 240, y: 270, w: 5380 };
  const s = width / VB.w;
  const px = (svgX: number) => x + (svgX - VB.x) * s;
  const py = (svgY: number) => top - (svgY - VB.y) * s;

  // Text stretched horizontally to the artwork's line widths (like SVG textLength).
  const word = (str: string, svgX: number, baseline: number, length: number) => {
    const size = 1000 * s * 0.98;
    const natural = bold.widthOfTextAtSize(str, size);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(length * s / natural, 0, 0, 1, px(svgX), py(baseline)));
    page.drawText(str, { x: 0, y: 0, size, font: bold, color });
    page.pushOperators(popGraphicsState());
  };
  word("SHADER", 234, 983, 5387);
  word("LABS", 216, 1741, 3575);

  // Spheres: dark trailing three, bright lead, each shaded with a lighter inner disc.
  const R = 374 * s;
  const cy = py(1436);
  const CX = [4457, 4698, 4936, 5170];
  const fills = [
    [rgb(0.08, 0.11, 0.04), rgb(0.17, 0.22, 0.07)],
    [rgb(0.16, 0.21, 0.06), rgb(0.31, 0.4, 0.11)],
    [rgb(0.37, 0.49, 0.11), rgb(0.55, 0.73, 0.16)],
    [rgb(0.5, 0.66, 0.1), LIME],
  ];
  CX.forEach((cxSvg, i) => {
    const cx = px(cxSvg);
    page.drawCircle({ x: cx, y: cy, size: R, color: fills[i][0] });
    page.drawCircle({ x: cx - R * 0.12, y: cy + R * 0.12, size: R * 0.78, color: fills[i][1] });
  });
  const lead = px(CX[3]);
  page.drawCircle({ x: lead - R * 0.22, y: cy + R * 0.24, size: R * 0.42, color: rgb(0.85, 1, 0.42) });
  page.drawEllipse({ x: lead - R * 0.32, y: cy + R * 0.37, xScale: R * 0.25, yScale: R * 0.16, color: rgb(1, 1, 1), opacity: 0.6 });
}

// "Four Thousand US Dollars and Fifty Cents"
function amountInWords(cents: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under1000 = (n: number): string =>
    [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : "", n % 100 < 20 ? ones[n % 100] : [tens[Math.floor((n % 100) / 10)], ones[n % 10]].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" ");
  const words = (n: number) => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    for (const [value, name] of [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"], [1, ""]] as [number, string][]) {
      const chunk = Math.floor(n / value) % 1000;
      if (chunk) parts.push(`${under1000(chunk)}${name ? ` ${name}` : ""}`);
    }
    return parts.join(" ");
  };
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${words(dollars)} US Dollar${dollars === 1 ? "" : "s"}${rest ? ` and ${words(rest)} Cent${rest === 1 ? "" : "s"}` : ""}`;
}

export async function invoicePdf(inv: Invoice, settings: BillingSettings, bank: XAddress | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.number}`);
  pdf.setAuthor(settings.legalName);
  pdf.setSubject(`Invoice ${inv.number} for ${inv.clientName}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;
  const H = 841.89;
  const M = 52; // side margin
  const R = W - M;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const items = lineItems(inv.items);

  let page = pdf.addPage([W, H]);
  const pages: PDFPage[] = [page];
  type T = { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center"; p?: PDFPage };
  const text = (s: string, x: number, y: number, o: T = {}) => {
    const size = o.size ?? 9.5;
    const f = o.f ?? font;
    const str = safe(s);
    const w = f.widthOfTextAtSize(str, size);
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0;
    (o.p ?? page).drawText(str, { x: x + dx, y, size, font: f, color: o.color ?? TEXT });
    return w;
  };
  const label = (s: string, x: number, y: number, o: T = {}) => text(s.toUpperCase(), x, y, { size: 7, f: bold, color: SOFT, ...o });
  const rule = (y: number, x1 = M, x2 = R, color = LINE, t = 0.7) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });

  // ---------- header band ----------
  const bandH = 168;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: INK });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: LIME });
  drawLogo(page, bold, M, H - 38, 128);
  text("Invoice", R, H - 66, { size: 30, f: bold, color: WHITE, align: "right" });
  text(inv.number, R, H - 86, { size: 10, color: ON_DARK_MUTED, align: "right" });

  // amount due strip inside the band
  const stripY = H - bandH + 30;
  label("Amount due", M, stripY + 26, { color: ON_DARK_MUTED });
  text(`${usd(inv.totalCents)} ${inv.currency}`, M, stripY, { size: 22, f: bold, color: WHITE });
  label("Due date", R - 150, stripY + 26, { color: ON_DARK_MUTED });
  text(fmtDate(inv.dueDate), R - 150, stripY + 4, { size: 12, f: bold, color: WHITE });
  label("Issued", R, stripY + 26, { color: ON_DARK_MUTED, align: "right" });
  text(fmtDate(inv.issueDate), R, stripY + 4, { size: 12, f: bold, color: WHITE, align: "right" });

  // ---------- parties ----------
  let y = H - bandH - 44;
  const colW = (R - M - 40) / 2;
  label("Billed to", M, y);
  label("From", M + colW + 40, y);
  y -= 16;
  const toLines = [
    inv.clientName,
    inv.clientTaxId ? `Tax ID: ${inv.clientTaxId}` : "",
    ...(inv.clientAddress ? wrap(inv.clientAddress, font, 9.5, colW) : []),
    inv.clientEmail ?? "",
  ].filter(Boolean);
  const fromLines = [
    settings.legalName,
    ...wrap(settings.address, font, 9.5, colW),
    settings.email,
    [settings.gstin ? `GSTIN ${settings.gstin}` : "", settings.pan ? `PAN ${settings.pan}` : ""].filter(Boolean).join("   "),
    settings.cin ? `CIN ${settings.cin}` : "",
  ].filter(Boolean);
  toLines.forEach((l, i) => text(l, M, y - i * 13.5, { size: i === 0 ? 11 : 9.5, f: i === 0 ? bold : font, color: i === 0 ? TEXT : MUTED }));
  fromLines.forEach((l, i) => text(l, M + colW + 40, y - i * 13.5, { size: i === 0 ? 11 : 9.5, f: i === 0 ? bold : font, color: i === 0 ? TEXT : MUTED }));
  y -= Math.max(toLines.length, fromLines.length) * 13.5 + 30;

  // ---------- items ----------
  const col = { no: M, desc: M + 26, qty: R - 200, rate: R - 104, amt: R };
  const tableHeader = (yy: number) => {
    label("No.", col.no, yy);
    label("Item and description", col.desc, yy);
    label("Qty", col.qty, yy, { align: "right" });
    label("Price (USD)", col.rate, yy, { align: "right" });
    label("Amount (USD)", col.amt, yy, { align: "right" });
    rule(yy - 9, M, R, INK, 1);
    return yy - 28;
  };
  y = tableHeader(y);

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: LIME });
    text(`Invoice ${inv.number} (continued)`, M, H - 50, { size: 10, f: bold });
    return tableHeader(H - 86);
  };

  for (const [n, item] of items.entries()) {
    const lines = wrap(item.description, font, 10, col.qty - col.desc - 50);
    const rowH = lines.length * 14 + 14;
    if (y - rowH < 230) y = newPage();
    text(String(n + 1), col.no, y, { size: 10, color: SOFT });
    lines.forEach((l, i) => text(l, col.desc, y - i * 14, { size: 10, color: TEXT }));
    text(String(item.quantity), col.qty, y, { size: 10, color: MUTED, align: "right" });
    text(`${usd(item.unitCents)}/unit`, col.rate, y, { size: 10, color: MUTED, align: "right" });
    text(usd(Math.round(item.unitCents * item.quantity)), col.amt, y, { size: 10, f: bold, align: "right" });
    y -= rowH;
    rule(y + 9);
  }

  // ---------- totals (notes sit to their left) ----------
  if (y < 250) y = newPage();
  y -= 8;
  const tx = R - 210;
  if (inv.notes) {
    label("Notes", M, y);
    wrap(inv.notes, font, 9.5, tx - 14 - M - 24)
      .slice(0, 6)
      .forEach((l, i) => text(l, M, y - 16 - i * 13.5, { size: 9.5, color: TEXT }));
  }
  text("Subtotal", tx, y, { size: 9.5, color: MUTED });
  text(usd(inv.totalCents), R, y, { size: 9.5, align: "right" });
  y -= 16;
  text("Tax", tx, y, { size: 9.5, color: MUTED });
  text(settings.lutNumber ? "0.00 (export under LUT)" : "0.00", R, y, { size: 9.5, color: MUTED, align: "right" });
  y -= 14;
  page.drawRectangle({ x: tx - 14, y: y - 30, width: R - tx + 14, height: 38, color: PANEL });
  page.drawRectangle({ x: tx - 14, y: y - 30, width: 3, height: 38, color: LIME });
  text("Total due", tx, y - 16, { size: 10, f: bold });
  text(`${usd(inv.totalCents)} ${inv.currency}`, R - 10, y - 17, { size: 14, f: bold, align: "right" });
  y -= 48;
  text(`Total amount in words: ${amountInWords(inv.totalCents)}`, R, y, { size: 8.5, color: MUTED, align: "right" });
  y -= 26;

  // ---------- how to pay ----------
  // Bank details from Billing → Settings, falling back to what Xflow reports for the account.
  const b = bank?.bank_account;
  const bankRows = {
    left: [
      ["Beneficiary", settings.legalName],
      ["Account number", settings.bankAccountNumber || b?.number || ""],
      ["Account type", settings.bankAccountType || ""],
      ["Bank name", settings.bankName || (b as { bank_name?: string } | null | undefined)?.bank_name || ""],
    ].filter(([, v]) => v),
    right: [
      ["SWIFT / BIC (international)", settings.bankSwift || b?.global_wire || ""],
      ["ACH routing (US local)", settings.bankAchRouting || b?.domestic_credit || ""],
      ["Wire routing (US local)", b?.domestic_wire && b.domestic_wire !== (settings.bankAchRouting || b?.domestic_credit) ? b.domestic_wire : ""],
    ].filter(([, v]) => v),
  };
  const hasBank = bankRows.left.length > 1 && (bankRows.right.length > 0 || Boolean(settings.bankAccountNumber || b?.number));
  const bankAddrLines = settings.bankAddress ? wrap(settings.bankAddress, font, 9, (R - M) / 2 - 30) : [];
  const bankRowsH = Math.max(bankRows.left.length * 26, bankRows.right.length * 26 + (bankAddrLines.length ? 14 + bankAddrLines.length * 12 : 0));
  // Heading + optional pay button + bank panel + reference line; the footer starts at 78pt.
  const payH = 22 + (inv.paymentLinkUrl ? 36 : 0) + (hasBank ? bankRowsH + 52 : 18);
  if (y - payH < 88) {
    y = newPage();
    y -= 10;
  }
  label("How to pay", M, y);
  y -= 18;
  if (inv.paymentLinkUrl) {
    const btnW = bold.widthOfTextAtSize("Pay online", 10) + 32;
    page.drawRectangle({ x: M, y: y - 9, width: btnW, height: 24, color: LIME });
    text("Pay online", M + 16, y - 1, { size: 10, f: bold, color: INK });
    text(inv.paymentLinkUrl, M + btnW + 12, y - 1, { size: 9, color: MUTED });
    page.node.addAnnot(
      pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [M, y - 9, M + btnW, y + 15],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(inv.paymentLinkUrl) },
        }),
      ),
    );
    y -= 36;
  }
  if (hasBank) {
    // Panel with two columns of label-over-value pairs.
    const top = y + 6;
    page.drawRectangle({ x: M, y: top - bankRowsH - 34, width: R - M, height: bankRowsH + 34, color: PANEL });
    page.drawRectangle({ x: M, y: top - bankRowsH - 34, width: 3, height: bankRowsH + 34, color: LIME });
    text(inv.paymentLinkUrl ? "Or pay by bank transfer" : "Bank transfer details", M + 16, top - 18, { size: 10, f: bold });
    const half = (R - M) / 2;
    const pair = (k: string, v: string, x: number, yy: number) => {
      text(k, x, yy, { size: 7.5, color: MUTED });
      text(v, x, yy - 11.5, { size: 10, f: bold });
    };
    let ly = top - 38;
    for (const [k, v] of bankRows.left) {
      pair(k, v, M + 16, ly);
      ly -= 26;
    }
    let ry = top - 38;
    for (const [k, v] of bankRows.right) {
      pair(k, v, M + half + 10, ry);
      ry -= 26;
    }
    if (bankAddrLines.length) {
      text("Bank address", M + half + 10, ry, { size: 7.5, color: MUTED });
      bankAddrLines.forEach((l, i) => text(l, M + half + 10, ry - 11.5 - i * 12, { size: 9, color: TEXT }));
    }
    y = top - bankRowsH - 50;
  } else if (!inv.paymentLinkUrl) {
    text("Payment details will be shared separately.", M, y, { size: 9.5, color: MUTED });
    y -= 16;
  }
  text(`Please use ${inv.number} as the payment reference.`, M, y - 2, { size: 9, color: MUTED });
  y -= 30;


  // ---------- footer on every page ----------
  const foot = [
    settings.lutNumber ? `Supply meant for export of services under LUT without payment of IGST (LUT ${settings.lutNumber}).` : "",
    settings.footerNote ?? "",
  ].filter(Boolean);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 78 }, end: { x: R, y: 78 }, thickness: 0.7, color: LINE });
    foot.forEach((l, k) => text(l, M, 62 - k * 12, { size: 8, color: MUTED, p }));
    text("This is a computer-generated invoice and needs no signature.", M, 62 - foot.length * 12, { size: 8, color: SOFT, p });
    text(`${settings.legalName} · ${settings.email}`, R, 36, { size: 7.5, color: SOFT, align: "right", p });
    text(`Page ${i + 1} of ${pages.length}`, M, 36, { size: 7.5, color: SOFT, p });
  });

  return Buffer.from(await pdf.save());
}

// ---------- Xflow actions ----------

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Uploads the invoice PDF to Xflow, creates the receivable and submits it for verification. */
export async function registerWithXflow(inv: Invoice) {
  // If an earlier attempt created the receivable but didn't finish (timeout, closed tab), adopt it.
  clearXflowCache();
  const existing = (await getReceivables()).find((r) => r.metadata?.invoice_id === inv.id && r.status !== "cancelled");
  if (existing) {
    if (existing.status === "draft") await xflow(`/v1/receivables/${existing.id}/confirm`, { method: "POST", body: {} }).catch(() => {});
    return db.invoice.update({ where: { id: inv.id }, data: { status: "registered", xflowFileId: existing.invoice?.document ?? null, xflowReceivableId: existing.id } });
  }
  const [settings, bank] = await Promise.all([getSettings(), receivingAccount(inv.clientAccountId)]);
  const pdfBytes = await invoicePdf(inv, settings, bank);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), `${inv.number.replace(/\//g, "-")}.pdf`);
  form.append("payload", JSON.stringify({ purpose: "finance_document" }));
  const file = await xflow<{ id: string }>("/v1/files", { form });

  const amount = fromCents(inv.totalCents);
  const receivable = await xflow<XReceivable>("/v1/receivables", {
    body: {
      account_id: inv.clientAccountId,
      amount_maximum_reconcilable: amount,
      currency: "USD",
      description: `Invoice ${inv.number}`,
      invoice: { amount, creation_date: ymd(inv.issueDate), currency: "USD", document: file.id, due_date: ymd(inv.dueDate), reference_number: inv.number },
      purpose_code: inv.purposeCode,
      transaction_type: transactionTypeFor(inv.purposeCode),
      metadata: { invoice_id: inv.id },
    },
  });
  await xflow(`/v1/receivables/${receivable.id}/confirm`, { method: "POST", body: {} }).catch((err) => {
    // Keep the receivable even if confirming needs more info; the dashboard shows Xflow's message.
    console.error("[billing] confirm failed:", err);
  });
  return db.invoice.update({ where: { id: inv.id }, data: { status: "registered", xflowFileId: file.id, xflowReceivableId: receivable.id } });
}

export async function createPaymentLink(inv: Invoice) {
  if (!inv.xflowReceivableId) throw new Error("Register the invoice with Xflow first.");
  const link = await xflow<XPaymentLink>("/v1/payment_links", {
    body: { account_id: inv.clientAccountId, receivable_ids: [inv.xflowReceivableId], type: "receivable" },
  });
  return db.invoice.update({ where: { id: inv.id }, data: { paymentLinkId: link.id, paymentLinkUrl: link.link } });
}

// Withdrawing = reconciling: received money is matched to the invoice and Xflow pays it out
// automatically to the bank account set up in the Xflow dashboard (INR, about T+1).

export async function previewWithdrawal(receivableId: string, amountCents: number) {
  return xflow<Record<string, unknown>>(`/v1/receivables/${receivableId}/reconcile/preview`, {
    body: { amount: fromCents(amountCents) },
  });
}

export async function withdraw(receivableId: string, amountCents: number) {
  return xflow<Record<string, unknown>>(`/v1/receivables/${receivableId}/reconcile`, {
    body: { amount: fromCents(amountCents) },
  });
}

export async function cancelReceivable(receivableId: string) {
  return xflow(`/v1/receivables/${receivableId}/cancel`, { method: "POST", body: {} });
}

/** Test mode only: pretend the client paid, so the flow can be tried without real money. */
export async function simulatePayment(inv: Invoice, amountCents: number) {
  const to = await receivingAccount(inv.clientAccountId);
  return xflow<XDeposit>("/v1/deposits", {
    body: {
      amount: fromCents(amountCents),
      currency: "USD",
      from: { account_id: inv.clientAccountId },
      payment_method: "domestic_credit",
      statement_descriptor: `Payment for ${inv.number}`,
      to: { account_id: inv.clientAccountId, ...(to ? { address_id: to.id } : {}) },
    },
  });
}

export async function createClient(input: { name: string; email: string; line1: string; city: string; state: string; postalCode: string; country: string }) {
  const account = await xflow<XAccount>("/v1/accounts", {
    body: {
      type: "partner",
      nickname: input.name.slice(0, 60),
      business_details: {
        legal_name: input.name,
        email: input.email,
        type: "company",
        physical_address: { line1: input.line1, city: input.city, state: input.state || undefined, postal_code: input.postalCode, country: input.country },
      },
    },
  });
  // Xflow verifies and activates new clients itself, then creates their USD virtual account.
  return account;
}
