"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

const EASE = "expo.out";
const SCROLL_ITEMS = '[data-reveal]:not([data-reveal="load"]), [data-lines="scroll"], [data-wipe]';

// Shows everything immediately (reduced motion, or if animation never gets a frame).
function revealAll() {
  document.querySelectorAll(SCROLL_ITEMS).forEach((el) => el.classList.add("is-in"));
}

/**
 * Smooth scrolling (Lenis) driven by GSAP's ticker, plus every scroll animation on the site:
 *  [data-lines="scroll"]   heading lines slide up from their masks
 *  [data-reveal]           blocks fade and rise, batched with a small stagger
 *  [data-wipe]             images open top-to-bottom
 *  [data-parallax="N"]     element drifts N% of its height while it crosses the screen
 *  [data-rise]             footer logo rises into place as the page ends
 */
export function Motion() {
  const pathname = usePathname();

  // ---------- Lenis: created once ----------
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, anchors: { offset: -80 }, autoRaf: false });
    window.__lenis = lenis;
    document.documentElement.classList.add("lenis");

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      window.__lenis = undefined;
      document.documentElement.classList.remove("lenis");
    };
  }, []);

  // ---------- Animations: rebuilt on every page ----------
  const firstRun = useRef(true);
  useEffect(() => {
    if (!firstRun.current) {
      // The loader only plays before the first page, so later pages shouldn't wait for it.
      document.documentElement.classList.remove("has-loader");
      // After client-side navigation, start the new page at the top (Lenis keeps its own position),
      // unless the link points at a section (e.g. /services#crm).
      if (!window.location.hash) window.__lenis?.scrollTo(0, { immediate: true, force: true });
    }
    firstRun.current = false;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealAll();
      return;
    }

    const ctx = gsap.context(() => {
      // Heading lines
      gsap.utils.toArray<HTMLElement>('[data-lines="scroll"]').forEach((el) => {
        // y: 0 explicitly: the CSS start state (translateY 108%) would otherwise be parsed by
        // GSAP into a leftover pixel offset that keeps the line hidden below its mask.
        gsap.fromTo(
          el.querySelectorAll(".line-inner"),
          { y: 0, yPercent: 108 },
          {
            y: 0,
            yPercent: 0,
            duration: 1.1,
            ease: EASE,
            stagger: 0.08,
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          },
        );
      });

      // Blocks, batched so neighbours enter together with a stagger
      const blocks = gsap.utils.toArray<HTMLElement>('[data-reveal]:not([data-reveal="load"])');
      gsap.set(blocks, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(blocks, {
        start: "top 92%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1, ease: EASE, stagger: 0.08, overwrite: true }),
      });

      // Image wipes
      gsap.utils.toArray<HTMLElement>("[data-wipe]").forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: "inset(0% 0% 100% 0%)" },
          {
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 1.4,
            ease: "expo.inOut",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          },
        );
      });

      // Parallax
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amount = Number(el.dataset.parallax || 10);
        gsap.fromTo(
          el,
          { yPercent: -amount / 2 },
          {
            yPercent: amount / 2,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });

      // Hero elements: drift from their resting place as soon as the page scrolls
      gsap.utils.toArray<HTMLElement>("[data-parallax-hero]").forEach((el) => {
        gsap.to(el, {
          yPercent: Number(el.dataset.parallaxHero || 20),
          ease: "none",
          scrollTrigger: { trigger: el, start: 0, end: "bottom top", scrub: true },
        });
      });

      // Footer logo rising into place
      gsap.utils.toArray<HTMLElement>("[data-rise]").forEach((el) => {
        gsap.fromTo(
          el,
          { yPercent: 45, autoAlpha: 0.2 },
          {
            yPercent: 0,
            autoAlpha: 1,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom bottom", scrub: 0.6 },
          },
        );
      });
    });

    // Layout can shift as fonts and images load: re-measure.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const t1 = window.setTimeout(refresh, 600);

    // Safety net: if the browser never gives us an animation frame, show everything.
    let frames = 0;
    const count = () => {
      frames++;
    };
    gsap.ticker.add(count);
    const t2 = window.setTimeout(() => {
      gsap.ticker.remove(count);
      if (frames === 0) {
        ctx.revert();
        revealAll();
      }
    }, 2500);

    return () => {
      window.removeEventListener("load", refresh);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      gsap.ticker.remove(count);
      ctx.revert();
    };
  }, [pathname]);

  return null;
}
