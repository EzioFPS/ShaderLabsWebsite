"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import {
  cancelReceivable,
  createClient,
  BANK_FEE_TOLERANCE_CENTS,
  completeReceivable,
  createPaymentLink,
  financialYear,
  getDeposits,
  getFxQuote,
  getPartners,
  getReceivables,
  getSettings,
  invoicePdf,
  nextInvoiceNumber,
  partnerName,
  payoutAddress,
  previewWithdrawal,
  receivingAccount,
  registerWithXflow,
  simulatePayment,
  toCents,
  unmatchedFunds,
  usd,
  withdraw,
  type FxQuote,
  type LineItem,
} from "@/lib/billing";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailbox";
import { clearXflowCache, xflowTestMode } from "@/lib/xflow";

export type ActionResult = { ok?: boolean; error?: string; message?: string };

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}
const fail = (err: unknown): ActionResult => ({ error: err instanceof Error ? err.message : String(err) });
const done = (path: string, message?: string): ActionResult => {
  clearXflowCache();
  revalidatePath("/admin/billing", "layout");
  revalidatePath(path);
  return { ok: true, message };
};

// ---------- invoices ----------

export async function createInvoiceAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await guard();
  const clientAccountId = String(form.get("client") ?? "");
  const issueDate = new Date(String(form.get("issueDate") ?? ""));
  const dueDate = new Date(String(form.get("dueDate") ?? ""));
  const purposeCode = String(form.get("purposeCode") ?? "P0802");
  const notes = String(form.get("notes") ?? "").trim() || null;
  const clientTaxId = String(form.get("clientTaxId") ?? "").trim() || null;
  let items: LineItem[] = [];
  try {
    items = (JSON.parse(String(form.get("items") ?? "[]")) as LineItem[])
      .map((i) => ({ description: String(i.description).trim(), quantity: Number(i.quantity), unitCents: Math.round(Number(i.unitCents)) }))
      .filter((i) => i.description && i.quantity > 0 && i.unitCents > 0);
  } catch {}

  if (!clientAccountId) return { error: "Choose a client." };
  if (!items.length) return { error: "Add at least one line item with a description, quantity and price." };
  if (isNaN(issueDate.getTime()) || isNaN(dueDate.getTime())) return { error: "Set the issue and due dates." };
  if (dueDate < issueDate) return { error: "The due date can't be before the issue date." };

  let client;
  try {
    client = (await getPartners()).find((p) => p.id === clientAccountId);
  } catch (err) {
    return fail(err);
  }
  if (!client) return { error: "That client wasn't found in Xflow." };
  const a = client.business_details?.physical_address;
  const totalCents = items.reduce((s, i) => s + Math.round(i.unitCents * i.quantity), 0);

  let inv;
  for (let attempt = 0; ; attempt++) {
    try {
      inv = await db.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      clientAccountId,
      clientName: partnerName(client),
      clientEmail: client.business_details?.email ?? null,
      clientAddress: a ? [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : null,
      clientTaxId,
      issueDate,
      dueDate,
      items,
      totalCents,
      notes,
      purposeCode,
    },
      });
      break;
    } catch (err) {
      // A number already taken (e.g. the counter was set by hand): take the next one.
      if (attempt < 2 && (err as { code?: string }).code === "P2002") continue;
      return fail(err);
    }
  }
  redirect(`/admin/billing/invoices/${inv.id}`);
}

async function loadInvoice(id: string) {
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) throw new Error("Invoice not found.");
  return inv;
}

export async function registerAction(id: string): Promise<ActionResult> {
  await guard();
  try {
    const inv = await loadInvoice(id);
    if (inv.xflowReceivableId) return { error: "Already registered with Xflow." };
    await registerWithXflow(inv);
    return done(`/admin/billing/invoices/${id}`, "Registered with Xflow and sent for verification.");
  } catch (err) {
    return fail(err);
  }
}

export async function paymentLinkAction(id: string): Promise<ActionResult> {
  await guard();
  try {
    const inv = await loadInvoice(id);
    if (inv.paymentLinkUrl) return { error: "This invoice already has a payment link." };
    await createPaymentLink(inv);
    return done(`/admin/billing/invoices/${id}`, "Payment link created.");
  } catch (err) {
    return fail(err);
  }
}

