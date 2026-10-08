import type { Metadata } from "next";
import { PageHead, Section } from "@/components/Blocks";
import { Founders } from "@/components/Founders";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "Shader Labs Private Limited brings startup and games experience to client work: everything from technical art pipelines to business systems.",
};

const range = [
  {
    area: "Technical art",
    body: "Shaders, real-time rendering, asset pipelines and the tools artists use every day. The work our name comes from.",
  },
  {
    area: "Games",
    body: "Engines, gameplay code, multiplayer networking and the performance budgets that come with shipping something people play.",
  },
  {
    area: "Startups",
    body: "Small teams, real deadlines, and products that have to work with real customers before the money runs out.",
  },
  {
    area: "Business systems",
    body: "Backends, custom pipelines, CRM tools and portals that companies run on every day, built and maintained for the long term.",
  },
];

const principles = [
  ["We own it.", "If something we built breaks, it's ours to fix. No tickets bounced between vendors."],
  ["We build what's needed.", "We'll build the feature you asked for, and tell you honestly when there's a simpler way."],
  ["We build to last.", "Launch is the start. Everything is made to be maintained and extended for years."],
  ["We talk straight.", "Clear scope, clear timelines, clear prices. No jargon."],
];

export default function AboutPage() {
  return (
    <>
      <PageHead
        label="About"
        lines={[
          "From technical art",
          <>
            to <span className="serif">business systems.</span>
          </>,
        ]}
        meta={
          <>
            Est. {company.founded}. Clients in {company.clientCountries.length}+ countries.
          </>
        }
        intro="Our team comes from startups and games. That mix means one team can write the shader, build the pipeline, run the backend and design the business system around it."
      />

      <Section label="What we bring" aside="The range behind every project" className="section-tight">
        <ul className="border-t border-line">
          {range.map((r) => (
            <li key={r.area} className="grid gap-x-6 gap-y-3 border-b border-line py-8 md:grid-cols-9 md:py-10" data-reveal>
              <h3 className="t-h2 md:col-span-4">{r.area}</h3>
              <p className="body-muted max-w-[46ch] md:col-span-5 md:pt-2">{r.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="What to expect" aside="How we work with every client" className="section">
        <ul className="border-t border-line">
          {principles.map(([title, body]) => (
            <li key={title} className="grid gap-x-6 gap-y-3 border-b border-line py-8 md:grid-cols-9 md:py-10" data-reveal>
              <h3 className="t-h2 md:col-span-4">{title}</h3>
              <p className="body-muted max-w-[46ch] md:col-span-5 md:pt-2">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Founders" aside="Both directors of the company" className="section-tight">
        <Founders />
      </Section>

      <Section label="Company" className="section-tight pb-28 md:pb-40">
        <dl className="grid gap-x-6 gap-y-8 border-t border-line pt-8 md:grid-cols-3">
          <div>
            <dt className="label">Registered name</dt>
            <dd className="mt-3">{company.legalName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="label">CIN</dt>
            <dd className="mt-3 font-mono text-sm break-all">{company.cin}</dd>
          </div>
          <div>
            <dt className="label">Registered office</dt>
            <dd className="body-muted mt-3 leading-relaxed">
              {company.address.line1}, {company.address.line2}, {company.address.line3}
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
