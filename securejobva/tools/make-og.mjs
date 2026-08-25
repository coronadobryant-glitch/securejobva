/* Draws og.png — the 1200x630 card that appears when either page is shared.
   Hand-rolled encoder so the build needs no image dependencies: node zlib is
   enough to write a PNG, and the mark is geometry, not a font.
   Run: node tools/make-og.mjs */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200;
const H = 630;
const SS = 3; /* supersampling per axis, for clean edges */

/* Sampled off the logo file. See the brand note in README.md. */
const AZURE = [0x00, 0x92, 0xfe];
const MID = [0x00, 0x53, 0xb4];
const NAVY = [0x00, 0x12, 0x32];
const NAVY_LIFT = [0x00, 0x21, 0x4f]; /* the ground's lighter corner */

/* ---------------------------------------------------------------- geometry
   All in the mark's native 32-unit box, matching the inline SVG in the pages.
   Painted back to front: shield, plate, handle, case, check. */

/* Both shields are traced from the SVG the pages use, and their flanks are
   cubics. Flattening them properly matters here in a way it did not for the
   old solid shield: the ring is barely two units thick, so an eyeballed
   polygon puts its inner edge in the wrong place and the interior leaks. */
function flatten(segs, steps = 28) {
  const pts = [];
  for (const s of segs) {
    if (s.length === 2) {
      pts.push(s[1]);
      continue;
    }
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = s;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
      ]);
    }
  }
  return pts;
}

/* M16 2.5 28 7.5 v9.2 c0 7.1 -4.9 11.7 -12 13.8 C8.9 28.4 4 23.8 4 16.7 V7.5 Z */
const SHIELD = flatten([
  [[16, 2.5], [28, 7.5]],
  [[28, 7.5], [28, 16.7]],
  [[28, 16.7], [28, 23.8], [23.1, 28.4], [16, 30.5]],
  [[16, 30.5], [8.9, 28.4], [4, 23.8], [4, 16.7]],
  [[4, 16.7], [4, 7.5]],
  [[4, 7.5], [16, 2.5]]
]);

/* The ring's inner edge. The gap between this and SHIELD is what makes the
   shield read as an outline rather than a solid slab.
   M16 5.2 25.7 9.2 v7.2 c0 5.8 -4 9.6 -9.7 11.3 c-5.7 -1.7 -9.7 -5.5 -9.7 -11.3 V9.2 Z */
const PLATE = flatten([
  [[16, 5.2], [25.7, 9.2]],
  [[25.7, 9.2], [25.7, 16.4]],
  [[25.7, 16.4], [25.7, 22.2], [21.7, 26.0], [16, 27.7]],
  [[16, 27.7], [10.3, 26.0], [6.3, 22.2], [6.3, 16.4]],
  [[6.3, 16.4], [6.3, 9.2]],
  [[6.3, 9.2], [16, 5.2]]
]);
/* Briefcase handle, as three stroked segments with round joins. */
const HANDLE = [
  [[13.2, 13.1], [13.2, 11.7]],
  [[13.2, 11.7], [18.8, 11.7]],
  [[18.8, 11.7], [18.8, 13.1]]
];
const HANDLE_W = 1.7;
const CASE = { x: 8.9, y: 13.1, w: 14.2, h: 9.6, r: 1.7 };
const CHECK = [[[11.9, 18.2], [14.8, 21.2]], [[14.8, 21.2], [20.9, 14.2]]];
const CHECK_W = 2.7;

const MARK = 252;                       /* rendered shield height in px */
const SCALE = MARK / 32;
const OX = (W - 32 * SCALE) / 2;        /* centred on both axes */
const OY = (H - MARK) / 2 - 10;

const STRIPE = 16;                      /* signal rule closing the bottom edge */

/* ------------------------------------------------------------------ tests */

function inPoly(px, py, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function distToSeg(px, py, [[x1, y1], [x2, y2]]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = x1 + t * dx - px;
  const ey = y1 + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

function onStroke(px, py, segs, width) {
  for (const seg of segs) if (distToSeg(px, py, seg) <= width / 2) return true;
  return false;
}

/* Rounded rectangle: inside the cross, or within r of a corner centre. */
function inRoundRect(px, py, { x, y, w, h, r }) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const ix = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const iy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  const dx = px - ix;
  const dy = py - iy;
  return dx * dx + dy * dy <= r * r;
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

/* The mark's gradient, running corner to corner across the shield's box the
   same way the SVG's linearGradient does. */
function markGrad(ux, uy) {
  const t = ((ux - 4) / 24 + (uy - 2.5) / 27.8) / 2;
  return lerp(AZURE, MID, t < 0 ? 0 : t > 1 ? 1 : t);
}

/* Colour of one sample point, in page pixels. Null means "not the mark".
   Painted back to front, each layer overriding the one under it — the same
   order the SVG draws its elements in. */
function sample(x, y) {
  const ux = (x - OX) / SCALE;
  const uy = (y - OY) / SCALE;
  if (ux < 0 || ux > 32 || uy < 0 || uy > 32) return null;
  if (!inPoly(ux, uy, SHIELD)) return null;

  let c = markGrad(ux, uy);                                     /* the ring */
  if (inPoly(ux, uy, PLATE)) c = NAVY;                          /* interior */
  if (onStroke(ux, uy, HANDLE, HANDLE_W)) c = markGrad(ux, uy); /* handle   */
  if (inRoundRect(ux, uy, CASE)) c = markGrad(ux, uy);          /* case     */

  /* The check runs past the case's top-right corner and out onto the interior,
     as it does in the logo — where it meets the interior it is navy on navy
     and simply disappears, which is what the artwork does too. */
  if (onStroke(ux, uy, CHECK, CHECK_W)) c = NAVY;
  return c;
}

/* Ground: the card's navy, lifted toward its top-left corner, closed by a
   signal rule along the bottom edge. */
function ground(x, y) {
  if (y > H - STRIPE) return AZURE;
  return lerp(NAVY_LIFT, NAVY, (x / W + y / H) / 2);
}

const raw = Buffer.alloc((W * 3 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; /* filter: none */
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        const c = sample(px, py) || ground(px, py);
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const n = SS * SS;
    raw[p++] = Math.round(r / n);
    raw[p++] = Math.round(g / n);
    raw[p++] = Math.round(b / n);
  }
}

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  /* bit depth */
ihdr[9] = 2;  /* truecolour */

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

writeFileSync(new URL("../og.png", import.meta.url), png);
console.log("og.png " + W + "x" + H + " — " + (png.length / 1024).toFixed(1) + " KB");
