const UTF8 = new TextEncoder();
const HEX = "0123456789abcdef";

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_ROUND = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function paddedSha256Input(input: Uint8Array): Uint8Array {
  const paddingLength = (64 - ((input.length + 9) % 64)) % 64;
  const result = new Uint8Array(input.length + 1 + paddingLength + 8);
  result.set(input);
  result[input.length] = 0x80;

  const bitLength = BigInt(input.length) * 8n;
  const offset = result.length - 8;
  for (let index = 0; index < 8; index += 1) {
    result[offset + index] = Number(
      (bitLength >> BigInt((7 - index) * 8)) & 0xffn,
    );
  }
  return result;
}

export function sha256Bytes(input: Uint8Array): Uint8Array {
  const message = paddedSha256Input(input);
  const state = new Uint32Array(SHA256_INITIAL);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const wordOffset = offset + index * 4;
      words[index] = (
        (message[wordOffset]! << 24)
        | (message[wordOffset + 1]! << 16)
        | (message[wordOffset + 2]! << 8)
        | message[wordOffset + 3]!
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = (
        rotateRight(previous15, 7)
        ^ rotateRight(previous15, 18)
        ^ (previous15 >>> 3)
      ) >>> 0;
      const sigma1 = (
        rotateRight(previous2, 17)
        ^ rotateRight(previous2, 19)
        ^ (previous2 >>> 10)
      ) >>> 0;
      words[index] = (
        words[index - 16]!
        + sigma0
        + words[index - 7]!
        + sigma1
      ) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = (
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      ) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const temporary1 = (
        h + sigma1 + choice + SHA256_ROUND[index]! + words[index]!
      ) >>> 0;
      const sigma0 = (
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      ) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temporary2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < state.length; index += 1) {
    const value = state[index]!;
    output[index * 4] = value >>> 24;
    output[index * 4 + 1] = value >>> 16;
    output[index * 4 + 2] = value >>> 8;
    output[index * 4 + 3] = value;
  }
  return output;
}

export function sha256Hex(input: Uint8Array): string {
  let result = "";
  for (const byte of sha256Bytes(input)) {
    result += HEX[byte >>> 4] + HEX[byte & 0x0f];
  }
  return result;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (
      leftPoints[index]!.codePointAt(0)!
      - rightPoints[index]!.codePointAt(0)!
    );
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalize(value: unknown, stack: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Canonical numbers must be finite safe integers");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Unsupported canonical value: ${typeof value}`);
  }
  if (stack.has(value)) {
    throw new TypeError("Canonical values must not contain cycles");
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, stack)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical objects must be plain records");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCodePoints);
    const entries = keys.map((key) => {
      if (record[key] === undefined) {
        throw new TypeError("Canonical objects must not contain undefined");
      }
      return `${JSON.stringify(key)}:${canonicalize(record[key], stack)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    stack.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function hashJson(prefix: string, value: unknown): string {
  return sha256Hex(
    concatenate(UTF8.encode(prefix), UTF8.encode(canonicalJson(value))),
  );
}

export function computePacketContentHash(
  value: unknown,
): `pb1:${string}` {
  return `pb1:${hashJson("pixelbrain-packet.v1\0", value)}`;
}

export function computeRasterHash(
  width: number,
  height: number,
  rgba: Uint8Array,
): `pbr1:${string}` {
  const dimensions = new Uint8Array(8);
  const view = new DataView(dimensions.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  return `pbr1:${sha256Hex(concatenate(
    UTF8.encode("pixelbrain-raster.v1\0"),
    dimensions,
    rgba,
  ))}`;
}

export function computePngRevision(bytes: Uint8Array): `png1:${string}` {
  return `png1:${sha256Hex(concatenate(
    UTF8.encode("pixelbrain-png.v1\0"),
    bytes,
  ))}`;
}

export function computeRenderHash(value: unknown): `render1:${string}` {
  return `render1:${hashJson("polaris-render.v1\0", value)}`;
}
