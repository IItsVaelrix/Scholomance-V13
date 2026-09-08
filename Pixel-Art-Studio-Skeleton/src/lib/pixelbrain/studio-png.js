import { unzlibSync, zlibSync } from "fflate";

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0);
  return out;
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  const crc = u32(crc32(body));
  return concat([u32(data.length), body, crc]);
}

export function parseHexColor(color) {
  const raw = String(color || "#000000").replace("#", "").trim();
  const hex = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  const safe = /^[0-9a-fA-F]{6}/.test(hex) ? hex.slice(0, 6).toLowerCase() : "000000";
  return {
    hex: `#${safe}`,
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

export function encodeRgbaPng(width, height, rgba) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const idat = zlibSync(raw, { level: 9 });
  return concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
}

export function decodePngToRgba(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (buffer.length < 8 || SIGNATURE.some((value, index) => buffer[index] !== value)) {
    throw new Error("PB-STUDIO-PNG-DECODE · not a PNG file");
  }
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...buffer.subarray(offset + 4, offset + 8));
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error("PB-STUDIO-PNG-DECODE · unsupported PNG header");
  }
  let inflated;
  try {
    inflated = unzlibSync(concat(idat));
  } catch {
    throw new Error("PB-STUDIO-PNG-DECODE · invalid PNG payload");
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    if (filter !== 0) throw new Error("PB-STUDIO-PNG-DECODE · unsupported PNG filter");
    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4;
      rgba[dest] = inflated[source];
      rgba[dest + 1] = inflated[source + 1];
      rgba[dest + 2] = inflated[source + 2];
      rgba[dest + 3] = channels === 4 ? inflated[source + 3] : 255;
      source += channels;
    }
    if (source > inflated.length) throw new Error("PB-STUDIO-PNG-DECODE · truncated PNG payload");
  }
  return { width, height, rgba };
}

export function rgbaToCells(width, height, rgba) {
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = rgba[index + 3];
      if (alpha === 0) continue;
      const hex = `#${[rgba[index], rgba[index + 1], rgba[index + 2]]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`;
      cells.push({ x, y, color: hex, emphasis: alpha / 255 });
    }
  }
  return cells;
}
