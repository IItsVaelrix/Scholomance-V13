export interface PixelBrainTextureCachePolicy {
  maxZeroReferenceEntries: number;
  maxRetainedRasterBytes: number;
  maxEstimatedGpuBytes: number;
  maxActiveSceneBytes: number;
}

export const DEFAULT_PIXELBRAIN_TEXTURE_CACHE_POLICY:
Readonly<PixelBrainTextureCachePolicy> = Object.freeze({
  maxZeroReferenceEntries: 64,
  maxRetainedRasterBytes: 64 * 1024 * 1024,
  maxEstimatedGpuBytes: 128 * 1024 * 1024,
  maxActiveSceneBytes: 64 * 1024 * 1024,
});

export interface TextureCacheInput {
  cacheKey: string;
  /** Immutable source bytes: straight RGBA for PB, encoded bytes for PNG. */
  retainedBytes: Uint8Array;
  /** Decoded straight RGBA upload bytes when retainedBytes are encoded PNG. */
  uploadBytes?: Uint8Array;
  width: number;
  height: number;
  /** Bytes already selected for the proposed scene transaction. */
  proposedActiveSceneBytes?: number;
}

export interface TextureResource<TTexture = unknown> {
  texture: TTexture;
  source?: unknown;
}

export interface PixelBrainTextureCacheOptions<TTexture = unknown> {
  policy?: PixelBrainTextureCachePolicy;
  create: (input: TextureCacheInput) => TextureResource<TTexture>;
  destroy: (resource: TextureResource<TTexture>) => void;
}

export interface TextureLease<TTexture = unknown> {
  readonly cacheKey: string;
  readonly texture: TTexture;
  release(): void;
}

interface TextureEntry<TTexture> {
  cacheKey: string;
  retainedBytes: Uint8Array;
  uploadBytes: Uint8Array;
  retainedByteLength: number;
  width: number;
  height: number;
  estimatedGpuBytes: number;
  resource: TextureResource<TTexture>;
  references: number;
  usageTick: number;
}

export interface PixelBrainTextureCacheStats {
  retainedRasterBytes: number;
  estimatedGpuBytes: number;
  activeSceneBytes: number;
  zeroReferenceEntries: number;
  entries: Array<{
    cacheKey: string;
    retainedByteLength: number;
    estimatedGpuBytes: number;
    references: number;
    usageTick: number;
  }>;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length
    && left.every((byte, index) => byte === right[index]);
}

export class PixelBrainTextureCache<TTexture = unknown> {
  private readonly policy: PixelBrainTextureCachePolicy;
  private readonly createResource:
    (input: TextureCacheInput) => TextureResource<TTexture>;
  private readonly destroyResource:
    (resource: TextureResource<TTexture>) => void;
  private readonly entries = new Map<string, TextureEntry<TTexture>>();
  private usageCounter = 0;
  private destroyed = false;

  constructor(options: PixelBrainTextureCacheOptions<TTexture>) {
    this.policy = options.policy
      ?? DEFAULT_PIXELBRAIN_TEXTURE_CACHE_POLICY;
    this.createResource = options.create;
    this.destroyResource = options.destroy;
  }

  private totals(): {
    retained: number;
    gpu: number;
    active: number;
    zeroCount: number;
  } {
    let retained = 0;
    let gpu = 0;
    let active = 0;
    let zeroCount = 0;
    for (const entry of this.entries.values()) {
      retained += entry.retainedByteLength;
      gpu += entry.estimatedGpuBytes;
      if (entry.references > 0) active += entry.estimatedGpuBytes;
      else zeroCount += 1;
    }
    return { retained, gpu, active, zeroCount };
  }

  private zeroReferenceCandidates(): TextureEntry<TTexture>[] {
    return [...this.entries.values()]
      .filter(({ references }) => references === 0)
      .sort((left, right) => (
        left.usageTick - right.usageTick
        || left.cacheKey.localeCompare(right.cacheKey)
      ));
  }

  private evict(entry: TextureEntry<TTexture>): void {
    if (entry.references !== 0) return;
    this.entries.delete(entry.cacheKey);
    this.destroyResource(entry.resource);
  }

  private evictToPolicy(
    additionalRetained = 0,
    additionalGpu = 0,
  ): boolean {
    for (const candidate of this.zeroReferenceCandidates()) {
      const totals = this.totals();
      if (
        totals.zeroCount <= this.policy.maxZeroReferenceEntries
        && totals.retained + additionalRetained
          <= this.policy.maxRetainedRasterBytes
        && totals.gpu + additionalGpu <= this.policy.maxEstimatedGpuBytes
      ) {
        break;
      }
      this.evict(candidate);
    }
    const final = this.totals();
    return (
      final.zeroCount <= this.policy.maxZeroReferenceEntries
      && final.retained + additionalRetained
        <= this.policy.maxRetainedRasterBytes
      && final.gpu + additionalGpu <= this.policy.maxEstimatedGpuBytes
    );
  }

