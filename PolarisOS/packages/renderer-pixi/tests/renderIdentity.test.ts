import { describe, expect, it, vi } from "vitest";
import {
  computeSceneRenderHash,
  createRgbaTextureResource,
  destroyTextureResource,
  type ResolvedAssetLedgerEntry,
} from "../src/renderIdentity.js";
import { pixiApplicationOptions } from "../src/PixiSceneRenderer.js";

describe("realized render identity", () => {
  const plan = {
    contractHash: "contract:shrine",
    planHash: "abc12345",
    mode: "illustrated" as const,
  };
  const assets: ResolvedAssetLedgerEntry[] = [
    {
      requestedAssetKey: "entities/lantern",
      source: "PIXELBRAIN",
      packetId: "lantern",
      packetContentHash: `pb1:${"1".repeat(64)}`,
      rasterHash: `pbr1:${"2".repeat(64)}`,
      pngRevision: null,
    },
    {
      requestedAssetKey: "entities/brazier",
      source: "GLYPH",
      packetId: null,
      packetContentHash: null,
      rasterHash: null,
      pngRevision: null,
    },
  ];

  it("is deterministic and independent of resolution completion order", () => {
    expect(computeSceneRenderHash(plan, assets)).toBe(
      computeSceneRenderHash(plan, [...assets].reverse()),
    );
    expect(computeSceneRenderHash(plan, assets)).toMatch(
      /^render1:[0-9a-f]{64}$/,
    );
  });

  it("changes when realized raster bytes or fallback source changes", () => {
    const changedRaster = assets.map((asset) => (
      asset.source === "PIXELBRAIN"
        ? { ...asset, rasterHash: `pbr1:${"3".repeat(64)}` }
        : asset
    )) as ResolvedAssetLedgerEntry[];
    const changedFallback = assets.map((asset) => (
      asset.source === "GLYPH"
        ? { ...asset, source: "TEXT" as const }
        : asset
    ));

    expect(computeSceneRenderHash(plan, changedRaster)).not.toBe(
      computeSceneRenderHash(plan, assets),
    );
    expect(computeSceneRenderHash(plan, changedFallback)).not.toBe(
      computeSceneRenderHash(plan, assets),
    );
  });
});

describe("Pixi straight-RGBA texture upload", () => {
  it("disables antialiasing and rounds renderer pixels", () => {
    expect(pixiApplicationOptions(800, 480)).toMatchObject({
      width: 800,
      height: 480,
      antialias: false,
      roundPixels: true,
      preference: "webgl",
    });
  });

  it("uses nearest sampling without premultiplication or mipmaps", () => {
    const sourceDestroy = vi.fn();
    const textureDestroy = vi.fn();
    class BufferImageSource {
      static options: Record<string, unknown>;
      destroy = sourceDestroy;
      constructor(options: Record<string, unknown>) {
        BufferImageSource.options = options;
      }
    }
    class Texture {
      destroy = textureDestroy;
      constructor(public options: Record<string, unknown>) {}
    }
    const bytes = new Uint8Array([255, 0, 0, 128]);

    const resource = createRgbaTextureResource(
      { BufferImageSource, Texture },
      { cacheKey: "pbr1:red", retainedBytes: bytes, width: 1, height: 1 },
    );

    expect(BufferImageSource.options).toMatchObject({
      resource: bytes,
      width: 1,
      height: 1,
      format: "rgba8unorm",
      alphaMode: "no-premultiply-alpha",
      scaleMode: "nearest",
      autoGenerateMipmaps: false,
    });

    destroyTextureResource(resource);
    expect(textureDestroy).toHaveBeenCalledWith(false);
    expect(sourceDestroy).toHaveBeenCalledTimes(1);
  });
});
