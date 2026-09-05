import { deflateSync } from "node:zlib";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { crc32 } from "node:zlib";

// Inline a thin runner by dynamically importing the TS engine via strip-types
// is handled by the node command. This file is only PNG helpers + orchestration
// when invoked from dump-grass.ts.
export function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).copy(
      raw,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const chunks = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, chunks);
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, c]);
}

export function scaleNearest(rgba, w, h, scale, repeatX = 1, repeatY = 1) {
  const tw = w * repeatX;
  const th = h * repeatY;
  const ow = tw * scale;
  const oh = th * scale;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y += 1) {
    const sy = Math.floor(y / scale) % h;
    for (let x = 0; x < ow; x += 1) {
      const sx = Math.floor(x / scale) % w;
      const si = (sy * w + sx) * 4;
      const di = (y * ow + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, width: ow, height: oh };
}
