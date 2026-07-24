/**
 * Deterministic three-family shard residency cache.
 *
 * Law: no more than three occupation-family shards may be resident at once; the
 * `core` and `universal` bridge shards remain pinned and are never evicted or
 * counted toward the family cap. Eviction is strict least-recently-used and fully
 * deterministic for a given access sequence — no timestamps or randomness.
 */

/** Shards that are always resident and never evicted. */
export const PINNED_SHARDS = Object.freeze(['core', 'universal'] as const);
export type PinnedShard = (typeof PINNED_SHARDS)[number];

export interface ShardCacheOptions {
  /** Maximum resident occupation-family shards (default 3, per law). */
  maxFamilies: number;
}

export class CareerShardCache {
  private readonly maxFamilies: number;
  /** LRU map: iteration order is oldest -> newest. Value is the loading request id. */
  private readonly families = new Map<string, string>();
  private readonly pinned: ReadonlySet<string>;

  constructor(options: ShardCacheOptions) {
    this.maxFamilies = options.maxFamilies;
    this.pinned = new Set<string>(PINNED_SHARDS);
  }

  /** True for shards that stay resident regardless of the family cap. */
  isPinned(kind: string): boolean {
    return this.pinned.has(kind);
  }

  /**
   * Ensure the given family shards are resident, marking them most-recently-used
   * in order. Pinned shard ids are ignored (they are always resident). Evicts the
   * least-recently-used families beyond the cap. Resolves to the list of family
   * ids that were NOT already resident (i.e. still need loading).
   */
  async ensureFamilies(
    ids: readonly string[],
    activeRequestId: string
  ): Promise<string[]> {
    const toLoad: string[] = [];
    for (const id of ids) {
      if (this.isPinned(id)) continue;
      if (this.families.has(id)) {
        // Touch: remove and re-insert so it becomes most-recent.
        this.families.delete(id);
      } else {
        toLoad.push(id);
      }
      this.families.set(id, activeRequestId);
    }
    while (this.families.size > this.maxFamilies) {
      const oldest = this.families.keys().next().value;
      if (oldest === undefined) break;
      this.families.delete(oldest);
    }
    return toLoad;
  }

  /** Sorted list of currently resident family shard ids (deterministic). */
  residentFamilies(): string[] {
    return Array.from(this.families.keys()).sort();
  }

  /** The request id that loaded a family shard, if resident. */
  loadedBy(familyId: string): string | undefined {
    return this.families.get(familyId);
  }
}
