"use client";

import { useEffect, useRef, useState } from "react";
import { contactOptions } from "@/lib/content";
import { ArrowUpRight, Check } from "./Icons";

type FieldErrors = Partial<Record<string, string>>;
type State = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [services, setServices] = useState<string[]>([]);
  const [sentTo, setSentTo] = useState<{ name: string; email: string } | null>(null);
  const startedAt = useRef<number>(0);
  const successRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (state === "success") successRef.current?.focus();
  }, [state]);

  const toggleService = (s: string) =>
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    const payload = {
      name: get("name"),
      email: get("email"),
      company: get("company"),
      website: get("website"),
      phone: get("phone"),
      budget: get("budget"),
      message: get("message"),
      services,
      fax: get("fax"),
      fillMs: Math.round(performance.now() - startedAt.current), // measured locally, so a wrong device clock can't matter
    };

    // Quick client-side checks (the server validates everything again).
    const errs: FieldErrors = {};
    if (payload.name.trim().length < 2) errs.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(payload.email.trim())) errs.email = "Please enter a valid email address.";
    if (payload.message.trim().length < 20) errs.message = "Tell us a little more: at least 20 characters.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError("Please check the highlighted fields.");
      setState("error");
      focusFirstError(errs);
      return;
    }

    setState("submitting");
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: FieldErrors;
      };
      if (!res.ok || !data.ok) {
        setFieldErrors(data.fieldErrors ?? {});
        setError(data.error ?? "Something went wrong. Please try again, or email us directly.");
        setState("error");
        if (data.fieldErrors) focusFirstError(data.fieldErrors);
        return;
      }
      setSentTo({ name: payload.name.trim().split(" ")[0], email: payload.email.trim() });
      setState("success");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again, or email us directly.");
      setState("error");
    }
  }

  function focusFirstError(errs: FieldErrors) {
    const order = ["name", "email", "company", "website", "phone", "budget", "message"];
    const first = order.find((k) => errs[k]);
    if (first) (formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus();
  }

  function reset() {
    setState("idle");
    setServices([]);
    setSentTo(null);
    setError(null);
    setFieldErrors({});
    startedAt.current = performance.now();
  }

  if (state === "success" && sentTo) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex min-h-[28rem] flex-col items-start justify-center border-t border-line pt-10 outline-none"
      >
        <span className="meta flex items-center gap-2 text-lime">
          <Check className="h-4 w-4" /> Sent
        </span>
        <h2 className="t-h1 mt-6">
          Message <span className="serif">received.</span>
        </h2>
        <p className="lead mt-6 max-w-[36ch] text-muted">
          Thanks, <span className="text-fg">{sentTo.name}</span>. Your message is with us, and we&apos;ll reply to{" "}
          <span className="break-all text-fg">{sentTo.email}</span> soon.
        </p>
        <button type="button" onClick={reset} className="arrow-link u-link-static mt-10">
          Send another message
        </button>
      </div>
    );
  }

  const err = (k: string) => fieldErrors[k];
  const describedBy = (k: string) => (err(k) ? `${k}-error` : undefined);

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={onSubmit}
      onChange={(e) => {
        // Clear a field's error as soon as the person edits it.
        const name = (e.target as unknown as HTMLInputElement).name;
        if (name && fieldErrors[name]) {
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next[name];
            if (!Object.keys(next).length) setError(null);
            return next;
          });
        }
      }}
      noValidate
      className="relative"
    >
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
        <Field label="Your name" name="name" required error={err("name")}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            className="field"
            placeholder="Jane Doe"
            aria-invalid={!!err("name")}
            aria-describedby={describedBy("name")}
          />
        </Field>
        <Field label="Email" name="email" required error={err("email")}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            className="field"
            placeholder="jane@company.com"
            aria-invalid={!!err("email")}
            aria-describedby={describedBy("email")}
          />
        </Field>
        <Field label="Company" name="company" error={err("company")}>
          <input
            id="company"
            name="company"
            type="text"
            autoComplete="organization"
            maxLength={120}
            className="field"
            placeholder="Company name"
            aria-invalid={!!err("company")}
            aria-describedby={describedBy("company")}
          />
        </Field>
        <Field label="Website" name="website" error={err("website")}>
          <input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            maxLength={200}
            className="field"
            placeholder="company.com"
            aria-invalid={!!err("website")}
            aria-describedby={describedBy("website")}
          />
        </Field>
        <Field label="Phone / WhatsApp" name="phone" error={err("phone")}>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            className="field"
            placeholder="+1 555 000 0000"
            aria-invalid={!!err("phone")}
            aria-describedby={describedBy("phone")}
          />
        </Field>
        <Field label="Budget (USD)" name="budget" error={err("budget")}>
          <select
            id="budget"
            name="budget"
            className="field"
            defaultValue=""
            aria-invalid={!!err("budget")}
            aria-describedby={describedBy("budget")}
          >
            <option value="">Select a range</option>
            {contactOptions.budgets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="mt-10">
        <legend className="field-label">What do you need? (pick any)</legend>
        <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
          {contactOptions.services.map((s) => {
            const on = services.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(s)}
                className="group flex min-h-11 w-full items-center gap-3 border-b border-line py-2 text-left transition-colors hover:border-line-strong"
              >
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center border transition-colors ${
                    on ? "border-lime bg-lime text-ink" : "border-line-strong group-hover:border-fg"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className={on ? "text-fg" : "text-fg/80"}>{s}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-10">
        <Field label="Tell us about the project" name="message" required error={err("message")}>
          <textarea
            id="message"
            name="message"
            required
            rows={6}
            maxLength={5000}
            className="field"
            placeholder="What do you want built? What problem should it solve? Any deadlines?"
            aria-invalid={!!err("message")}
            aria-describedby={describedBy("message")}
          />
        </Field>
      </div>

      {/* Honeypot: hidden from people and screen readers, bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="fax">Fax</label>
        <input id="fax" name="fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="meta mt-8 border-l-2 border-danger pl-3 text-[#ffb0a6]">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="meta">We only use your details to reply to you.</p>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={state === "submitting"}>
          {state === "submitting" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              Sending…
            </>
          ) : (
            <>
              Send message
              <ArrowUpRight />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  error,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={name} className="field-label">
        {label}
        {required ? <span className="text-fg"> *</span> : <span className="normal-case tracking-normal"> (optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${name}-error`} className="meta mt-2 text-[#ffb0a6]">
          {error}
        </p>
      )}
    </div>
  );
}
