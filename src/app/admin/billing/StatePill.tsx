import type { InvoiceState } from "@/lib/billing";

// Invoice state: status colour + icon + label, never colour alone.
const TONES = {
  good: { color: "#0ca30c", icon: "M5 12.5l4.5 4.5L19 7.5" },
  warning: { color: "#fab219", icon: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" },
  critical: { color: "#d03b3b", icon: "M12 8v5m0 3.5v.5M12 3l9.5 17h-19L12 3z" },
  neutral: { color: "#8c8c85", icon: "M5 12h14" },
} as const;

export function StatePill({ state }: { state: Pick<InvoiceState, "label" | "tone"> }) {
  const t = TONES[state.tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-xs whitespace-nowrap text-fg/90">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none" fill="none" stroke={t.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={t.icon} />
      </svg>
      {state.label}
    </span>
  );
}
