// Shard residency lifecycle: fetch order, the three-family LRU cap, and that an
// evicted family's WASM connection is actually closed (its bytes freed), not
// merely dropped from the cache. Uses a fake fetcher + a stubbed SQLite so the
// orchestration is verified without loading the real WASM module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The residency manager pulls in wasm-shard-db, which imports the browser-only
// SQLite-WASM module at load time. Stub both so this runs under Node/vitest.
const opened: { id: string; closed: boolean }[] = [];

vi.mock('../../src/lib/career/graph/wasm-shard-db', () => ({
  initSqlite: vi.fn(async () => ({}) as unknown),
  openShardFromBytes: (_sqlite: unknown, bytes: Uint8Array) => {
    const id = new TextDecoder().decode(bytes);
    const rec = { id, closed: false };
    opened.push(rec);
    return {
      select: () => [],
      close: () => {
        rec.closed = true;
      },
    };
  },
}));

import { ShardResidency, type ShardFetcher } from '../../src/lib/career/graph/shard-residency';

const FAMILIES = ['11', '13', '15', '17'];

function fakeManifest() {
  return {
    schemaPolicy: 'career-graph-schema-v1',
    policy: 'career-graph-build-v1',
    residency: { pinned: ['core', 'universal'], maxFamilyShards: 3 },
    familyGroups: FAMILIES,
    contentDigest: 'deadbeefcafe',
    shards: [
      { shardId: 'core', file: 'career-core.sqlite', checksum: 'c', conceptCount: 1, relationCount: 0 },
      { shardId: 'universal', file: 'career-universal.sqlite', checksum: 'u', conceptCount: 1, relationCount: 0 },
      ...FAMILIES.map((g) => ({
        shardId: `family-${g}`,
        file: `career-family-${g}.sqlite`,
        checksum: g,
        conceptCount: 1,
        relationCount: 1,
      })),
    ],
  };
}

describe('ShardResidency', () => {
  let fetched: string[];
  let fetcher: ShardFetcher;

  beforeEach(() => {
    opened.length = 0;
    fetched = [];
    fetcher = async (file: string) => {
      fetched.push(file);
      // The shard id doubles as the deserialized "bytes" so tests can identify it.
      return new TextEncoder().encode(file.replace('career-', '').replace('.sqlite', ''));
    };
    // @ts-expect-error - jsdom/node global fetch is stubbed per test.
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => fakeManifest() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches only the pinned shards on initialize', async () => {
    const r = new ShardResidency('/manifest.json', fetcher);
    await r.initialize();
    expect(fetched).toEqual(['career-core.sqlite', 'career-universal.sqlite']);
    expect(r.residentFamilies()).toEqual([]);
  });

  it('lazily loads a family shard and keeps at most three resident', async () => {
    const r = new ShardResidency('/manifest.json', fetcher);
    await r.initialize();

    await r.ensureFamily('11', 'req-1');
    await r.ensureFamily('13', 'req-2');
    await r.ensureFamily('15', 'req-3');
    expect(r.residentFamilies().sort()).toEqual(['family-11', 'family-13', 'family-15']);

    // A fourth family evicts the least-recently-used (family-11) and closes it.
    await r.ensureFamily('17', 'req-4');
    expect(r.residentFamilies().sort()).toEqual(['family-13', 'family-15', 'family-17']);

    const evicted = opened.find((o) => o.id === 'family-11');
    expect(evicted?.closed).toBe(true);
    // Pinned shards are never closed.
    expect(opened.find((o) => o.id === 'core')?.closed).toBe(false);
  });

  it('does not re-fetch a family that is already resident', async () => {
    const r = new ShardResidency('/manifest.json', fetcher);
    await r.initialize();
    await r.ensureFamily('15', 'req-1');
    const countAfterFirst = fetched.filter((f) => f.includes('family-15')).length;
    await r.ensureFamily('15', 'req-2');
    const countAfterSecond = fetched.filter((f) => f.includes('family-15')).length;
    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1);
  });

  it('ignores an unknown / non-SOC family group', async () => {
    const r = new ShardResidency('/manifest.json', fetcher);
    await r.initialize();
    await r.ensureFamily('99', 'req-1'); // no such family shard
    expect(r.residentFamilies()).toEqual([]);
  });
});
