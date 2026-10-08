import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/Blocks";
import { CycleWords } from "@/components/CycleWords";
import { Founders } from "@/components/Founders";
import { ArrowRight } from "@/components/Icons";
import { d, Lines } from "@/components/Lines";
import { OrbitLabels } from "@/components/OrbitLabels";
import { ShaderCanvas } from "@/components/ShaderCanvas";
import { Typewriter } from "@/components/Typewriter";
import { WorkIndex } from "@/components/WorkIndex";
import { caseStudies, company, process, workIndex } from "@/lib/content";

export default function Home() {
  const wsd = caseStudies[0];

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="container-x flex min-h-[100svh] flex-col pt-20 pb-6 md:pt-24">
        <div className="grid flex-1 grid-cols-1 gap-x-6 lg:grid-cols-12">
          {/* Dithered planet: a real-time shader */}
          {/* lg:pr-16 leaves room for the orbiting labels beyond the ring's right edge */}
          {/* items-start: stops flex from stretching the square planet box to the row height */}
          <div className="order-1 flex items-start justify-center lg:order-2 lg:col-span-6 lg:col-start-7 lg:justify-end lg:pr-16" data-parallax-hero="35">
            {/* On desktop the planet also shrinks with screen height, so the whole headline stays above the fold */}
            <div
              className="aspect-square w-[min(88vw,28rem)] lg:w-[min(36vw,29rem,calc(100svh_-_27rem))]"
              data-reveal="load"
              style={d(200)}
            >
              <div className="relative h-full w-full">
                <ShaderCanvas label="A dithered planet rendered live by a WebGL shader" />
                <OrbitLabels />
              </div>
            </div>
          </div>

          <div className="order-3 mt-8 lg:order-1 lg:col-span-5 lg:mt-0 lg:self-end lg:pb-10">
            <p className="lead max-w-[34ch] text-fg/90" data-reveal="load" style={d(500)}>
              Business systems, backends, custom pipelines and CRM tools, designed, built and run by one small team.
              You name the feature; we ship it and keep it running.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3" data-reveal="load" style={d(600)}>
              <Link href="/contact" className="arrow-link u-link-static">
                Start a project <ArrowRight />
              </Link>
              <Link href="#work" className="arrow-link u-link text-muted hover:text-fg">
                See the work <ArrowRight className="rotate-90" />
              </Link>
            </div>
          </div>

          <Lines
            as="h1"
            mode="load"
            delay={100}
            className="order-2 mt-8 text-[clamp(2.4rem,5.2vw,6rem)] leading-[0.93] font-medium tracking-[-0.045em] [font-variation-settings:'wdth'_106] lg:order-3 lg:col-span-12 lg:mt-6"
            lines={[
              "We forward deploy engineers",
              "to tackle the problems",
              <>
                <span className="serif">your roadmap can&apos;t wait on.</span>
              </>,
            ]}
          />
        </div>

        <div
          className="meta mt-10 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-5 xs:grid-cols-2 lg:mt-12 lg:grid-cols-[1fr_auto_1fr]"
          data-reveal="load"
          style={d(700)}
        >
          <span>Shader Labs Private Limited, est. {company.founded}</span>
          <Typewriter
            className="hidden md:block lg:whitespace-nowrap lg:text-center"
            phrases={[
              ...company.clientCountries.map((country) => `Clients in ${country}`),
              "Clients all around the world",
            ]}
          />
          <span className="flex flex-wrap items-center gap-x-2 lg:justify-end">
            <span className="status-dot" /> Open to new projects
          </span>
        </div>
      </section>

      {/* ---------- What we do ---------- */}
      <Section label="What we do" className="section">
        <div data-reveal>
          <CycleWords
            className="t-h2 max-w-[28ch] text-muted"
            items={[
              { label: "business systems", slug: "business-systems" },
              { label: "backends", slug: "backends" },
              { label: "custom pipelines", slug: "pipelines" },
              { label: "CRM tools", slug: "crm" },
              { label: "client portals", slug: "portals" },
              { label: "technical art pipelines", slug: "tech-art" },
              { label: "interactive experiences", slug: "interactive" },
              { label: "infrastructure", slug: "infrastructure" },
            ]}
          />
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-9" data-reveal>
          <p className="body-muted max-w-[46ch] md:col-span-5">
            You bring the feature, the problem or the half-finished idea. We handle the design, the code, the servers
            and everything that happens after launch, so you can get back to running the business.
          </p>
          <div className="md:col-span-4 md:text-right">
            <Link href="/services" className="arrow-link u-link-static">
              How we can help <ArrowRight />
            </Link>
          </div>
        </div>
      </Section>

      {/* ---------- Work index ---------- */}
      <Section id="work" label="Selected work" aside="Clients & our own products" className="section-tight">
        <WorkIndex rows={workIndex} />
      </Section>

      {/* ---------- Featured case ---------- */}
      <section className="section">
        <div className="container-x">
          <Link href={`/work/${wsd.slug}`} className="group block">
            <figure className="overflow-hidden rounded-md border border-line bg-surface" data-wipe>
              <div className="meta flex items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-line-strong" />
                <span className="h-2 w-2 rounded-full bg-line-strong" />
                <span className="h-2 w-2 rounded-full bg-line-strong" />
                <span className="ml-3 truncate">{wsd.urlLabel}</span>
              </div>
              <div className="overflow-hidden">
                <Image
                  src={wsd.shot.src}
                  alt={`The ${wsd.client} website, built and run by Shader Labs`}
                  width={wsd.shot.width}
                  height={wsd.shot.height}
                  sizes="(min-width: 1440px) 1360px, 100vw"
                  data-parallax="10"
                  className="h-auto w-full scale-[1.12] transition-[scale] duration-[1.2s] ease-[cubic-bezier(.2,.7,0,1)] group-hover:scale-[1.14]"
                />
              </div>
            </figure>
          </Link>

          <div className="mt-10 grid gap-8 md:grid-cols-12">
            <p className="label md:col-span-3">Case study · {wsd.period}</p>
            <div className="min-w-0 md:col-span-6">
              <Lines className="t-h2" lines={[wsd.client, <span key="h" className="text-muted">{wsd.headline}</span>]} />
              <p className="body-muted mt-6 max-w-[52ch]" data-reveal>
                {wsd.summary}
              </p>
            </div>
            <div className="md:col-span-3 md:text-right">
              <Link href={`/work/${wsd.slug}`} className="arrow-link u-link-static">
                Read the case study <ArrowRight />
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ---------- Process ---------- */}
      <Section label="How we work" aside="From first message to a system that runs itself" className="section-tight">
        <ol className="border-t border-line">
          {process.map((step) => (
            <li key={step.title} className="grid gap-x-6 gap-y-2 border-b border-line py-7 md:grid-cols-9 md:py-9" data-reveal>
              <span className="meta md:col-span-2">{step.when}</span>
              <h3 className="t-h3 md:col-span-3">{step.title}</h3>
              <p className="body-muted max-w-[44ch] md:col-span-4">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------- Founders ---------- */}
      <Section label="Founders" aside="The people you'll actually work with" className="section">
        <Founders />
      </Section>
    </>
  );
}