export async function emailInvoiceAction(id: string, to: string): Promise<ActionResult> {
  await guard();
  try {
    const inv = await loadInvoice(id);
    const address = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "Enter a valid email address." };
    const [settings, bank] = await Promise.all([getSettings(), receivingAccount(inv.clientAccountId)]);
    const pdf = await invoicePdf(inv, settings, bank);
    const due = inv.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const text = [
      `Hi ${inv.clientName},`,
      ``,
      `Please find attached invoice ${inv.number} for ${usd(inv.totalCents)} USD, due on ${due}.`,
      inv.paymentLinkUrl ? `\nYou can pay online here: ${inv.paymentLinkUrl}` : "",
      bank?.bank_account?.number ? `\nOr by bank transfer to the account details on the invoice, quoting ${inv.number} as the reference.` : "",
      ``,
      `Thank you,`,
      `Shader Labs`,
    ]
      .filter((l) => l !== "")
      .join("\n");
    await sendMail({
      to: [{ name: inv.clientName, address }],
      cc: [],
      bcc: [],
      subject: `Invoice ${inv.number} from Shader Labs`,
      text,
      attachments: [{ filename: `${inv.number.replace(/\//g, "-")}.pdf`, contentType: "application/pdf", data: pdf }],
    });
    await db.invoice.update({ where: { id }, data: { sentAt: new Date(), sentTo: address } });
    revalidatePath("/admin/mail");
    return done(`/admin/billing/invoices/${id}`, `Emailed to ${address}. A copy is in Mail → Sent.`);
  } catch (err) {
    return fail(err);
  }
}

export type WithdrawPreview = {
  error?: string;
  amountCents?: number;
  availableCents?: number; // everything received in Xflow and not yet withdrawn
  invoiceLeftCents?: number; // what this invoice can still take
  quote?: FxQuote | null;
  bank?: string;
  details?: Record<string, unknown>;
};

/** A fresh live rate for the withdrawal screen (quotes are only valid for about a minute). */
export async function fxQuoteAction(usdCents: number): Promise<FxQuote | null> {
  await guard();
  if (!Number.isInteger(usdCents) || usdCents <= 0) return null;
  return getFxQuote(usdCents);
}

