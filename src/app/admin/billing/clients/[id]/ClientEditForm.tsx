"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateClientAction, type ActionResult } from "../../actions";

export type ClientValues = {
  nickname: string;
  name: string;
  email: string;
  type: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxId: string;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm h-10" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function ClientEditForm({ id, values }: { id: string; values: ClientValues }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateClientAction.bind(null, id), {});

  const field = (name: keyof ClientValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm text-muted">
      {label}
      <input name={name} defaultValue={values[name]} className="field field-box mt-1.5 h-10 w-full" {...props} />
    </label>
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Save these details? Changes to the name, email or address are made in your live Xflow account.")) e.preventDefault();
      }}
      className="card space-y-5 p-5 md:p-7"
    >
      <div>
        <h2 className="t-h3">Client details</h2>
        <p className="mt-1 text-sm text-muted">As held in Xflow. Existing invoices keep the details they were issued with; new invoices use these.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Legal name", { required: true })}
        {field("nickname", "Display name")}
        {field("email", "Billing email", { type: "email", required: true })}
        <label className="block text-sm text-muted">
          Type
          <input value={values.type} readOnly className="field field-box mt-1.5 h-10 w-full capitalize text-muted" />
        </label>
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-xs tracking-wider text-muted uppercase">Address</p>
        {field("line1", "Street address", { required: true })}
        {field("line2", "Address line 2")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("city", "City", { required: true })}
          {field("state", "State / region")}
          {field("postalCode", "Postcode / ZIP", { required: true })}
          {field("country", "Country code", { required: true, maxLength: 2, placeholder: "US", className: "field field-box mt-1.5 h-10 w-full uppercase" })}
        </div>
      </div>

      <div className="border-t border-line pt-5">
        {field("taxId", "Tax ID", { placeholder: "e.g. VAT / EIN / RUT" })}
        <p className="mt-1.5 text-xs text-muted">Printed under the client&apos;s name on invoices. Kept here; Xflow doesn&apos;t store one.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        {state.error && (
          <p role="alert" className="text-sm break-words text-[#ffb3b3]">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm text-lime">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
