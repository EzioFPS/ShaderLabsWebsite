import type { CSSProperties, ElementType, ReactNode } from "react";

// Heading whose lines slide up from behind a mask.
// mode "load" animates with pure CSS on page load; "scroll" is animated by GSAP (Motion.tsx).
export function Lines({
  as: Tag = "h2",
  lines,
  mode = "scroll",
  delay = 0,
  className = "",
}: {
  as?: ElementType;
  lines: ReactNode[];
  mode?: "load" | "scroll";
  delay?: number;
  className?: string;
}) {
  return (
    <Tag className={className} data-lines={mode} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          <span className="line-inner" style={{ "--i": i } as CSSProperties}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}

export const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
