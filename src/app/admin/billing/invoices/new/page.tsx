import { getPartners, getSettings, partnerName, PURPOSE_CODES } from "@/lib/billing";
import { InvoiceForm } from "./InvoiceForm";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fy = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
};

export default async function NewInvoicePage() {
  const [settings, partners] = await Promise.all([getSettings(), getPartners().catch(() => [])]);
  const today = new Date();
  const due = new Date(today.getTime() + settings.paymentTermsDays * 86400000);
  // Preview only; the real number is reserved when the invoice is created.
  const n = settings.numberYear && settings.numberYear !== fy() ? 1 : settings.nextNumber;

  return (
    <InvoiceForm
      clients={partners
        .filter((p) => p.status !== "deactivated")
        .map((p) => ({ id: p.id, name: partnerName(p), email: p.business_details?.email }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      purposeCodes={PURPOSE_CODES}
      defaultPurpose={settings.defaultPurposeCode}
      issueDate={ymd(today)}
      dueDate={ymd(due)}
      nextNumber={`${settings.invoicePrefix}/${fy()}/${String(n).padStart(3, "0")}`}
    />
  );
}
