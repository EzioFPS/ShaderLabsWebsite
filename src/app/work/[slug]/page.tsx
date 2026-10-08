import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/Blocks";
import { ArrowRight, ArrowUpRight } from "@/components/Icons";
import { d, Lines } from "@/components/Lines";
import { SystemsDiagram } from "@/components/SystemsDiagram";
import { caseStudies } from "@/lib/content";

type Params = { slug: string };

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const c = caseStudies.find((x) => x.slug === slug);
  if (!c) return {};
  return { title: `${c.client}: case study`, description: c.summary };
}

export default async function CaseStudyPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const c = caseStudies.find((x) => x.slug === slug);
  if (!c) notFound();

  const next = caseStudies[(caseStudies.indexOf(c) + 1) % caseStudies.length];
  const wideLogo = c.logo.width / c.logo.height > 4;

  return (
    <>
      <section className="container-x pt-32 pb-12 md:pt-44 md:pb-16">
        <Link href="/work" className="meta u-link inline-flex items-center gap-2 hover:text-fg" data-reveal="load">
          <ArrowRight className="h-3 w-3 rotate-180" /> All work
        </Link>
        <Lines as="h1" mode="load" delay={80} className="t-display mt-8 max-w-[14ch]" lines={[c.client]} />
        <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-line pt-6 md:grid-cols-4" data-reveal="load" style={d(300)}>
          {[
            ["Industry", c.industry],
            ["Our role", c.role],
            ["Engagement", c.period],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="label">{k}</dt>
              <dd className="mt-2">{v}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="label">Live site</dt>
            <dd className="mt-2">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="u-link-static inline-flex max-w-full items-center gap-1.5 break-all">
                {c.urlLabel}
                <ArrowUpRight className="h-3.5 w-3.5 flex-none" />
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="container-x">
        <figure className="overflow-hidden rounded-md border border-line bg-surface" data-reveal="load" style={d(400)}>
          <div className="meta flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="h-2 w-2 rounded-full bg-line-strong" />
            <span className="ml-3 truncate">{c.urlLabel}</span>
          </div>
          <Image
            src={c.shot.src}
            alt={`The ${c.client} website`}
            width={c.shot.width}
            height={c.shot.height}
            priority
            sizes="(min-width: 1440px) 1360px, 100vw"
            className="h-auto w-full"
          />
        </figure>
        <p className="meta mt-3">{c.client} homepage, captured from the live site.</p>
      </section>

      <Section label="The client" className="section">
        <div className="grid gap-10 md:grid-cols-9">
          <p className="lead max-w-[40ch] md:col-span-6" data-reveal>
            {c.aboutClient}
          </p>
          <div className="flex items-start md:col-span-3 md:justify-end" data-reveal>
            <Image
              src={c.logo.src}
              alt={`${c.client} logo`}
              width={c.logo.width}
              height={c.logo.height}
              className={`opacity-80 ${wideLogo ? "h-auto w-48" : "h-20 w-auto"}`}
            />
          </div>
        </div>
      </Section>

      <Section label="What we built" aside={c.role} className="section-tight">
        <Lines className="t-h1 max-w-[18ch]" lines={[c.headline]} />
        <p className="body-muted mt-8 max-w-[52ch]" data-reveal>
          {c.summary}
        </p>
        <ul className="mt-14 border-t border-line">
          {c.built.map((b, i) => (
            <li key={b.title} className="grid gap-x-6 gap-y-2 border-b border-line py-7 md:grid-cols-9" data-reveal>
              <span className="meta md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="t-h3 md:col-span-3">{b.title}</h3>
              <p className="body-muted max-w-[46ch] md:col-span-5">{b.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {c.slug === "whole-story-distribution" && (
        <Section label="How it fits together" aside="The system we built and run" className="section">
          <div data-reveal>
            <SystemsDiagram />
          </div>
        </Section>
      )}

      {c.scale && (
        <Section label="The platform we run" aside={c.scaleNote} className="section-tight">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-8 md:grid-cols-4">
            {c.scale.map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col-reverse gap-2" data-reveal>
                <dt className="meta">{s.label}</dt>
                <dd className="stat">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <section className="section border-t border-line">
        <Link href={`/work/${next.slug}`} className="group container-x grid gap-6 md:grid-cols-12 md:items-end">
          <p className="label md:col-span-3">Next case study</p>
          <span className="t-h1 min-w-0 transition-transform duration-500 ease-[cubic-bezier(.2,.7,0,1)] group-hover:translate-x-3 md:col-span-8">
            {next.client}
          </span>
          <span className="md:col-span-1 md:text-right">
            <ArrowRight className="inline h-8 w-8 text-muted transition-colors group-hover:text-lime" />
          </span>
        </Link>
      </section>
    </>
  );
}
