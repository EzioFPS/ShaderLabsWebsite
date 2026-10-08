"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { company, nav } from "@/lib/content";
import { ArrowRight } from "./Icons";
import { Logo } from "./Logo";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (open) window.__lenis?.stop();
    else window.__lenis?.start();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.__lenis?.start();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      // Sticky glass bar: transparent at the top, frosted blur + hairline once the page scrolls.
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500 ease-out ${
        open
          ? "border-line bg-ink"
          : scrolled
            ? "border-line bg-ink/55 backdrop-blur-xl backdrop-saturate-150"
            : "border-transparent bg-transparent backdrop-blur-none"
      }`}
    >
      {/* Logo and CTA take equal 3-column sides, so the nav centres on the page */}
      <div className="container-x grid h-16 grid-cols-12 items-center gap-x-6">
        <Link href="/" aria-label="Shader Labs, home" className="col-span-6 w-fit md:col-span-3">
          <Logo className="h-7 w-auto md:h-8" />
        </Link>

        <nav aria-label="Main" className="col-span-6 hidden items-center justify-center gap-5 md:flex lg:gap-7">
          {[{ href: "/", label: "Home" }, ...nav, { href: "/contact", label: "Contact" }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`u-link text-[0.9375rem] transition-colors hover:text-fg ${isActive(item.href) ? "text-fg" : "text-muted"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="col-span-6 flex justify-end md:col-span-3">
          <Link href="/contact" className="btn btn-primary btn-sm hidden md:inline-flex">
            Start a project <ArrowRight />
          </Link>
          <button
            type="button"
            className="meta -mr-2 flex h-11 items-center gap-2 px-2 text-fg md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
            <span className="relative block h-2.5 w-4" aria-hidden="true">
              <span className={`absolute left-0 h-px w-4 bg-fg transition-transform duration-300 ${open ? "top-1 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 h-px w-4 bg-fg transition-transform duration-300 ${open ? "top-1 -rotate-45" : "top-2"}`} />
            </span>
          </button>
        </div>
      </div>

      <div id="mobile-menu" hidden={!open} className="h-[calc(100dvh-4rem)] overflow-y-auto bg-ink md:hidden">
        <nav aria-label="Mobile" className="container-x flex h-full flex-col pt-6 pb-10">
          <ul className="border-t border-line">
            {[{ href: "/", label: "Home" }, ...nav, { href: "/contact", label: "Contact" }].map((item) => (
              <li key={item.href} className="border-b border-line">
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="t-h1 block py-4 transition-colors hover:text-lime"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="meta mt-auto flex flex-col gap-2 pt-10">
            <a href={`mailto:${company.email}`} className="text-fg">
              {company.email}
            </a>
            <span className="flex items-center gap-2">
              <span className="status-dot" /> Open to new projects
            </span>
          </div>
        </nav>
      </div>
    </header>
  );
}
