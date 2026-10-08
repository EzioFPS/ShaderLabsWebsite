import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHead, Section } from "@/components/Blocks";
import { ArrowRight } from "@/components/Icons";
import { Lines } from "@/components/Lines";
import { embedded, process, services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Business systems, backends and APIs, custom pipelines, CRM tools, portals, technical art pipelines, interactive experiences and infrastructure, or a full embedded tech team.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHead
        label="Services"
        lines={[
          "Specific problems,",
          <>
            <span className="serif">specific software.</span>
          </>,
        ]}
        meta={<>Eight things we build, and one way we work: as your tech team.</>}
        intro="We don't sell templates. Every project starts with one company's exact problem, from a business system with rules nobody else has to a pipeline that moves a film production's assets, and ends with software built for that alone."
      />

      {/* Index: every service at a glance, jumps to its block */}
      <nav aria-label="Services on this page" className="container-x pb-16 md:pb-24">
        <ol className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <li key={s.slug} className="border-b border-line">
              <a href={`#${s.slug}`} className="group flex items-baseline gap-4 py-4 pr-4 transition-colors hover:text-lime">
                <span className="meta">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg font-medium tracking-[-0.01em]">{s.title}</span>
                <ArrowRight className="ml-auto h-4 w-4 flex-none rotate-90 text-muted transition-colors group-hover:text-lime" />
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Each service: full-width block, headline from the left edge, details in three columns */}
      <section className="container-x pb-24 md:pb-36">
        <ul className="border-t border-line">
          {services.map((s, i) => (
            <li key={s.slug} id={s.slug} className="scroll-mt-24 border-b border-line py-14 md:py-20">
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-12 md:items-baseline">
                <span className="meta md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
                <Lines className="t-h1 min-w-0 md:col-span-11" lines={[s.title]} />
              </div>

              <div className="mt-10 grid gap-x-6 gap-y-10 md:mt-14 md:grid-cols-12" data-reveal>
                <p className="lead min-w-0 md:col-span-11 md:col-start-2 lg:col-span-5 lg:col-start-2">{s.description}</p>
                <div className="min-w-0 md:col-span-6 md:col-start-2 lg:col-span-3 lg:col-start-7">
                  <p className="label">What you get</p>
                  <ul className="mt-4 border-t border-line">
                    {s.deliverables.map((x) => (
                      <li key={x} className="border-b border-line py-2.5">
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0 md:col-span-5 md:col-start-8 lg:col-span-3 lg:col-start-10">
                  <p className="label">Useful when</p>
                  <p className="body-muted mt-4">{s.usefulWhen}</p>
                </div>
              </div>

              {s.image && (
                <figure className="mt-14 md:ml-[calc((100%-11*1.5rem)/12+1.5rem)]">
                  <div className="overflow-hidden rounded-md border border-line bg-surface" data-wipe>
                    <Image
                      src={s.image.src}
                      alt={s.image.caption}
                      width={1920}
                      height={1080}
                      sizes="(min-width: 768px) 85vw, 100vw"
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="meta mt-3">{s.image.caption}</figcaption>
                </figure>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Embedded team */}
      <section id="tech-team" className="scroll-mt-24 border-y border-line bg-surface">
        <div className="container-x section grid gap-x-6 gap-y-12 md:grid-cols-12">
          <div className="md:col-span-3">
            <h2 className="t-section">How most clients work with us</h2>
          </div>
          <div className="min-w-0 md:col-span-9">
            <Lines
              className="t-h1"
              lines={[
                "Your tech team,",
                <>
                  <span className="serif">on call.</span>
                </>,
              ]}
            />
            <div className="mt-10 grid gap-6 md:grid-cols-2" data-reveal>
              {embedded.body.map((p) => (
                <p key={p} className="body-muted max-w-[44ch]">
                  {p}
                </p>
              ))}
            </div>
            <dl className="mt-14 grid border-t border-line md:grid-cols-3">
              {embedded.points.map(([k, v]) => (
                <div key={k} className="border-b border-line py-6 md:border-b-0 md:pr-6" data-reveal>
                  <dt className="label">{k}</dt>
                  <dd className="t-h3 mt-3">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Section label="How we work" className="section">
        <ol className="border-t border-line">
          {process.map((step) => (
            <li key={step.title} className="grid gap-x-6 gap-y-2 border-b border-line py-7 md:grid-cols-9 md:py-9" data-reveal>
              <span className="meta md:col-span-2">{step.when}</span>
              <h3 className="t-h3 md:col-span-3">{step.title}</h3>
              <p className="body-muted max-w-[44ch] md:col-span-4">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-16 grid gap-6 md:grid-cols-9" data-reveal>
          <p className="label md:col-span-2">Our stack</p>
          <p className="lead max-w-[40ch] md:col-span-7">
            We don&apos;t push a favourite stack. We pick the tools that fit your problem, your team and your budget.
          </p>
        </div>
        <div className="mt-12" data-reveal>
          <Link href="/contact" className="arrow-link u-link-static text-lg">
            Tell us what you need <ArrowRight />
          </Link>
        </div>
      </Section>
    </>
  );
}
