import Image from "next/image";
import { founders } from "@/lib/content";

// Founder portraits (black & white, 3:4) with name and role.
export function Founders() {
  return (
    <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2">
      {founders.map((f, i) => (
        <li key={f.name} className="min-w-0" data-reveal>
          <div className="aspect-[3/4] overflow-hidden rounded-md bg-surface" data-wipe>
            <Image
              src={f.photo}
              alt={`${f.name}, ${f.role} of Shader Labs`}
              width={1086}
              height={1448}
              sizes="(min-width: 1280px) 34vw, (min-width: 640px) 45vw, 100vw"
              priority={i === 0}
              className="h-full w-full object-cover grayscale"
            />
          </div>
          <h3 className="t-h2 mt-6">{f.name}</h3>
          <p className="meta mt-2">{f.role}</p>
        </li>
      ))}
    </ul>
  );
}
