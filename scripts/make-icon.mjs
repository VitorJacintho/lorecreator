/**
 * Gera build/icon.png e public/icon.png (256x256): quadrado arredondado com degradê
 * roxo noturno -> âmbar e um livro aberto. Sem dependências.
 *   npm run icon
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const S = 256;
const SS = 4; // supersampling para bordas suaves
const RADIUS = 56;

const STOPS = [
  [0, [0x2a, 0x1f, 0x4a]],
  [0.55, [0x7a, 0x4b, 0xb0]],
  [1, [0xe0, 0xa4, 0x58]],
];

function gradient(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

function inRoundedRect(x, y) {
  const cx = Math.min(Math.max(x, RADIUS), S - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), S - RADIUS);
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2;
}

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// livro aberto: duas páginas levemente inclinadas + uma estrela de 4 pontas acima
const LEFT = [[44, 104], [122, 88], [122, 200], [44, 210]];
const RIGHT = [[134, 88], [212, 104], [212, 210], [134, 200]];
const STAR = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4 - Math.PI / 2;
  const r = i % 2 === 0 ? 34 : 9;
  return [128 + r * Math.cos(a), 52 + r * Math.sin(a)];
});
const inShape = (x, y) => inPoly(LEFT, x, y) || inPoly(RIGHT, x, y) || inPoly(STAR, x, y);

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filtro "none"
  for (let x = 0; x < S; x++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        if (inRoundedRect(px, py)) {
          bg++;
          if (inShape(px, py)) fg++;
        }
      }
    }
    const n = SS * SS;
    const base = gradient((x + y) / (2 * S));
    const k = (fg / Math.max(1, bg)) * 0.94;
    const page = [0xfb, 0xf3, 0xe4];
    const rgb = base.map((v, j) => Math.round(v + (page[j] - v) * k));
    const o = y * (S * 4 + 1) + 1 + x * 4;
    raw[o] = rgb[0];
    raw[o + 1] = rgb[1];
    raw[o + 2] = rgb[2];
    raw[o + 3] = Math.round((bg / n) * 255);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bits
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// build/ → ícone do instalador/.exe; public/ → bandeja do app e favicon da versão web
for (const dir of ['build', 'public']) {
  const out = join(import.meta.dirname, '..', dir, 'icon.png');
  mkdirSync(join(import.meta.dirname, '..', dir), { recursive: true });
  writeFileSync(out, png);
  console.log(`ícone gerado: ${out} (${png.length} bytes)`);
}
