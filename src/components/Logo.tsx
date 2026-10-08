import { SphereTrail } from "./SphereTrail";

// Shader Labs logo, redrawn as clean vector art on the original geometry
// (shaderlabs.in): a two-line wide wordmark and a trail of four overlapping spheres.
// Text uses the site's Archivo at full width/weight; textLength pins each line to the
// original's exact width, so the overall shape matches at any size.
//
// `animated`: the spheres are rendered live by a looping pixel shader (SphereTrail)
// instead of static vector circles. Used for the big footer logo.

type Props = { className?: string; title?: string; animated?: boolean };

// Original logo geometry (units of the source artwork)
const VB = { x: 240, y: 270, w: 5380, h: 1560 };
const R = 374; // sphere radius
const CY = 1436; // sphere centre line
const CX = [4457, 4698, 4936, 5170]; // trailing -> lead
// Bounding box of the sphere trail, for positioning the live canvas
const TRAIL = { x: CX[0] - R, y: CY - R, w: CX[3] + R - (CX[0] - R), h: 2 * R };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function Wordmark() {
  return (
    <g
      fill="#EDEDE8"
      style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif", fontVariationSettings: "'wdth' 125, 'wght' 900", fontWeight: 900 }}
    >
      <text x="234" y="983" fontSize="1000" textLength="5387" lengthAdjust="spacingAndGlyphs">
        SHADER
      </text>
      <text x="216" y="1741" fontSize="1000" textLength="3575" lengthAdjust="spacingAndGlyphs">
        LABS
      </text>
    </g>
  );
}

function StaticSpheres() {
  const id = "sl"; // gradient ids are identical in every instance, so duplicates are harmless
  return (
    <>
      <defs>
        <radialGradient id={`${id}-lead`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#F4FFD6" />
          <stop offset="0.28" stopColor="#D8FF6A" />
          <stop offset="0.7" stopColor="#B5F02A" />
          <stop offset="1" stopColor="#7FA81A" />
        </radialGradient>
        {[0, 1, 2].map((i) => (
          <radialGradient key={i} id={`${id}-trail-${i}`} cx="0.38" cy="0.34" r="0.8">
            <stop offset="0" stopColor={["#2c3812", "#4f661c", "#8db92a"][i]} />
            <stop offset="1" stopColor={["#151b0a", "#2a3610", "#5e7c1c"][i]} />
          </radialGradient>
        ))}
      </defs>
      {CX.slice(0, 3).map((cx, i) => (
        <circle key={cx} cx={cx} cy={CY} r={R} fill={`url(#${id}-trail-${i})`} />
      ))}
      <circle cx={CX[3]} cy={CY} r={R} fill={`url(#${id}-lead)`} />
      <ellipse
        cx={CX[3] - 120}
        cy={CY - 140}
        rx="95"
        ry="60"
        fill="#FFFFFF"
        opacity="0.55"
        transform={`rotate(-30 ${CX[3] - 120} ${CY - 140})`}
      />
    </>
  );
}

export function Logo({ className = "h-8 w-auto", title = "Shader Labs", animated = false }: Props) {
  const svg = (
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      className={animated ? "absolute inset-0 h-full w-full" : className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Wordmark />
      {!animated && <StaticSpheres />}
    </svg>
  );

  if (!animated) return svg;

  return (
    <div className={`relative ${className}`} style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      {svg}
      {/* Placed exactly over the spheres' box in the artwork */}
      <SphereTrail
        className="absolute block"
        style={{
          left: pct(TRAIL.x - VB.x, VB.w),
          top: pct(TRAIL.y - VB.y, VB.h),
          width: pct(TRAIL.w, VB.w),
          height: pct(TRAIL.h, VB.h),
        }}
      />
    </div>
  );
}
