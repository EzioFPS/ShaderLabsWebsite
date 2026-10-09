"use client";

import { useEffect, useRef, useState } from "react";

// "Compiling shaders": the logo's sphere trail rendered live with 1-bit ordered dithering.
// Spheres light up one by one with progress while the dither pixels shrink from coarse to fine,
// like a renderer resolving. Shown once per browser session (see the inline script in layout.tsx).

const VERT = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_progress;
uniform float u_px;

float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main(){
  vec2 cell = floor(gl_FragCoord.xy / u_px);
  vec2 fc = (cell + 0.5) * u_px;
  // Logo proportions: four spheres, radius 1, centres 0.64 apart
  vec2 p = (fc - 0.5 * u_res) / (u_res.y * 0.42);
  vec3 col = vec3(0.043, 0.043, 0.039);
  vec3 lightDir = normalize(vec3(cos(u_time * 0.8) * 0.6 - 0.3, 0.55 + sin(u_time * 0.6) * 0.15, 0.75));

  // Draw back to front so the lead sphere sits on top
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float appear = smoothstep(fi * 0.22, fi * 0.22 + 0.16, u_progress);
    vec2 c = vec2(-0.96 + fi * 0.64, 0.0);
    vec2 d = p - c;
    float r = 1.0;
    float dist = length(d);
    if (dist < r && appear > 0.0) {
      vec3 n = normalize(vec3(d / r, sqrt(max(0.0, 1.0 - dot(d, d) / (r * r)))));
      float diff = max(dot(n, lightDir), 0.0);
      float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
      float b = (0.18 + diff * 0.9 + spec * 0.8) * appear;
      float t = bayer8(cell) + 0.002;
      float bit = step(t, b);
      vec3 tint = i == 3 ? vec3(0.776, 1.0, 0.239)
                : i == 2 ? vec3(0.55, 0.72, 0.17)
                : i == 1 ? vec3(0.31, 0.40, 0.11)
                :          vec3(0.17, 0.22, 0.07);
      vec3 lit = mix(tint, vec3(0.93, 0.93, 0.91), spec * 0.8);
      col = mix(vec3(0.043, 0.043, 0.039), lit, bit);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const MIN_MS = 1500; // long enough to read, short enough not to annoy
const MAX_MS = 4500; // never hold the site longer than this

export function Loader() {
  const [state, setState] = useState<"hidden" | "loading" | "leaving" | "done">("hidden");
  const [pct, setPct] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progress = useRef(0);

  // Decide on mount: the inline head script already chose via the `is-loading` class.
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("is-loading")) {
      setState("done");
      return;
    }
    setState("loading");
    // Freeze smooth scroll while the loader is up.
    const stopScroll = window.setTimeout(() => window.__lenis?.stop(), 0);

    const start = performance.now();
    let ready = false; // fonts + page loaded
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const pageLoaded =
      document.readyState === "complete" ? Promise.resolve() : new Promise((r) => window.addEventListener("load", () => r(null), { once: true }));
    Promise.all([fontsReady, pageLoaded]).then(() => {
      ready = true;
    });

    // Progress is a function of elapsed time (not frame count), so throttled
    // or background tabs can't stall it.
    const progressAt = (elapsed: number) => {
      const timeCurve = 1 - Math.pow(1 - Math.min(1, elapsed / MIN_MS), 2.2); // 0 -> 1 over MIN_MS
      if (ready || elapsed > MAX_MS) return timeCurve;
      return Math.min(timeCurve, 0.85); // hold at 85% until the page is ready
    };

    let raf = 0;
    let finished = false;
    const tick = (now: number) => {
      const p = progressAt(now - start);
      progress.current = p;
      setPct(Math.round(p * 100));
      if (p >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Backstop: even with no animation frames at all, finish on time.
    const backstop = window.setTimeout(() => {
      progress.current = 1;
      setPct(100);
      finish();
    }, MAX_MS);

    let leaveTimer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(backstop);
      setState("leaving");
      try {
        sessionStorage.setItem("sl-loaded", "1");
      } catch {}
      window.__lenis?.start();
      leaveTimer = window.setTimeout(() => setState("done"), 1000);
    };

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(stopScroll);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(backstop);
    };
  }, []);

  // Drop the page-level class only after the exit wipe class is on the overlay (no flash).
  useEffect(() => {
    if (state === "leaving" || state === "done") document.documentElement.classList.remove("is-loading");
  }, [state]);

  // The shader itself
  useEffect(() => {
    if (state !== "loading") return;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false });
    if (!canvas || !gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
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
    const uProg = gl.getUniformLocation(prog, "u_progress");
    const uPx = gl.getUniformLocation(prog, "u_px");

    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      const pr = progress.current;
      // coarse -> fine: 22px dither cells down to 3px
      const px = Math.max(2, Math.round((22 - 19 * Math.pow(pr, 0.7)) * dpr));
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.uniform1f(uProg, pr);
      gl.uniform1f(uPx, px);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [state]);

  if (state === "done") return null;

  return (
    <div
      className={`loader fixed inset-0 z-[100] flex-col bg-ink ${state === "leaving" ? "loader-leave" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading Shader Labs, ${pct}%`}
    >
      <div className="container-x meta flex items-center justify-between pt-6">
        <span>Shader Labs</span>
        <span>Est. 2023</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-5">
        <canvas ref={canvasRef} aria-hidden="true" className="aspect-[2.4/1] w-[min(86vw,40rem)]" />
      </div>

      <div className="container-x pb-6">
        <div className="meta flex items-end justify-between gap-4">
          <span>
            Compiling shaders<span className="loader-dots" aria-hidden="true" />
          </span>
          <span className="stat text-fg tabular-nums" aria-hidden="true">{String(pct).padStart(3, "0")}%</span>
        </div>
        <div className="mt-4 h-px w-full bg-line">
          <div className="h-px bg-lime" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
