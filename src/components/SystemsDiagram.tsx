// How the Whole Story system fits together. SVG on wider screens, a stacked flow on phones.
type Node = { id: string; x: number; y: number; w: number; label: string; ours?: boolean };

const H = 48;
const nodes: Node[] = [
  { id: "artists", x: 20, y: 160, w: 170, label: "Artists & labels" },
  { id: "web", x: 230, y: 40, w: 170, label: "Website", ours: true },
  { id: "portal", x: 230, y: 160, w: 170, label: "Artist portal", ours: true },
  { id: "forms", x: 230, y: 280, w: 170, label: "Application forms", ours: true },
  { id: "api", x: 440, y: 160, w: 170, label: "Backend & APIs", ours: true },
  { id: "crm", x: 440, y: 280, w: 170, label: "CRM tools", ours: true },
  { id: "dist", x: 650, y: 160, w: 196, label: "Distribution platform", ours: true },
  { id: "stores", x: 876, y: 160, w: 108, label: "70+ stores" },
];

const edges = [
  "M190 184 C212 184 208 64 230 64",
  "M190 184 L230 184",
  "M190 184 C212 184 208 304 230 304",
  "M315 88 L315 160",
  "M400 184 L440 184",
  "M400 304 L440 304",
  "M610 184 L650 184",
  "M846 184 L876 184",
];

export function SystemsDiagram() {
  return (
    <figure>
      <svg viewBox="0 0 1000 400" className="hidden w-full md:block" role="img" aria-labelledby="sd-title">
        <title id="sd-title">
          Artists and labels reach the website, artist portal and application forms. Forms feed the CRM tools; the portal
          talks to the backend, which syncs with the CRM and drives the distribution platform, which delivers to 70+
          stores. Everything runs on servers maintained by Shader Labs.
        </title>
        <defs>
          <marker id="sd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 Z" fill="#8c8c85" />
          </marker>
        </defs>

        {edges.map((e) => (
          <path key={e} d={e} fill="none" stroke="#8c8c85" strokeWidth="1" markerEnd="url(#sd-arrow)" />
        ))}
        {/* CRM <-> backend sync */}
        <path d="M525 280 L525 208" fill="none" stroke="#c6ff3d" strokeWidth="1" markerEnd="url(#sd-arrow)" markerStart="url(#sd-arrow)" />
        <text x="535" y="250" fill="#8c8c85" fontSize="11" fontFamily="var(--font-jetbrains), monospace">
          sync
        </text>

        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={H}
              rx="4"
              fill={n.ours ? "#131311" : "transparent"}
              stroke={n.ours ? "rgba(237,237,232,.4)" : "rgba(237,237,232,.22)"}
              strokeDasharray={n.ours ? undefined : "4 4"}
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + H / 2 + 4.5}
              textAnchor="middle"
              fill={n.ours ? "#EDEDE8" : "#8c8c85"}
              fontSize="13"
              fontFamily="var(--font-jetbrains), monospace"
            >
              {n.label}
            </text>
          </g>
        ))}

        <rect x="230" y="350" width="590" height="34" rx="4" fill="none" stroke="rgba(237,237,232,.22)" />
        <text x="525" y="371.5" textAnchor="middle" fill="#8c8c85" fontSize="12" fontFamily="var(--font-jetbrains), monospace">
          Servers: set up, monitored and maintained by Shader Labs
        </text>
      </svg>

      {/* Phone version */}
      <ol className="space-y-3 md:hidden">
        {[
          ["Artists & labels", "arrive via the website, artist portal and application forms"],
          ["Application forms", "feed the custom CRM tools"],
          ["Artist portal", "talks to the backend & APIs, which sync with the CRM"],
          ["Backend", "drives the distribution platform"],
          ["Distribution platform", "delivers releases to 70+ stores"],
          ["Servers", "set up, monitored and maintained by Shader Labs"],
        ].map(([a, b]) => (
          <li key={a} className="border-l border-line-strong pl-4">
            <span className="meta block text-fg">{a}</span>
            <span className="meta block">{b}</span>
          </li>
        ))}
      </ol>

      <figcaption className="meta mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-[2px] border border-[rgba(237,237,232,.4)] bg-surface" /> Built and run by
          Shader Labs
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-[2px] border border-dashed border-[rgba(237,237,232,.3)]" /> Outside the system
        </span>
      </figcaption>
    </figure>
  );
}
