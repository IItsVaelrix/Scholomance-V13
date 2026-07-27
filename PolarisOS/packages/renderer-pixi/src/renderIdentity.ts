import { computeRenderHash } from "@polaris/pixelbrain-bridge";
import type { AssetResolution } from "./PixelBrainAssetResolver.js";
import type { TextureCacheInput, TextureResource } from "./PixelBrainTextureCache.js";
import type { SceneRenderPlan } from "./scenePlan.js";

export type ResolvedAssetSource = "PIXELBRAIN" | "PNG" | "GLYPH" | "TEXT";

export interface ResolvedAssetLedgerEntry {
  requestedAssetKey: string;
  source: ResolvedAssetSource;
  packetId: string | null;
  packetContentHash: string | null;
  rasterHash: string | null;
  pngRevision: string | null;
}

export function toResolvedAssetLedgerEntry(
  requestedAssetKey: string,
  resolution: AssetResolution,
): ResolvedAssetLedgerEntry {
  switch (resolution.status) {
    case "PIXELBRAIN":
      return {
        requestedAssetKey,
        source: "PIXELBRAIN",
        packetId: resolution.packetId,
        packetContentHash: resolution.raster.packetContentHash,
        rasterHash: resolution.raster.rasterHash,
        pngRevision: null,
      };
    case "PNG":
      return {
        requestedAssetKey,
        source: "PNG",
        packetId: null,
        packetContentHash: null,
        rasterHash: null,
        pngRevision: resolution.pngRevision,
      };
    case "GLYPH":
      return {
        requestedAssetKey,
        source: "GLYPH",
        packetId: null,
        packetContentHash: null,
        rasterHash: null,
        pngRevision: null,
      };
    case "TEXT":
      return {
        requestedAssetKey,
        source: "TEXT",
        packetId: null,
        packetContentHash: null,
        rasterHash: null,
        pngRevision: null,
      };
  }
}

export function computeSceneRenderHash(
  plan: Pick<SceneRenderPlan, "contractHash" | "planHash" | "mode">,
  resolvedAssets: readonly ResolvedAssetLedgerEntry[],
): `render1:${string}` {
  return computeRenderHash({
    contractHash: plan.contractHash,
    planHash: plan.planHash,
    fallbackMode: plan.mode,
    resolvedAssets: [...resolvedAssets]
      .sort((left, right) => (
        left.requestedAssetKey.localeCompare(right.requestedAssetKey)
      ))
      .map((asset) => ({
        assetKey: asset.requestedAssetKey,
        source: asset.source,
        packetContentHash: asset.packetContentHash,
        rasterHash: asset.rasterHash,
        pngRevision: asset.pngRevision,
      })),
  });
}

interface RgbaPixiApi {
  // `any` is intentional at this narrow adapter seam: tests use structural
  // fakes while production passes Pixi's more specific constructor options.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BufferImageSource: new (options: any) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Texture: new (options: any) => {
    destroy(destroySource?: boolean): void;
  };
}

export function createRgbaTextureResource(
  pixi: RgbaPixiApi,
  input: TextureCacheInput,
): TextureResource<unknown> {
  const uploadBytes = input.uploadBytes ?? input.retainedBytes;
  const source = new pixi.BufferImageSource({
    resource: uploadBytes,
    width: input.width,
    height: input.height,
    format: "rgba8unorm",
    alphaMode: "no-premultiply-alpha",
    scaleMode: "nearest",
    autoGenerateMipmaps: false,
    label: input.cacheKey,
  });
  const texture = new pixi.Texture({ source });
  return { texture, source };
}

export function destroyTextureResource(
  resource: TextureResource<unknown>,
): void {
  const texture = resource.texture as {
    destroy?: (destroySource?: boolean) => void;
  };
  const source = resource.source as { destroy?: () => void } | undefined;
  texture.destroy?.(false);
  source?.destroy?.();
}
