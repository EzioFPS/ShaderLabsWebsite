import { requireAdmin } from "@/lib/auth";
import { clientTaxIds, financialYear as fy, getPartners, getSettings, partnerName, PURPOSE_CODES } from "@/lib/billing";
import { InvoiceForm } from "./InvoiceForm";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export default async function NewInvoicePage() {
  await requireAdmin("/admin/billing");
  const [settings, partners, taxIds] = await Promise.all([getSettings(), getPartners().catch(() => []), clientTaxIds()]);
  const today = new Date();
  const due = new Date(today.getTime() + settings.paymentTermsDays * 86400000);
  // Preview only; the real number is reserved when the invoice is created.
  const n = settings.numberYear && settings.numberYear !== fy() ? 1 : settings.nextNumber;

  return (
    <InvoiceForm
      clients={partners
        .filter((p) => p.status !== "deactivated")
        .map((p) => ({ id: p.id, name: partnerName(p), email: p.business_details?.email, taxId: taxIds.get(p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      purposeCodes={PURPOSE_CODES}
      defaultPurpose={settings.defaultPurposeCode}
      issueDate={ymd(today)}
      dueDate={ymd(due)}
      nextNumber={`${settings.invoicePrefix}/${fy()}/${String(n).padStart(3, "0")}`}
    />
  );
}
