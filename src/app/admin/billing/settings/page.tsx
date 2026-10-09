import { requireAdmin } from "@/lib/auth";
import { financialYear, getSettings, PURPOSE_CODES } from "@/lib/billing";
import { SettingsForm } from "./SettingsForm";

export default async function BillingSettingsPage() {
  await requireAdmin("/admin/billing");
  const s = await getSettings();
  const fy = financialYear();
  const n = s.numberYear && s.numberYear < fy ? 1 : s.nextNumber;
  return <SettingsForm s={s} purposeCodes={PURPOSE_CODES} numberPreview={`${s.invoicePrefix}/${fy}/${String(n).padStart(3, "0")}`} />;
}
