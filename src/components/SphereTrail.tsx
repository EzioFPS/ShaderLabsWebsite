"use client";

import { useEffect, useRef } from "react";

// The logo's four spheres, rendered live and looping:
// each ball builds itself out of pixels (coarse -> fine, pixels popping in), left to right,
// holds fully lit, then dissolves and starts again.
// Shading is dithered between each ball's own light and dark tones, so they stay as bright
// as the static logo. Canvas covers exactly the sphere box of the logo artwork (1461 x 748 units).

const VERT = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dpr;

float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

const float PERIOD = 7.0;

void main(){
  float unit = u_res.y / 748.0;                 // device px per logo unit
  float T = mod(u_time, PERIOD);
  vec3 L = normalize(vec3(-0.5 + 0.18 * sin(u_time * 0.7), 0.45 + 0.1 * cos(u_time * 0.5), 0.75));
  vec4 outc = vec4(0.0);

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float start = 0.25 + fi * 0.6;
    float form = smoothstep(start, start + 1.0, T);
    float gone = smoothstep(PERIOD - 0.9, PERIOD - 0.15, T);
    float f = form * (1.0 - gone);
    if (f <= 0.0) continue;

    // Dither cell size shrinks as the ball forms: 26px -> 3px (CSS px)
    float pxDev = max(2.0, floor(mix(26.0, 3.0, pow(f, 0.55)) * u_dpr + 0.5));
    vec2 cell = floor(gl_FragCoord.xy / pxDev);
    vec2 fc = (cell + 0.5) * pxDev / unit;      // cell centre in logo units

    float cx = 374.0 + (i == 1 ? 241.0 : i == 2 ? 479.0 : i == 3 ? 713.0 : 0.0);
    vec2 d = (fc - vec2(cx, 374.0)) / 374.0;
    float dd = dot(d, d);
    if (dd >= 1.0) continue;

    // Pixels pop in randomly while forming, and out while dissolving
    if (hash(cell + fi * 31.7) > f * 1.12) continue;

    vec3 n = vec3(d, sqrt(1.0 - dd));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
    float shade = 0.18 + 0.82 * diff;
    float th = bayer8(cell);

    vec3 dark  = i == 3 ? vec3(0.50, 0.66, 0.10) : i == 2 ? vec3(0.37, 0.49, 0.11) : i == 1 ? vec3(0.16, 0.21, 0.06) : vec3(0.08, 0.10, 0.04);
    vec3 light = i == 3 ? vec3(0.85, 1.00, 0.42) : i == 2 ? vec3(0.55, 0.73, 0.16) : i == 1 ? vec3(0.31, 0.40, 0.11) : vec3(0.17, 0.22, 0.07);
    vec3 col = mix(dark, light, step(th, shade));
    if (i == 3 && spec * 1.3 > th + 0.15) col = vec3(0.96, 1.0, 0.86);
    outc = vec4(col, 1.0);
  }
  gl_FragColor = outc;
}
`;

export function SphereTrail({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG);
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
    const uDpr = gl.getUniformLocation(prog, "u_dpr");
    gl.clearColor(0, 0, 0, 0);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, w, h);
      // Reduced motion: a single, fully formed frame
      gl.uniform1f(uTime, reduced ? 4.5 : (now - t0) / 1000);
      gl.uniform1f(uDpr, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      draw(now);
      raf = visible && !document.hidden && !reduced ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    // Only animate while the footer is on screen
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    const onResize = () => (reduced ? draw(performance.now()) : kick());
    window.addEventListener("resize", onResize);

    if (reduced) draw(performance.now());
    else kick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      if (!gl.isContextLost()) {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}
