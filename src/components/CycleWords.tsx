"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

// A sentence of service names where one name at a time lights up lime, in order.
// Each name links to its service on /services. Static (no cycling) for reduced motion.
type Item = { label: string; slug: string };

const INTERVAL_MS = 1600;

export function CycleWords({ items, className = "" }: { items: Item[]; className?: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(-1);
      return;
    }
    const id = window.setInterval(() => setActive((i) => (i + 1) % items.length), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  return (
    <p className={className}>
      We build{" "}
      {items.map((item, i) => (
        <Fragment key={item.slug}>
          <Link
            href={`/services#${item.slug}`}
            className={`transition-colors duration-500 hover:text-lime ${i === active ? "text-lime" : "text-fg"}`}
          >
            {item.label}
          </Link>
          {i < items.length - 2 ? ", " : i === items.length - 2 ? " and " : ""}
        </Fragment>
      ))}
      , then stay on as the team that runs them.
    </p>
  );
}
