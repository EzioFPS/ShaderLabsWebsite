"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WorkRow } from "@/lib/content";
import { ArrowUpRight } from "./Icons";

// Animated previews, GIF-style:
//  websites -> a tall stitched capture of the site that slowly scrolls top to bottom and back
//  Baoli    -> a crossfade through in-game scenes
const scrollShots: Partial<Record<WorkRow["preview"], { src: string; width: number; height: number }>> = {
  wsd: { src: "/work/wsd-scroll.webp", width: 880, height: 2200 },
  av: { src: "/work/av-scroll.webp", width: 880, height: 2200 },
  igl: { src: "/work/igl-scroll.webp", width: 880, height: 2083 },
};
const baoliScenes = ["/work/baoli-key.png", "/work/baoli-ingame-1.jpg", "/work/baoli-ingame-2.jpg", "/work/baoli-ingame-3.jpg"];

function Preview({ kind, eager = false }: { kind: WorkRow["preview"]; eager?: boolean }) {
  const shot = scrollShots[kind];
  if (shot) {
    return (
      <Image
        src={shot.src}
        alt=""
        width={shot.width}
        height={shot.height}
        sizes="(min-width: 768px) 420px, 100vw"
        loading={eager ? "eager" : "lazy"}
        className="preview-scroll h-full w-full"
      />
    );
  }
  return (
    <div className="relative h-full w-full bg-ink">
      {baoliScenes.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes="(min-width: 768px) 420px, 100vw"
          loading={eager ? "eager" : "lazy"}
          className="preview-fade object-cover"
          style={{ animationDelay: `${i * 3}s` }}
        />
      ))}
    </div>
  );
}

export function WorkIndex({ rows }: { rows: WorkRow[] }) {
  const [active, setActive] = useState<WorkRow | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0, tx: 0, ty: 0, raf: 0 });

  useEffect(() => {
    const p = pos.current;
    const tick = () => {
      p.x += (p.tx - p.x) * 0.14;
      p.y += (p.ty - p.y) * 0.14;
      if (boxRef.current) boxRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      p.raf = requestAnimationFrame(tick);
    };
    p.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(p.raf);
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    pos.current.tx = e.clientX + 24;
    pos.current.ty = e.clientY - 120;
  };

  const enter = (row: WorkRow) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (!active) {
      pos.current.x = pos.current.tx = e.clientX + 24;
      pos.current.y = pos.current.ty = e.clientY - 120;
    }
    setActive(row);
  };

  return (
    <div onPointerMove={onMove} onPointerLeave={() => setActive(null)} className="relative">
      <ul className="border-t border-line">
        {rows.map((row, i) => {
          const inner = (
            <>
              <span className="meta col-span-2 md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
              <span
                className={`t-h2 col-span-10 md:col-span-5 ${
                  row.href ? "transition-transform duration-500 ease-[cubic-bezier(.2,.7,0,1)] group-hover:translate-x-3" : ""
                }`}
              >
                {row.title}
              </span>
              <span className="meta col-span-10 col-start-3 md:col-span-3 md:col-start-auto">{row.what}</span>
              <span className="meta col-span-6 col-start-3 md:col-span-2 md:col-start-auto">
                {row.kind} · {row.period}
              </span>
              <span className="col-span-4 flex justify-end md:col-span-1">
                {row.href && <ArrowUpRight className="h-5 w-5 text-muted transition-colors group-hover:text-lime" />}
              </span>
              {/* Touch screens: inline screenshot instead of the cursor preview */}
              <span className="col-span-10 col-start-3 mt-3 block aspect-[16/9] overflow-hidden rounded-md border border-line md:hidden">
                <Preview kind={row.preview} />
              </span>
            </>
          );
          const cls = "group grid grid-cols-12 items-baseline gap-x-4 gap-y-2 py-6 md:py-8";
          return (
            <li key={row.title} className="border-b border-line">
              {row.href ? (
                <Link href={row.href} onPointerEnter={enter(row)} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div onPointerEnter={enter(row)} className={cls}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Cursor-following preview (desktop mouse only) */}
      <div
        ref={boxRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-40 hidden md:block"
        style={{ willChange: "transform" }}
      >
        <div
          className="relative aspect-[16/10] w-[26rem] overflow-hidden rounded-md border border-line bg-surface shadow-2xl transition-[clip-path,opacity] duration-500 ease-[cubic-bezier(.2,.7,0,1)]"
          style={{ clipPath: active ? "inset(0 0 0 0)" : "inset(50% 0 50% 0)", opacity: active ? 1 : 0 }}
        >
          {/* All previews stay mounted (so images are loaded before the first hover);
              only the active one is visible and animating. */}
          {rows.map((row) => {
            const on = active?.preview === row.preview;
            return (
              <div
                key={row.preview}
                className={`absolute inset-0 transition-opacity duration-300 ${on ? "opacity-100" : "preview-paused opacity-0"}`}
              >
                <Preview kind={row.preview} eager />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
