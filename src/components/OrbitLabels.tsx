"use client";

import { useEffect, useRef } from "react";

// Service keywords orbiting the hero planet like moons, on the same tilted ellipse as the
// ring drawn in ShaderCanvas (radius R, y = (R sin t - 0.55 R cos t) / 3.4 in square-canvas units).
// Near side: bright and full size. Far side: smaller, dim, and masked by the planet's disc.

const LABELS = ["Business systems", "Backends", "Pipelines", "CRM tools", "Portals", "Tech art", "Interactive", "Infrastructure"];
const R = 0.29 * 1.58; // ring radius, matches the shader
const PLANET_R = 0.29;
const PERIOD_S = 48; // one full orbit

export function OrbitLabels() {
  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const place = (now: number) => {
      // Same mapping as the shader: centred in the box, scaled by its shorter side.
      const W = box.clientWidth;
      const H = box.clientHeight;
      const S = Math.min(W, H);
      const base = reduced ? 0 : ((now - t0) / 1000 / PERIOD_S) * Math.PI * 2;
      const els = itemRefs.current;
      const sizes = els.map((el) => (el ? [el.offsetWidth, el.offsetHeight] : [0, 0])); // read all before writing
      els.forEach((el, i) => {
        if (!el) return;
        const t = base + (i / LABELS.length) * Math.PI * 2;
        const x = R * Math.cos(t);
        const y = (R * Math.sin(t) - 0.55 * R * Math.cos(t)) / 3.4; // up is positive
        const depth = (1 - Math.sin(t)) / 2; // 0 = far, 1 = near
        const scale = 0.82 + 0.18 * depth;
        const cx = W / 2 + x * S;
        const cy = H / 2 - y * S;
        el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = String(0.3 + 0.7 * depth);

        // Occlusion: on the far half, cut the planet's disc out of the label so it slides
        // behind the planet edge. The cut eases in over a short arc as the label crosses to
        // the back, matching where the shader hides the ring.
        const hide = Math.min(1, Math.max(0, Math.sin(t) / 0.12));
        if (hide > 0) {
          const [w, h] = sizes[i];
          const r = (PLANET_R * S) / scale; // planet radius in the label's own (unscaled) pixels
          const mx = (W / 2 - cx) / scale + w / 2; // planet centre in the label's local box
          const my = (H / 2 - cy) / scale + h / 2;
          const mask = `radial-gradient(circle ${r}px at ${mx}px ${my}px, rgba(0,0,0,${1 - hide}) ${r - 0.5}px, #000 ${r + 0.5}px)`;
          el.style.setProperty("mask-image", mask);
          el.style.setProperty("-webkit-mask-image", mask);
        } else {
          el.style.removeProperty("mask-image");
          el.style.removeProperty("-webkit-mask-image");
        }
      });
    };

    const loop = (now: number) => {
      place(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!reduced && !raf && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    io.observe(box);
    const onVis = () => kick();
    const onResize = () => place(performance.now());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    // Box size can change without a window resize (fonts loading, layout shifts), so watch it too.
    const ro = new ResizeObserver(onResize);
    ro.observe(box);

    place(performance.now());
    kick();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div ref={boxRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
      {LABELS.map((label, i) => (
        <span
          key={label}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/70 px-2 py-0.5 font-mono text-xs tracking-[0.04em] text-fg backdrop-blur-sm will-change-transform"
          style={{ opacity: 0 }}
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-lime" />
          {label}
        </span>
      ))}
    </div>
  );
}
