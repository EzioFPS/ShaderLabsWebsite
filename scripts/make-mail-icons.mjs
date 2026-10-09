// Generates the Shader Labs Mail app icons (PNG) into public/admin/:
// the logo's four-sphere trail on the site's ink background, plus a monochrome badge.
//   node scripts/make-mail-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = new URL("../public/admin/", import.meta.url);

// ---------- tiny PNG encoder (RGBA, no dependencies) ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- drawing ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function ramp(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}

// The logo's sphere shading (components/Logo.tsx), trailing -> lead.
const SPHERES = [
  [[0, hex("#2c3812")], [1, hex("#151b0a")]],
  [[0, hex("#4f661c")], [1, hex("#2a3610")]],
  [[0, hex("#8db92a")], [1, hex("#5e7c1c")]],
  [[0, hex("#F4FFD6")], [0.28, hex("#D8FF6A")], [0.7, hex("#B5F02A")], [1, hex("#7FA81A")]],
];
const OFFSETS = [4457, 4698, 4936, 5170].map((x) => (x - 4813.5) / 374); // centred, in radii

function icon(size, { radius, bg = hex("#0b0b0a"), corner = 0 }) {
  const SS = 4; // supersampling per axis
  const out = Buffer.alloc(size * size * 4);
  const R = size * radius;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      let alpha = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          // rounded-square mask (corner = 0 means full square)
          if (corner) {
            const r = corner * size;
            const dx = Math.max(r - px, px - (size - r), 0);
            const dy = Math.max(r - py, py - (size - r), 0);
            if (dx * dx + dy * dy > r * r) continue;
          }
          let c = bg;
          // spheres, trailing first so the lead sits on top
          SPHERES.forEach((stops, i) => {
            const cx = size / 2 + OFFSETS[i] * R;
            const d = Math.hypot(px - cx, py - cy);
            if (d > R) return;
            // radial gradient from a highlight up-left of centre
            const hx = cx - R * 0.28;
            const hy = cy - R * 0.32;
            const t = Math.min(1, Math.hypot(px - hx, py - hy) / (R * 1.25));
            let col = ramp(stops, t);
            if (i === 3) {
              // specular highlight on the lead sphere
              const ex = (px - (cx - R * 0.32)) / (R * 0.25);
              const ey = (py - (cy - R * 0.37)) / (R * 0.16);
              if (ex * ex + ey * ey < 1) col = mix(col, [255, 255, 255], 0.55);
            }
            // soft 1px edge so overlapping spheres read as separate
            const edge = Math.min(1, (R - d) / (size / 256));
            c = mix(c, col, edge);
          });
          acc = acc.map((v, k) => v + c[k]);
          alpha++;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      if (alpha) {
        out[o] = Math.round(acc[0] / alpha);
        out[o + 1] = Math.round(acc[1] / alpha);
        out[o + 2] = Math.round(acc[2] / alpha);
      }
      out[o + 3] = Math.round((alpha / n) * 255);
    }
  }
  return png(size, out);
}

// Monochrome badge (Android status bar): a white envelope on transparent.
function badge(size) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 4;
  const m = size * 0.16;
  const w = size - 2 * m;
  const h = w * 0.72;
  const top = (size - h) / 2;
  const stroke = size * 0.075;
  const onSeg = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy)) <= stroke / 2;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const inBox = px >= m && px <= m + w && py >= top && py <= top + h;
          const inInner = px >= m + stroke && px <= m + w - stroke && py >= top + stroke && py <= top + h - stroke;
          const border = inBox && !inInner;
          const flap = onSeg(px, py, m + stroke / 2, top + stroke / 2, size / 2, top + h * 0.55) || onSeg(px, py, m + w - stroke / 2, top + stroke / 2, size / 2, top + h * 0.55);
          if (border || flap) hit++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = 255;
      out[o + 3] = Math.round((hit / (SS * SS)) * 255);
    }
  }
  return png(size, out);
}

const files = {
  "mail-icon-192.png": icon(192, { radius: 0.155 }),
  "mail-icon-512.png": icon(512, { radius: 0.155 }),
  "mail-icon-maskable-512.png": icon(512, { radius: 0.12 }), // spheres inside the safe zone
  "mail-apple-touch-180.png": icon(180, { radius: 0.15 }),
  "mail-badge-96.png": badge(96),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), buf);
  console.log(name, buf.length, "bytes");
}
