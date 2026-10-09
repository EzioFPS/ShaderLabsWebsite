"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveSettingsAction, type ActionResult } from "../actions";

type Settings = {
  legalName: string;
  address: string;
  email: string;
  cin: string;
  gstin: string | null;
  pan: string | null;
  lutNumber: string | null;
  invoicePrefix: string;
  nextNumber: number;
  paymentTermsDays: number;
  defaultPurposeCode: string;
  footerNote: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankAccountNumber: string | null;
  bankAccountType: string | null;
  bankSwift: string | null;
  bankAchRouting: string | null;
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm h-10" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export function SettingsForm({ s, purposeCodes, numberPreview }: { s: Settings; purposeCodes: [string, string][]; numberPreview: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveSettingsAction, {});
  const input = (name: keyof Settings, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm text-muted">
      {label}
      <input name={name} defaultValue={String(s[name] ?? "")} className="field field-box mt-1.5 h-10 w-full" {...props} />
      {hint && <span className="mt-1 block text-xs text-muted/80">{hint}</span>}
    </label>
  );

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-5 md:p-6">
        <h2 className="t-h3">Printed on every invoice</h2>
        {input("legalName", "Legal name")}
        <label className="block text-sm text-muted">
          Address
          <textarea name="address" defaultValue={s.address} rows={3} className="field field-box mt-1.5 w-full py-2.5" />
        </label>
        {input("email", "Billing email", undefined, { type: "email" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {input("gstin", "GSTIN", "Leave empty if not registered")}
          {input("pan", "PAN")}
          {input("cin", "CIN")}
          {input("lutNumber", "LUT number / ARN", "Adds the export-under-LUT line")}
        </div>
        <label className="block text-sm text-muted">
          Footer note
          <input name="footerNote" defaultValue={s.footerNote ?? ""} className="field field-box mt-1.5 h-10 w-full" />
        </label>

        <div className="border-t border-line pt-5">
          <h3 className="font-semibold">Bank transfer details</h3>
          <p className="mt-1 text-sm text-muted">
            Your USD receiving account from the Xflow home page (Receiving Accounts). Printed under &quot;How to pay&quot;; the beneficiary is the legal name
            above.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {input("bankAccountNumber", "Account number")}
            {input("bankAccountType", "Account type", "e.g. Business")}
            {input("bankSwift", "SWIFT / BIC code", "For international transfers")}
            {input("bankAchRouting", "ACH routing number", "For US local transfers")}
            {input("bankName", "Bank name")}
          </div>
          <label className="mt-4 block text-sm text-muted">
            Bank address
            <input name="bankAddress" defaultValue={s.bankAddress ?? ""} className="field field-box mt-1.5 h-10 w-full" />
          </label>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card space-y-4 p-5 md:p-6">
          <h2 className="t-h3">Invoice numbering</h2>
          <p className="text-sm text-muted">
            Numbers go up by one with every new invoice and restart at 1 each April. Next invoice: <span className="font-mono text-fg">{numberPreview}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("invoicePrefix", "Prefix", "e.g. SL")}
            {input("nextNumber", "Next number", "Change only to continue an existing series", { type: "number", min: 1 })}
            <input type="hidden" name="nextNumberWas" value={s.nextNumber} />
          </div>
        </div>
        <div className="card space-y-4 p-5 md:p-6">
          <h2 className="t-h3">Defaults for new invoices</h2>
          {input("paymentTermsDays", "Payment terms (days until due)", undefined, { type: "number", min: 0, max: 365 })}
          <label className="block text-sm text-muted">
            Purpose code
            <select name="defaultPurposeCode" defaultValue={s.defaultPurposeCode} className="field field-box mt-1.5 h-10 w-full">
              {purposeCodes.map(([c, l]) => (
                <option key={c} value={c}>
                  {c} · {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Save />
          {state.message && <p role="status" className="text-sm text-lime">{state.message}</p>}
          {state.error && <p role="alert" className="text-sm text-[#ffb3b3]">{state.error}</p>}
        </div>
      </div>
    </form>
  );
}
