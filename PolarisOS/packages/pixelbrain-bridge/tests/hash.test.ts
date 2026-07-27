import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computePacketContentHash,
  computePngRevision,
  computeRasterHash,
  computeRenderHash,
  sha256Hex,
} from "@polaris/pixelbrain-bridge";

describe("PixelBrain hash protocol", () => {
  it("matches the SHA-256 abc vector", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("canonicalizes key order, negative zero, and Unicode by code point", () => {
    expect(canonicalJson({ z: -0, "😀": 2, a: 1 })).toBe(
      '{"a":1,"z":0,"😀":2}',
    );
  });

  it("preserves normalized array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    9_007_199_254_740_992,
    { value: undefined },
  ])("rejects unsupported canonical values: %p", (value) => {
    expect(() => canonicalJson(value)).toThrow();
  });

  it("hashes raw raster bytes with dimensions and a pbr1 prefix", () => {
    const first = computeRasterHash(
      1,
      1,
      new Uint8Array([1, 2, 3, 4]),
    );
    const second = computeRasterHash(
      1,
      1,
      new Uint8Array([1, 2, 3, 5]),
    );

    expect(first).toMatch(/^pbr1:[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it("domain-separates packet, PNG, and render identities", () => {
    expect(computePacketContentHash({ value: 1 })).toMatch(
      /^pb1:[0-9a-f]{64}$/,
    );
    expect(computePngRevision(new Uint8Array([1]))).toMatch(
      /^png1:[0-9a-f]{64}$/,
    );
    expect(computeRenderHash({ value: 1 })).toMatch(
      /^render1:[0-9a-f]{64}$/,
    );
  });

  it("includes raster dimensions in the raster identity", () => {
    const bytes = new Uint8Array([0, 0, 0, 0]);
    expect(computeRasterHash(1, 1, bytes)).not.toBe(
      computeRasterHash(2, 1, bytes),
    );
  });
});
