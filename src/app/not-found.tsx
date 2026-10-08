import Link from "next/link";
import { ArrowRight } from "@/components/Icons";
import { Lines } from "@/components/Lines";

export default function NotFound() {
  return (
    <section className="container-x flex min-h-[80svh] flex-col justify-center pt-28 pb-20">
      <p className="label">Error 404</p>
      <Lines
        as="h1"
        mode="load"
        className="t-display mt-6"
        lines={[
          "Nothing here.",
          <>
            <span className="serif">Yet.</span>
          </>,
        ]}
      />
      <p className="lead mt-8 max-w-[36ch] text-muted">This page doesn&apos;t exist or has moved.</p>
      <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
        <Link href="/" className="arrow-link u-link-static">
          Back to home <ArrowRight />
        </Link>
        <Link href="/contact" className="arrow-link u-link text-muted hover:text-fg">
          Contact us <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
