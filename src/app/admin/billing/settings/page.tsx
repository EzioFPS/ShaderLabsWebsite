import { getSettings, PURPOSE_CODES } from "@/lib/billing";
import { SettingsForm } from "./SettingsForm";

export default async function BillingSettingsPage() {
  const s = await getSettings();
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const fy = `${y}-${String(y + 1).slice(2)}`;
  const n = s.numberYear && s.numberYear !== fy ? 1 : s.nextNumber;
  return <SettingsForm s={s} purposeCodes={PURPOSE_CODES} numberPreview={`${s.invoicePrefix}/${fy}/${String(n).padStart(3, "0")}`} />;
}
