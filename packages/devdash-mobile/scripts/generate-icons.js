#!/usr/bin/env node
/**
 * Generates every Dialout mobile icon asset from one mark definition.
 *
 * Why this exists as a script rather than exported artwork: the icons that
 * shipped before this had their construction guides baked into the PNG —
 * dashed centre lines, two concentric circles and a crosshair, visible at full
 * size on every installed phone. That is what happens when the source of truth
 * is a design file someone exports by hand. Here the guides cannot leak,
 * because there are none: the mark is drawn from its coordinates.
 *
 * Geometry is the 24-unit grid in docs/brand/brand-guidelines.md:
 *   chevron  M 4 17 L 12 7 L 20 17, stroke 3, round caps and joins
 *   dot      circle cx 12 cy 20.5 r 1.75
 * At 1024 that is a 128px stroke and a 74px dot radius, matching the numbers
 * in docs/brand/mobile-app-identity.md.
 *
 * Rendered from a signed distance field, so edges are antialiased at every
 * size and there is no resampling step to soften them.
 *
 * Run: node scripts/generate-icons.js
 */
const { deflateSync } = require('node:zlib');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

/* ── PNG encoding ────────────────────────────────────────────────────────
   Colour type 2 (RGB) when the image must have no alpha channel — iOS
   rejects app icons with transparency — and type 6 (RGBA) for the Android
   foreground, monochrome and splash layers, which must be transparent. */
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

function png(size, pixels, alpha) {
  const channels = alpha ? 4 : 3;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = alpha ? 6 : 2;        // colour type: RGBA or RGB
  const stride = size * channels;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;    // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/* ── The mark ───────────────────────────────────────────────────────────── */
const CHEVRON = [[4, 17], [12, 7], [20, 17]];
const STROKE_HALF = 1.5;
const DOT = { x: 12, y: 20.5, r: 1.75 };

// Bounding box including the round caps and the dot. Centring on the raw path
// box instead would push the mark low, because the caps and the dot are what
// the eye actually reads as the edges.
const BOX = {
  x0: 4 - STROKE_HALF, x1: 20 + STROKE_HALF,
  y0: 7 - STROKE_HALF, y1: DOT.y + DOT.r,
};

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * @param size       canvas edge in px
 * @param coverage   fraction of the canvas width the mark's box spans
 * @param ground     background hex, or null for transparent
 * @param mark       mark hex
 * @param nudgeUp    fraction of canvas height to lift the mark, for optical
 *                   centring — a chevron reads heavy at the bottom
 */
function render(size, { coverage, ground, mark, nudgeUp = 0.02 }) {
  const alpha = ground === null;
  const channels = alpha ? 4 : 3;
  const px = Buffer.alloc(size * size * channels);

  const s = (coverage * size) / (BOX.x1 - BOX.x0);
  const ox = size / 2 - ((BOX.x0 + BOX.x1) / 2) * s;
  const oy = size / 2 - ((BOX.y0 + BOX.y1) / 2) * s - nudgeUp * size;

  const pts = CHEVRON.map(([u, v]) => [u * s + ox, v * s + oy]);
  const halfPx = STROKE_HALF * s;
  const dotX = DOT.x * s + ox;
  const dotY = DOT.y * s + oy;
  const dotR = DOT.r * s;

  // Round caps and joins fall out of the capsule union: distance to a segment
  // is already radial at its endpoints.
  const dist = (x, y) => {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - halfPx;
      if (seg < d) d = seg;
    }
    const dot = Math.hypot(x - dotX, y - dotY) - dotR;
    return dot < d ? dot : d;
  };

  const FG = hex(mark);
  const BG = ground ? hex(ground) : null;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0.5 - dist(x + 0.5, y + 0.5);   // 1px linear ramp
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const i = (y * size + x) * channels;
      if (alpha) {
        px[i] = FG[0]; px[i + 1] = FG[1]; px[i + 2] = FG[2];
        px[i + 3] = Math.round(255 * a);
      } else {
        px[i]     = Math.round(BG[0] + (FG[0] - BG[0]) * a);
        px[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
        px[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
      }
    }
  }
  return png(size, px, alpha);
}

/** Flat single-colour canvas, for the Android adaptive background layer. */
function flat(size, colour) {
  const [r, g, b] = hex(colour);
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < px.length; i += 3) { px[i] = r; px[i + 1] = g; px[i + 2] = b; }
  return png(size, px, false);
}

const GROUND = '#0c0e13';   // terminal black, the brand's anchor colour
const WHITE  = '#ffffff';
// The dev build gets the accent blue rather than a second ground, so the two
// icons are separable at a glance on a home screen. Blue means "interactive"
// in this system; recolouring the mark to green or red would read as a running
// or offline status, which is why those are not options here.
const DEV    = '#5b9cf8';

const OUT = [
  // iOS and the store listing. No alpha, square corners — iOS applies its own
  // mask and rejects transparency. Mark inside the centre 80%.
  ['assets/icon.png',                       render(1024, { coverage: 0.79, ground: GROUND, mark: WHITE })],
  ['assets/icon-dev.png',                   render(1024, { coverage: 0.79, ground: GROUND, mark: DEV })],

  // Android adaptive. The foreground is masked to a circle, squircle or
  // teardrop depending on the launcher, so the mark stays inside the
  // guaranteed-visible centre 66%.
  ['assets/android-icon-foreground.png',     render(1024, { coverage: 0.62, ground: null, mark: WHITE })],
  ['assets/android-icon-foreground-dev.png', render(1024, { coverage: 0.62, ground: null, mark: DEV })],
  ['assets/android-icon-background.png',     flat(1024, GROUND)],
  ['assets/android-icon-monochrome.png',     render(1024, { coverage: 0.62, ground: null, mark: WHITE })],

  // Splash: contained at 180px over the terminal ground, so the asset itself
  // is transparent and carries no ground of its own.
  ['assets/splash-icon.png',                 render(512,  { coverage: 0.82, ground: null, mark: WHITE })],

  // Web favicon for the Expo web build.
  ['assets/favicon.png',                     render(64,   { coverage: 0.74, ground: GROUND, mark: WHITE })],
];

for (const [rel, buf] of OUT) {
  const path = join(__dirname, '..', rel);
  writeFileSync(path, buf);
  console.log(`wrote ${rel.padEnd(42)} ${String(buf.length).padStart(7)} bytes`);
}
