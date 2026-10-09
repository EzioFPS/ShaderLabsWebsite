import Link from "next/link";
import { company, nav } from "@/lib/content";
import { Clock, CopyEmail, Year } from "./Live";
import { Lines } from "./Lines";
import { Logo } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-line bg-ink">
      <div className="container-x pt-20 md:pt-28">
        <div className="grid gap-10 md:grid-cols-12">
          <p className="label md:col-span-3">Start a project</p>
          <div className="min-w-0 md:col-span-9">
            <Lines
              as="h2"
              className="t-h1"
              lines={[
                "Have something",
                <>
                  to <span className="serif">build?</span>
                </>,
              ]}
            />
            <div className="mt-10 md:mt-14">
              <CopyEmail email={company.email} className="t-h2" />
            </div>
            <Link href="/contact" className="arrow-link u-link-static mt-10 text-lg">
              Or tell us about it in the project form →
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-10 md:mt-32 md:grid-cols-12">
          <div className="md:col-span-3">
            <p className="label">Studio</p>
            <p className="mt-4 flex items-center gap-2 text-sm">
              <span className="status-dot" /> Open to new projects
            </p>
            <p className="meta mt-2">
              Local time <Clock />
            </p>
          </div>
          <div className="md:col-span-3">
            <p className="label">Pages</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[{ href: "/", label: "Home" }, ...nav, { href: "/contact", label: "Contact" }].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="u-link text-fg/85 hover:text-fg">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1 md:col-span-3">
            <p className="label">Office</p>
            <address className="mt-4 text-sm not-italic leading-relaxed text-fg/85">
              {company.legalName}
              <br />
              {company.address.line1}
              <br />
              {company.address.line2}
              <br />
              {company.address.line3}
            </address>
          </div>
          <div className="col-span-2 sm:col-span-1 md:col-span-3">
            <p className="label">Company</p>
            <p className="meta mt-4 break-all">CIN {company.cin}</p>
            <p className="meta mt-2">Est. {company.founded}</p>
          </div>
        </div>
      </div>

      {/* The logo, full width */}
      <div className="container-x mt-16 overflow-hidden pb-10" aria-hidden="true">
        <div data-rise>
          <Logo className="w-full" animated />
        </div>
      </div>

      <div className="container-x meta flex flex-col gap-2 border-t border-line py-6 sm:flex-row sm:justify-between">
        <p>
          © <Year initial={year} /> {company.legalName}
        </p>
        <a href="#main" className="u-link w-fit text-fg">
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
