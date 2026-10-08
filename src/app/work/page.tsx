import type { Metadata } from "next";
import Image from "next/image";
import { PageHead, Section } from "@/components/Blocks";
import { WorkIndex } from "@/components/WorkIndex";
import { workIndex } from "@/lib/content";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected work: Shader Labs is the in-house tech team for Whole Story Distribution, built the website, backend and CRM for Artist Vanguard, and has shipped its own products.",
};

const inEngine = [
  { src: "/work/baoli-ingame-1.jpg", caption: "Interior: volumetric light and set dressing" },
  { src: "/work/baoli-ingame-2.jpg", caption: "Interior: practical lighting, cloth and materials" },
  { src: "/work/baoli-ingame-3.jpg", caption: "In-game computer with a CRT screen shader" },
];

export default function WorkPage() {
  return (
    <>
      <PageHead
        label="Work"
        lines={[
          "We don't just ship.",
          <>
            <span className="serif">We stay.</span>
          </>,
        ]}
        meta={<>Few clients, deep work. Plus the products we&apos;ve shipped ourselves.</>}
        intro="We work with a small number of companies, closely. Usually that means becoming their tech team: owning the website, the backend, the CRM and everything that connects them."
      />
      <section className="container-x pb-8">
        <WorkIndex rows={workIndex} />
      </section>

      <Section label="Baoli, in engine" aside="Real-time scenes from our own game" className="section">
        <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
          {inEngine.map((shot, i) => (
            <figure key={shot.src} className={i === 0 ? "md:col-span-2" : ""}>
              <div className="overflow-hidden rounded-md border border-line bg-surface" data-wipe>
                <Image
                  src={shot.src}
                  alt={`Baoli: ${shot.caption}`}
                  width={1920}
                  height={1080}
                  sizes={i === 0 ? "(min-width: 768px) 75vw, 100vw" : "(min-width: 768px) 37vw, 100vw"}
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="meta mt-3">{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
        <p className="body-muted mt-10 max-w-[52ch]" data-reveal>
          Lighting, materials, shaders and environments built in-house for Baoli, a first-person psychological horror
          game. The same technical art skills go into the pipelines and interactive work we build for clients.
        </p>
      </Section>
    </>
  );
}
