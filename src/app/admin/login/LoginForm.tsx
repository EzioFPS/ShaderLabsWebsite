"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-8">
      <label htmlFor="password" className="field-label">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="field field-box"
        aria-invalid={!!state?.error}
        aria-describedby={state?.error ? "login-error" : undefined}
      />
      {state?.error && (
        <p id="login-error" role="alert" className="mt-3 text-sm text-[#ffb3b3]">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-6 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
