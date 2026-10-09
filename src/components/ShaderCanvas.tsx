"use client";

import { useEffect, useRef, useState } from "react";

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Ordered dithering (Bayer 8x8), the look of early game renderers, in the logo's green
// palette: a lit, textured planet with a ring. The light follows the cursor.
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_px;
uniform float u_active;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / u_px);
  vec2 fc = (cell + 0.5) * u_px;
  vec2 p = (fc - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 m = (u_mouse - 0.5) * vec2(u_res.x / min(u_res.x, u_res.y), u_res.y / min(u_res.x, u_res.y));
  float t = u_time;
  float b = 0.0;

  // Sized so the ring's widest point (r * 1.58 + its thickness) stays inside the canvas (+-0.5)
  float r = 0.29;
  float d = length(p);
  // ring: tilted ellipse with a solid core (~2 dither cells) so it reads as one continuous line
  vec2 rp = vec2(p.x, p.y * 3.4 + p.x * 0.55);
  float ring = abs(length(rp) - r * 1.58);
  float ringMask = smoothstep(0.016, 0.007, ring) * 0.78; // ~lime tone in the ramp below
  bool behind = (p.y * 3.4 + p.x * 0.55) > 0.0 && d < r;
  if (d < r) {
    float z = sqrt(r * r - d * d);
    vec3 n = normalize(vec3(p, z));
    vec2 sph = vec2(atan(n.x, n.z) + t * 0.12, n.y);
    float tex = fbm(sph * vec2(2.2, 4.0) + vec2(0.0, t * 0.02));
    float bands = 0.5 + 0.5 * sin(n.y * 18.0 + tex * 6.0);
    vec3 l = normalize(vec3(m * 1.6 + vec2(-0.25, 0.3), 0.7));
    float diff = max(dot(n, l), 0.0);
    b = diff * 0.95 + (tex - 0.5) * 0.45 + bands * 0.12 - 0.08;
    b += pow(1.0 - n.z, 3.0) * 0.25; // rim
    if (!behind) b = max(b, ringMask);
  } else {
    b = ringMask;
  }
  // lit pixels under the cursor turn lime while hovering
  float accent = smoothstep(0.09, 0.0, length(p - m)) * u_active;

  // Multi-tone ordered dithering through the logo's green ramp:
  // ink -> deep olive -> green -> lime -> pale highlight. The Bayer threshold
  // decides, per cell, whether it rounds up to the next tone.
  float v = clamp(b, 0.0, 1.0) * 4.0;
  float level = floor(v + bayer8(cell) - 0.002);
  vec3 col = vec3(0.043, 0.043, 0.039);                         // 0: ink
  if (level >= 1.0) col = vec3(0.17, 0.22, 0.07);               // 1: deep olive
  if (level >= 2.0) col = vec3(0.50, 0.66, 0.10);               // 2: green
  if (level >= 3.0) col = vec3(0.776, 1.0, 0.239);              // 3: lime (#C6FF3D)
  if (level >= 4.0) col = vec3(0.96, 1.0, 0.84);                // 4: highlight
  // cursor: lit cells under the pointer flash cream
  if (level >= 1.0 && accent > 0.5) col = vec3(0.929, 0.929, 0.91);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function ShaderCanvas({ className = "", label }: { className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Bumped when the browser restores a lost WebGL context: remounts a fresh canvas.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl || gl.isContextLost()) return;

    let raf = 0;
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.dataset.ready = "false";
    };
    const onRestored = () => setGeneration((g) => g + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uPx = gl.getUniformLocation(prog, "u_px");
    const uActive = gl.getUniformLocation(prog, "u_active");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rest = { x: 0.28, y: 0.72 }; // light position when the cursor is elsewhere
    const mouse = { x: rest.x, y: rest.y, tx: rest.x, ty: rest.y, a: 0, ta: 0 };
    let visible = true;
    const start = performance.now() - 12000;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      // ~3 CSS px per dither pixel
      gl.uniform1f(uPx, Math.max(2, Math.round(3 * dpr)));
    };

    const draw = (now: number) => {
      if (gl.isContextLost()) return;
      resize();
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      mouse.a += (mouse.ta - mouse.a) * 0.08;
      gl.uniform1f(uActive, mouse.a);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      if (gl.isContextLost()) {
        raf = 0;
        return;
      }
      draw(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!reduced && !raf && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (!visible) return; // no layout reads while the hero is off screen
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      const near = x > -0.3 && x < 1.3 && y > -0.3 && y < 1.3;
      mouse.tx = near ? x : rest.x;
      mouse.ty = near ? y : rest.y;
      mouse.ta = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? 1 : 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    io.observe(canvas);

    const onVis = () => kick();
    const onResize = () => (reduced ? draw(performance.now()) : kick());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    // Redraw when the canvas box itself changes size, not just the window.
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

    if (reduced) draw(performance.now());
    else kick();
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Free GPU resources but keep the context alive: React may re-run this
      // effect on the same canvas, and a deliberately lost context can't be reused.
      if (!gl.isContextLost()) {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, [generation]);

  return (
    <canvas
      key={generation}
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block h-full w-full opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100 ${className}`}
    />
  );
}
