import type { ReactNode } from "react";
import { d, Lines } from "./Lines";

// Page opener: mono label, big masked headline, optional intro set off-axis.
export function PageHead({
  label,
  lines,
  intro,
  meta,
}: {
  label: string;
  lines: ReactNode[];
  intro?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="container-x pt-36 pb-16 md:pt-48 md:pb-24">
      <p className="label" data-reveal="load">
        {label}
      </p>
      <Lines as="h1" mode="load" delay={80} className="t-display mt-6 max-w-[16ch]" lines={lines} />
      {(intro || meta) && (
        <div className="mt-12 grid gap-8 md:mt-16 md:grid-cols-12">
          {meta && (
            <div className="meta md:col-span-3" data-reveal="load" style={d(300)}>
              {meta}
            </div>
          )}
          {intro && (
            <p className={`lead max-w-[38ch] md:col-span-6 ${meta ? "" : "md:col-start-4"}`} data-reveal="load" style={d(360)}>
              {intro}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// Two-part section: a mono label in the left gutter, content on the right.
export function Section({
  label,
  aside,
  children,
  className = "",
  id,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`container-x scroll-mt-24 ${className}`}>
      <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-6">
        <div className="md:col-span-3">
          <h2 className="t-section">{label}</h2>
          {aside && <div className="meta mt-3 max-w-[24ch]">{aside}</div>}
        </div>
        <div className="min-w-0 md:col-span-9">{children}</div>
      </div>
    </section>
  );
}