export async function previewWithdrawAction(id: string): Promise<WithdrawPreview> {
  await guard();
  clearXflowCache(); // money checks always use fresh numbers from Xflow
  try {
    const inv = await loadInvoice(id);
    if (!inv.xflowReceivableId) return { error: "Register the invoice with Xflow first." };
    const [receivables, deposits, address] = await Promise.all([getReceivables(), getDeposits(), payoutAddress()]);
    const r = receivables.find((x) => x.id === inv.xflowReceivableId);
    if (!r) return { error: "This invoice wasn't found in Xflow." };
    if (r.status !== "activated") return { error: "Xflow hasn't approved this invoice yet. Withdrawals open once its status is activated." };
    // Never more than is actually sitting in Xflow (e.g. $3,950 after the bank's fee on a $4,000 invoice).
    const availableCents = unmatchedFunds(r.account_id, deposits, receivables);
    const invoiceLeftCents = toCents(r.amount_reconcilable);
    const amountCents = Math.min(invoiceLeftCents, availableCents);
    if (amountCents <= 0) return { error: "There's no received money waiting to be withdrawn against this invoice yet." };
    const [details, quote] = await Promise.all([previewWithdrawal(r.id, amountCents).catch(() => undefined), getFxQuote(amountCents)]);
    const bank = address ? [address.name, address.bank_account?.last4 ? `account ending ${address.bank_account.last4}` : ""].filter(Boolean).join(" · ") : "";
    return { amountCents, availableCents, invoiceLeftCents, quote, bank, details };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** After withdrawing, closes an invoice whose small shortfall is the bank's transfer fee. */
export async function completeInvoiceAction(id: string): Promise<ActionResult> {
  await guard();
  clearXflowCache();
  try {
    const inv = await loadInvoice(id);
    if (!inv.xflowReceivableId) return { error: "This invoice isn't registered with Xflow." };
    const r = (await getReceivables()).find((x) => x.id === inv.xflowReceivableId);
    if (!r) return { error: "This invoice wasn't found in Xflow." };
    const received = toCents(r.amount_reconciled);
    const short = (toCents(r.invoice?.amount) || inv.totalCents) - received;
    if (received <= 0) return { error: "Nothing has been withdrawn against this invoice yet." };
    if (short <= 0 || r.status === "completed") return { error: "This invoice is already complete." };
    if (short > BANK_FEE_TOLERANCE_CENTS) return { error: `${usd(short)} is still missing, which is more than a bank fee. Complete it in Xflow if that's intended.` };
    await completeReceivable(r.id, received);
    return done(`/admin/billing/invoices/${id}`, `Completed. ${usd(short)} recorded as the bank's transfer fee.`);
  } catch (err) {
    return fail(err);
  }
}

export async function withdrawAction(id: string, amountCents: number): Promise<ActionResult> {
  await guard();
  clearXflowCache(); // money checks always use fresh numbers from Xflow
  try {
    const inv = await loadInvoice(id);
    if (!inv.xflowReceivableId) return { error: "Register the invoice with Xflow first." };
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "Invalid amount." };
    // Never more than what's actually waiting against this invoice.
    const [receivables, deposits] = await Promise.all([getReceivables(), getDeposits()]);
    const r = receivables.find((x) => x.id === inv.xflowReceivableId);
    const max = r ? Math.min(toCents(r.amount_reconcilable), unmatchedFunds(r.account_id, deposits, receivables)) : 0;
    if (amountCents > max) return { error: "That's more than is waiting for this invoice. Refresh and try again." };
    await withdraw(inv.xflowReceivableId, amountCents);
    return done(`/admin/billing/invoices/${id}`, `${usd(amountCents)} is on its way to your bank account.`);
  } catch (err) {
    return fail(err);
  }
}

export async function cancelInvoiceAction(id: string): Promise<ActionResult> {
  await guard();
  try {
    const inv = await loadInvoice(id);
    if (inv.xflowReceivableId) await cancelReceivable(inv.xflowReceivableId);
    await db.invoice.update({ where: { id }, data: { status: "cancelled" } });
    return done(`/admin/billing/invoices/${id}`, "Invoice cancelled.");
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDraftAction(id: string) {
  await guard();
  const inv = await db.invoice.findUnique({ where: { id } });
  if (inv && !inv.xflowReceivableId) await db.invoice.delete({ where: { id } });
  revalidatePath("/admin/billing", "layout");
  redirect("/admin/billing/invoices");
}

export async function simulatePaymentAction(id: string): Promise<ActionResult> {
  await guard();
  if (!xflowTestMode()) return { error: "Only available with a test-mode Xflow key." };
  try {
    const inv = await loadInvoice(id);
    await simulatePayment(inv, inv.totalCents);
    return done(`/admin/billing/invoices/${id}`, "Test payment created. It can take a moment to show as completed.");
  } catch (err) {
    return fail(err);
  }
}

// ---------- clients ----------

export async function createClientAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await guard();
  const v = (k: string) => String(form.get(k) ?? "").trim();
  const input = { name: v("name"), email: v("email"), line1: v("line1"), city: v("city"), state: v("state"), postalCode: v("postalCode"), country: v("country").toUpperCase() };
  if (!input.name || !input.email || !input.line1 || !input.city || !input.postalCode || input.country.length !== 2)
    return { error: "Fill in name, email, street, city, postcode and a 2-letter country code (e.g. US, GB)." };
  try {
    await createClient(input);
    return done("/admin/billing/clients", `${input.name} added.`);
  } catch (err) {
    return fail(err);
  }
}

// ---------- settings ----------

export async function saveSettingsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await guard();
  const v = (k: string) => String(form.get(k) ?? "").trim();
  const nextNumber = Math.max(1, Math.floor(Number(v("nextNumber")) || 1));
  // Only touch the counter if it was actually changed here, so an old open tab can't wind it back.
  const counterChanged = nextNumber !== Number(v("nextNumberWas"));
  const paymentTermsDays = Math.max(0, Math.min(365, Math.floor(Number(v("paymentTermsDays")) || 15)));
  await getSettings();
  await db.billingSettings.update({
    where: { id: 1 },
    data: {
      legalName: v("legalName") || "Shader Labs Private Limited",
      address: v("address"),
      email: v("email") || "mail@shaderlabs.in",
      cin: v("cin"),
      gstin: v("gstin") || null,
      pan: v("pan") || null,
      lutNumber: v("lutNumber") || null,
      invoicePrefix: (v("invoicePrefix") || "SL").replace(/[^A-Za-z0-9-]/g, "").slice(0, 12) || "SL",
      ...(counterChanged ? { nextNumber, numberYear: financialYear() } : {}),
      paymentTermsDays,
      defaultPurposeCode: v("defaultPurposeCode") || "P0802",
      footerNote: v("footerNote") || null,
      bankName: v("bankName") || null,
      bankAddress: v("bankAddress") || null,
      bankAccountNumber: v("bankAccountNumber") || null,
      bankAccountType: v("bankAccountType") || null,
      bankSwift: v("bankSwift").toUpperCase() || null,
      bankAchRouting: v("bankAchRouting") || null,
    },
  });
  revalidatePath("/admin/billing", "layout");
  return { ok: true, message: "Saved." };
}

export async function refreshBillingAction() {
  await guard();
  clearXflowCache();
  revalidatePath("/admin/billing", "layout");
}