  acquire(input: TextureCacheInput): TextureLease<TTexture> | null {
    this.usageCounter += 1;
    if (this.destroyed) return null;
    if (
      !input.cacheKey
      || !Number.isSafeInteger(input.width)
      || !Number.isSafeInteger(input.height)
      || input.width < 1
      || input.height < 1
    ) {
      return null;
    }

    const existing = this.entries.get(input.cacheKey);
    if (existing !== undefined) {
      if (
        existing.width !== input.width
        || existing.height !== input.height
        || !bytesEqual(existing.retainedBytes, input.retainedBytes)
        || (
          input.uploadBytes !== undefined
          && !bytesEqual(existing.uploadBytes, input.uploadBytes)
        )
      ) {
        throw new Error(`Texture cache identity collision: ${input.cacheKey}`);
      }
      const proposedActive = input.proposedActiveSceneBytes;
      if (
        (
          proposedActive !== undefined
          && proposedActive + existing.estimatedGpuBytes
            > this.policy.maxActiveSceneBytes
        )
        || (
          proposedActive === undefined
          && existing.references === 0
          && this.totals().active + existing.estimatedGpuBytes
            > this.policy.maxActiveSceneBytes
        )
      ) {
        return null;
      }
      existing.references += 1;
      existing.usageTick = this.usageCounter;
      return this.lease(existing);
    }

    const estimatedGpuBytes = input.width * input.height * 4;
    const proposedActive = input.proposedActiveSceneBytes
      ?? this.totals().active;
    if (
      !Number.isSafeInteger(estimatedGpuBytes)
      || proposedActive + estimatedGpuBytes
        > this.policy.maxActiveSceneBytes
    ) {
      return null;
    }
    const additionalRetained = input.retainedBytes.byteLength
      + (input.uploadBytes?.byteLength ?? 0);
    if (!this.evictToPolicy(additionalRetained, estimatedGpuBytes)) {
      return null;
    }

    const retainedBytes = input.retainedBytes.slice();
    const uploadBytes = input.uploadBytes?.slice() ?? retainedBytes;
    const createInput = { ...input, retainedBytes, uploadBytes };
    const entry: TextureEntry<TTexture> = {
      cacheKey: input.cacheKey,
      retainedBytes,
      uploadBytes,
      retainedByteLength: additionalRetained,
      width: input.width,
      height: input.height,
      estimatedGpuBytes,
      resource: this.createResource(createInput),
      references: 1,
      usageTick: this.usageCounter,
    };
    this.entries.set(entry.cacheKey, entry);
    return this.lease(entry);
  }

  private lease(entry: TextureEntry<TTexture>): TextureLease<TTexture> {
    let released = false;
    return {
      cacheKey: entry.cacheKey,
      get texture() {
        return entry.resource.texture;
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.destroyed || entry.references === 0) return;
        entry.references -= 1;
        if (entry.references === 0) this.evictToPolicy();
      },
    };
  }

  restoreContext(): void {
    if (this.destroyed) return;
    for (const entry of [...this.entries.values()].sort((left, right) => (
      left.cacheKey.localeCompare(right.cacheKey)
    ))) {
      const previous = entry.resource;
      entry.resource = this.createResource({
        cacheKey: entry.cacheKey,
        retainedBytes: entry.retainedBytes,
        uploadBytes: entry.uploadBytes,
        width: entry.width,
        height: entry.height,
      });
      this.destroyResource(previous);
    }
  }

  stats(): PixelBrainTextureCacheStats {
    const totals = this.totals();
    return {
      retainedRasterBytes: totals.retained,
      estimatedGpuBytes: totals.gpu,
      activeSceneBytes: totals.active,
      zeroReferenceEntries: totals.zeroCount,
      entries: [...this.entries.values()]
        .sort((left, right) => left.cacheKey.localeCompare(right.cacheKey))
        .map((entry) => ({
          cacheKey: entry.cacheKey,
          retainedByteLength: entry.retainedByteLength,
          estimatedGpuBytes: entry.estimatedGpuBytes,
          references: entry.references,
          usageTick: entry.usageTick,
        })),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      this.destroyResource(entry.resource);
    }
    this.entries.clear();
  }
}
