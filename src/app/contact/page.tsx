import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { d, Lines } from "@/components/Lines";
import { Clock, CopyEmail } from "@/components/Live";
import { company } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Tell Shader Labs what you need built: websites, backends, pipelines, CRM tools and more.",
};

const next = [
  ["01", "We read every message ourselves and reply by email."],
  ["02", "A short call to understand the business and the problem."],
  ["03", "A written plan with scope, timeline and price."],
];

export default function ContactPage() {
  return (
    <section className="container-x pt-32 pb-24 md:pt-44 md:pb-36">
      <div className="grid gap-x-6 gap-y-16 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <p className="label" data-reveal="load">
            Contact
          </p>
          <Lines
            as="h1"
            mode="load"
            delay={80}
            className="t-h1 mt-6"
            lines={[
              "Tell us what",
              <>
                you need <span className="serif">built.</span>
              </>,
            ]}
          />

          <div className="mt-12" data-reveal="load" style={d(300)}>
            <p className="label">Email</p>
            <div className="mt-3">
              <CopyEmail email={company.email} className="t-h3" />
            </div>
          </div>

          <div className="mt-12" data-reveal="load" style={d(380)}>
            <p className="label">What happens next</p>
            <ol className="mt-4 border-t border-line">
              {next.map(([n, t]) => (
                <li key={n} className="flex gap-4 border-b border-line py-3">
                  <span className="meta">{n}</span>
                  <span className="text-fg/85">{t}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="meta mt-12 space-y-1" data-reveal="load" style={d(440)}>
            <p className="flex items-center gap-2">
              <span className="status-dot" /> Open to new projects
            </p>
            <p>
              Local time <Clock />
            </p>
            <address className="not-italic">
              {company.legalName}, {company.address.line1}, {company.address.line2}, {company.address.line3}
            </address>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-6 lg:col-start-7" data-reveal="load" style={d(200)}>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
