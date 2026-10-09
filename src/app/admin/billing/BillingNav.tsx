"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/billing", label: "Overview" },
  { href: "/admin/billing/invoices", label: "Invoices" },
  { href: "/admin/billing/clients", label: "Clients" },
  { href: "/admin/billing/settings", label: "Settings" },
];

export function BillingNav() {
  const path = usePathname();
  return (
    <nav aria-label="Billing" className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active = t.href === "/admin/billing" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex-none px-4 py-3 text-[0.9375rem] transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {t.label}
            {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-lime" aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}
