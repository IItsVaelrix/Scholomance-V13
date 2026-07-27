import { describe, expect, it, vi } from "vitest";
import {
  PixelBrainTextureCache,
  type TextureResource,
} from "../src/PixelBrainTextureCache.js";

function policy(overrides: Partial<{
  maxZeroReferenceEntries: number;
  maxRetainedRasterBytes: number;
  maxEstimatedGpuBytes: number;
  maxActiveSceneBytes: number;
}> = {}) {
  return {
    maxZeroReferenceEntries: 64,
    maxRetainedRasterBytes: 64 * 1024 * 1024,
    maxEstimatedGpuBytes: 128 * 1024 * 1024,
    maxActiveSceneBytes: 64 * 1024 * 1024,
    ...overrides,
  };
}

function harness(cachePolicy = policy()) {
  let serial = 0;
  const destroyed: number[] = [];
  const create = vi.fn((): TextureResource<{ id: number }> => ({
    texture: { id: ++serial },
    source: { id: serial },
  }));
  const destroy = vi.fn((resource: TextureResource<{ id: number }>) => {
    destroyed.push(resource.texture.id);
  });
  const cache = new PixelBrainTextureCache({
    policy: cachePolicy,
    create,
    destroy,
  });
  const input = (
    cacheKey: string,
    byteLength = 4,
    width = 1,
    height = 1,
  ) => ({
    cacheKey,
    retainedBytes: new Uint8Array(byteLength),
    width,
    height,
  });
  return { cache, create, destroy, destroyed, input };
}

describe("PixelBrainTextureCache", () => {
  it("reuses one texture per raster hash and reference-counts leases", () => {
    const { cache, create, input } = harness();
    const first = cache.acquire(input("pbr1:one"));
    const second = cache.acquire(input("pbr1:one"));

    expect(first?.texture).toBe(second?.texture);
    expect(create).toHaveBeenCalledTimes(1);
    expect(cache.stats().entries[0]).toMatchObject({
      cacheKey: "pbr1:one",
      references: 2,
      usageTick: 2,
    });

    first?.release();
    second?.release();
    second?.release();
    expect(cache.stats().entries[0]?.references).toBe(0);
  });

  it("never returns stale texture data for a changed raster hash", () => {
    const { cache, create, input } = harness();
    const first = cache.acquire(input("pbr1:first"));
    const second = cache.acquire(input("pbr1:second"));
    expect(first?.texture).not.toBe(second?.texture);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("evicts zero-reference entries by usage tick then cache key", () => {
    const { cache, destroyed, input } = harness(policy({
      maxZeroReferenceEntries: 1,
    }));
    const beta = cache.acquire(input("beta"))!;
    const alpha = cache.acquire(input("alpha"))!;
    beta.release();
    alpha.release();

    expect(cache.stats().entries.map(({ cacheKey }) => cacheKey)).toEqual([
      "alpha",
    ]);
    expect(destroyed).toEqual([1]);
  });

  it("evicts until retained CPU and estimated GPU byte budgets pass", () => {
    const { cache, input } = harness(policy({
      maxRetainedRasterBytes: 8,
      maxEstimatedGpuBytes: 8,
    }));
    const first = cache.acquire(input("first", 8, 1, 2))!;
    first.release();
    const second = cache.acquire(input("second", 8, 1, 2))!;
    second.release();

    expect(cache.stats()).toMatchObject({
      retainedRasterBytes: 8,
      estimatedGpuBytes: 8,
    });
    expect(cache.stats().entries.map(({ cacheKey }) => cacheKey)).toEqual([
      "second",
    ]);
  });

  it("refuses active-scene overages without evicting active entries", () => {
    const { cache, input } = harness(policy({
      maxActiveSceneBytes: 4,
    }));
    const active = cache.acquire(input("active", 4, 1, 1));
    const rejected = cache.acquire(input("rejected", 4, 1, 1));

    expect(active).not.toBeNull();
    expect(rejected).toBeNull();
    expect(cache.stats().entries.map(({ cacheKey }) => cacheKey)).toEqual([
      "active",
    ]);
  });

  it("destroys evicted and renderer-destroyed GPU resources", () => {
    const { cache, destroy, input } = harness(policy({
      maxZeroReferenceEntries: 0,
    }));
    const first = cache.acquire(input("first"))!;
    first.release();
    const second = cache.acquire(input("second"))!;
    cache.destroy();

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(cache.stats().entries).toEqual([]);
    second.release();
  });

  it("rebuilds textures from retained bytes after context restoration", () => {
    const { cache, create, destroy, input } = harness();
    const lease = cache.acquire(input("restorable"))!;
    const before = lease.texture;
    cache.restoreContext();

    expect(create).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(lease.texture).not.toBe(before);
  });

  it("retains encoded PNG bytes and decoded upload bytes within the CPU budget", () => {
    const create = vi.fn((): TextureResource<{ id: number }> => ({
      texture: { id: 1 },
    }));
    const cache = new PixelBrainTextureCache({
      policy: policy({ maxRetainedRasterBytes: 6 }),
      create,
      destroy: vi.fn(),
    });

    const lease = cache.acquire({
      cacheKey: "png1:image",
      retainedBytes: new Uint8Array([1, 2]),
      uploadBytes: new Uint8Array([10, 20, 30, 40]),
      width: 1,
      height: 1,
    });

    expect(lease).not.toBeNull();
    expect(cache.stats().retainedRasterBytes).toBe(6);
    expect(create.mock.calls[0]?.[0].uploadBytes).toEqual(
      new Uint8Array([10, 20, 30, 40]),
    );
  });
});
