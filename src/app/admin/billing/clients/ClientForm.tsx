"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createClientAction, type ActionResult } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm h-10" disabled={pending}>
      {pending ? "Adding…" : "Add client"}
    </button>
  );
}

export function ClientForm() {
  const [state, action] = useActionState<ActionResult, FormData>(createClientAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm text-muted">
      {label}
      <input name={name} className="field field-box mt-1.5 h-10 w-full" {...props} />
    </label>
  );

  return (
    <form
      ref={ref}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("This adds the client to your live Xflow account, where Xflow verifies them. Continue?")) e.preventDefault();
      }}
      className="card space-y-4 p-5 md:p-6"
    >
      <h2 className="t-h3">Add a client</h2>
      <p className="text-sm text-muted">Creates the client in Xflow, so you can invoice them and match their payments.</p>
      {field("name", "Company or person name", { required: true })}
      {field("email", "Billing email", { type: "email", required: true })}
      {field("line1", "Street address", { required: true })}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("city", "City", { required: true })}
        {field("state", "State / region")}
        {field("postalCode", "Postcode / ZIP", { required: true })}
        {field("country", "Country code", { required: true, maxLength: 2, placeholder: "US", className: "field field-box mt-1.5 h-10 w-full uppercase" })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        {state.error && <p role="alert" className="text-sm text-[#ffb3b3]">{state.error}</p>}
        {state.message && <p role="status" className="text-sm text-lime">{state.message}</p>}
      </div>
    </form>
  );
}
