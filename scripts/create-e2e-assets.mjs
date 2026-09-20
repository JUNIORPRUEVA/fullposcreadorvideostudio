import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve("assets/demo/e2e");
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y, width, height);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function uiPaint(accent, rows = 9) {
  return (x, y, w, h) => {
    const bg = y < 90 ? [22, 42, 70] : [245, 249, 253];
    let color = bg;
    if (x > 30 && x < w - 30 && y > 115 && y < h - 30) color = [255, 255, 255];
    for (let i = 0; i < rows; i++) {
      const yy = 160 + i * Math.floor((h - 220) / rows);
      if (x > 70 && x < w - 70 && y > yy && y < yy + 32) color = i % 3 === 0 ? accent : [226, 235, 245];
    }
    if (x > 70 && x < 310 && y > 40 && y < 68) color = [255, 255, 255];
    return [...color, 255];
  };
}

writeFileSync(path.join(outDir, "logo.png"), png(512, 512, (x, y, w, h) => {
  const dx = x - w / 2;
  const dy = y - h / 2;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 210) return [0, 0, 0, 0];
  return d < 150 ? [20, 87, 217, 255] : [17, 168, 201, 255];
}));

writeFileSync(path.join(outDir, "billing.png"), png(1440, 960, uiPaint([20, 87, 217], 10)));
writeFileSync(path.join(outDir, "products.png"), png(1440, 960, uiPaint([17, 168, 201], 12)));
writeFileSync(path.join(outDir, "reports.png"), png(1440, 960, uiPaint([15, 159, 110], 8)));
writeFileSync(path.join(outDir, "mobile.png"), png(720, 1440, uiPaint([20, 87, 217], 13)));

console.log(`E2E PNG assets written to ${outDir}`);
