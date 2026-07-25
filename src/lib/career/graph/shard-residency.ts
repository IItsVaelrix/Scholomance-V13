/**
 * Resident shard set for the browser Career Graph worker.
 *
 * Owns the fetch → verify-residency → deserialize lifecycle and hands the
 * engine-agnostic `sqlite-graph-port` its readers. The three-family residency
 * law is enforced by `CareerShardCache`; when a family is evicted its WASM
 * connection is closed here so its bytes are actually released, not merely
 * forgotten.
 *
 * Pinned shards (core, universal) are fetched once at `initialize` and never
 * evicted. `core` answers occupation search; a family shard is fetched lazily
 * the first time an occupation in its SOC group is confirmed.
 */
import { CareerShardCache, PINNED_SHARDS } from './shard-cache';
import { createSqlGraphPort, type SqlSelect } from './sqlite-graph-port';
import { openShardFromBytes, initSqlite, type WasmShardDb } from './wasm-shard-db';
import type { CareerGraphQueryPort } from './reference-query';
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';

export interface ShardManifestEntry {
  shardId: string;
  file: string;
  checksum: string;
  conceptCount: number;
  relationCount: number;
}

export interface ShardManifest {
  schemaPolicy: string;
  policy: string;
  residency: { pinned: string[]; maxFamilyShards: number };
  shards: ShardManifestEntry[];
  familyGroups: string[];
  contentDigest: string;
}

/** Fetches a shard's raw bytes. Injected so the manager is testable. */
export type ShardFetcher = (file: string) => Promise<Uint8Array>;

/** Default fetcher: GET the shard file relative to a base URL. */
export function httpShardFetcher(baseUrl: string): ShardFetcher {
  return async (file) => {
    const res = await fetch(`${baseUrl}/${file}`);
    if (!res.ok) throw new Error(`SHARD_FETCH_FAILED:${file}:${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

export class ShardResidency {
  private readonly cache: CareerShardCache;
  private readonly resident = new Map<string, WasmShardDb>(); // shardId -> db
  private readonly byGroup = new Map<string, string>(); // "15" -> "family-15"
  private sqlite: Sqlite3Static | null = null;
  private manifest: ShardManifest | null = null;

  constructor(
    private readonly manifestUrl: string,
    private readonly fetcher: ShardFetcher
  ) {
    this.cache = new CareerShardCache({ maxFamilies: 3 });
  }

  /** Fetch the manifest + pinned shards. Idempotent. */
  async initialize(): Promise<ShardManifest> {
    if (this.manifest) return this.manifest;

    this.sqlite = await initSqlite();
    const res = await fetch(this.manifestUrl);
    if (!res.ok) throw new Error(`MANIFEST_FETCH_FAILED:${res.status}`);
    const manifest = (await res.json()) as ShardManifest;

    for (const group of manifest.familyGroups) {
      this.byGroup.set(group, `family-${group}`);
    }
    for (const shardId of PINNED_SHARDS) {
      const entry = manifest.shards.find((s) => s.shardId === shardId);
      if (!entry) throw new Error(`MANIFEST_MISSING_PINNED_SHARD:${shardId}`);
      await this.load(entry);
    }

    this.manifest = manifest;
    return manifest;
  }

  /** Ensure the family shard for a 2-digit SOC group is resident. */
  async ensureFamily(group: string, requestId: string): Promise<void> {
    const shardId = this.byGroup.get(group);
    if (!shardId || !this.manifest) return; // unknown/non-SOC group: core answers

    const before = new Set(this.cache.residentFamilies());
    await this.cache.ensureFamilies([shardId], requestId);
    const after = new Set(this.cache.residentFamilies());

    // Close any family the LRU evicted so its WASM memory is freed.
    for (const evicted of before) {
      if (!after.has(evicted)) this.closeShard(evicted);
    }
    if (!this.resident.has(shardId)) {
      const entry = this.manifest.shards.find((s) => s.shardId === shardId);
      if (entry) await this.load(entry);
    }
  }

  /** The query port over the currently-resident shards. */
  port(): CareerGraphQueryPort {
    const core = this.reader('core');
    return createSqlGraphPort({
      core,
      family: (group) => {
        const shardId = this.byGroup.get(group);
        if (!shardId) return null;
        const db = this.resident.get(shardId);
        return db ? db.select : null;
      },
    });
  }

  /** Sorted resident family SOC groups (for diagnostics/tests). */
  residentFamilies(): string[] {
    return this.cache.residentFamilies();
  }

  dispose(): void {
    for (const db of this.resident.values()) db.close();
    this.resident.clear();
  }

  private reader(shardId: string): SqlSelect {
    const db = this.resident.get(shardId);
    if (!db) throw new Error(`SHARD_NOT_RESIDENT:${shardId}`);
    return db.select;
  }

  private async load(entry: ShardManifestEntry): Promise<void> {
    if (this.resident.has(entry.shardId) || !this.sqlite) return;
    const bytes = await this.fetcher(entry.file);
    this.resident.set(entry.shardId, openShardFromBytes(this.sqlite, bytes));
  }

  private closeShard(shardId: string): void {
    const db = this.resident.get(shardId);
    if (db) {
      db.close();
      this.resident.delete(shardId);
    }
  }
}
