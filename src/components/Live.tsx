"use client";

import { useEffect, useState } from "react";

// Studio local time (IST). Rendered after mount to avoid hydration mismatch.
export function Clock({ className = "" }: { className?: string }) {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      <span className="tabular-nums">{time ?? "--:--"}</span> IST
    </span>
  );
}

// Big email address that copies itself on click.
export function CopyEmail({ email, className = "" }: { email: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    if (!navigator.clipboard) return; // fall back to the mailto link
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-3">
      <a href={`mailto:${email}`} onClick={copy} className={`u-link max-w-full break-all ${className}`}>
        {email}
      </a>
      <span className="meta" aria-live="polite">
        {copied ? (
          <span className="text-lime">Copied to clipboard</span>
        ) : (
          <>
            Click to copy ·{" "}
            <a href={`mailto:${email}`} className="u-link text-fg">
              open in mail app
            </a>
          </>
        )}
      </span>
    </span>
  );
}
