/* Draws og.png — the 1200x630 card that appears when either page is shared.
   Hand-rolled encoder so the build needs no image dependencies: node zlib is
   enough to write a PNG, and the mark is geometry, not a font.
   Run: node tools/make-og.mjs */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200;
const H = 630;
const SS = 3; /* supersampling per axis, for clean edges */

const RED = [0xd6, 0x2f, 0x27];
const WHITE = [0xff, 0xff, 0xff];
const YELLOW = [0xff, 0xc2, 0x33];

/* The shield from the brand mark, traced in its native 32-unit box. */
const SHIELD = [
  [16, 2.5], [28, 7.5], [28, 16.7], [22.6, 25.8],
  [16, 30.3], [9.4, 25.8], [4, 16.7], [4, 7.5]
];
/* The check inside it, as two stroked segments. */
const CHECK = [[[10.8, 16.3], [14.4, 19.9]], [[14.4, 19.9], [21.4, 12.5]]];
const CHECK_W = 2.4;

const MARK = 252;                       /* rendered shield height in px */
const SCALE = MARK / 32;
const OX = (W - 32 * SCALE) / 2;        /* centred on both axes */
const OY = (H - MARK) / 2 - 10;

const STRIPE = 16;                      /* signal rule closing the bottom edge */

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

/* Colour of one sample point, in page pixels. */
function sample(x, y) {
  const ux = (x - OX) / SCALE;
  const uy = (y - OY) / SCALE;
  if (ux >= 0 && ux <= 32 && uy >= 0 && uy <= 32 && inPoly(ux, uy, SHIELD)) {
    for (const seg of CHECK) {
      if (distToSeg(ux, uy, seg) <= CHECK_W / 2) return RED;
    }
    return WHITE;
  }
  return null;
}

/* Ground: brand red, closed by a signal rule along the bottom edge. */
function ground(y) {
  return y > H - STRIPE ? YELLOW : RED;
}

const raw = Buffer.alloc((W * 3 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; /* filter: none */
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS) || ground(y + (sy + 0.5) / SS);
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
