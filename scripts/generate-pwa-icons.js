#!/usr/bin/env node
// Generates public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png.
// Dependency-free: hand-rolled PNG encoder (zlib deflate + crc32 table).
// Mark: Dialout chevron + dot, white on the #0c0e13 terminal ground.
// Geometry is the 24-unit grid from docs/brand/brand-guidelines.md:
//   chevron  M 4 17 L 12 7 L 20 17, stroke 3, round caps and joins
//   dot      circle cx 12 cy 20.5 r 1.75
// Rendered from a signed distance field rather than stamped discs, so the
// edges are antialiased at every size instead of stair-stepping at 180px.
const { deflateSync } = require('node:zlib');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);

  // --- brand geometry, in 24-grid units -------------------------------------
  const CHEVRON = [[4, 17], [12, 7], [20, 17]];
  const STROKE_HALF = 1.5;      // stroke-width 3
  const DOT = { x: 12, y: 20.5, r: 1.75 };

  // Mark bounding box including stroke and dot, used to centre optically
  // rather than on the raw path box — the apex and the dot are what the eye
  // reads, so the box has to include the round caps.
  const BOX = { x0: 4 - STROKE_HALF, x1: 20 + STROKE_HALF,
                y0: 7 - STROKE_HALF, y1: DOT.y + DOT.r };

  // Mark occupies 62% of the tile: inside the iOS mask and the Android
  // maskable safe zone, without looking lost in the middle.
  const s = (0.62 * size) / (BOX.x1 - BOX.x0);
  const ox = size / 2 - ((BOX.x0 + BOX.x1) / 2) * s;
  const oy = size / 2 - ((BOX.y0 + BOX.y1) / 2) * s;
  const X = (u) => u * s + ox;
  const Y = (u) => u * s + oy;

  // --- signed distance helpers ---------------------------------------------
  const segDist = (px_, py_, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay;
    const wx = px_ - ax, wy = py_ - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px_ - (ax + t * vx), py_ - (ay + t * vy));
  };

  const halfPx = STROKE_HALF * s;
  const dotR = DOT.r * s;
  const dotX = X(DOT.x), dotY = Y(DOT.y);
  const pts = CHEVRON.map(([u, v]) => [X(u), Y(v)]);

  // Round caps and joins fall out of the capsule union for free: the distance
  // to a segment is already radial at the endpoints.
  const dist = (x, y) => {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - halfPx;
      if (seg < d) d = seg;
    }
    const dot = Math.hypot(x - dotX, y - dotY) - dotR;
    return dot < d ? dot : d;
  };

  // --- composite ------------------------------------------------------------
  const BG = [0x0c, 0x0e, 0x13];   // terminal ground
  const FG = [0xff, 0xff, 0xff];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = dist(x + 0.5, y + 0.5);
      // 1px linear ramp across the boundary. clamp(0.5 - d, 0, 1)
      let a = 0.5 - d;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const i = (y * size + x) * 4;
      px[i]     = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      px[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      px[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
      px[i + 3] = 255;
    }
  }
  return px;
}

for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const out = join(__dirname, '..', 'public', file);
  writeFileSync(out, png(size, draw(size)));
  console.log('wrote', out);
}
