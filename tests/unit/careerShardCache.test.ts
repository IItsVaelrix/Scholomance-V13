import { describe, expect, it } from 'vitest';
import { CareerShardCache } from '../../src/lib/career/graph/shard-cache';

describe('CareerShardCache three-family residency', () => {
  it('pins core and universal while retaining at most three families', async () => {
    const cache = new CareerShardCache({ maxFamilies: 3 });
    await cache.ensureFamilies(['15', '27', '29'], 'r1');
    await cache.ensureFamilies(['11'], 'r2');
    expect(cache.residentFamilies()).toEqual(['11', '27', '29']);
    expect(cache.isPinned('core')).toBe(true);
    expect(cache.isPinned('universal')).toBe(true);
  });

  it('evicts the least-recently-used family when the cap is exceeded', async () => {
    const cache = new CareerShardCache({ maxFamilies: 2 });
    await cache.ensureFamilies(['a', 'b'], 'r1');
    await cache.ensureFamilies(['c'], 'r2');
    expect(cache.residentFamilies()).toEqual(['b', 'c']);
  });

  it('touching a family refreshes its recency so it survives eviction', async () => {
    const cache = new CareerShardCache({ maxFamilies: 2 });
    await cache.ensureFamilies(['a', 'b'], 'r1');
    await cache.ensureFamilies(['a'], 'r2'); // refresh 'a'
    await cache.ensureFamilies(['c'], 'r3'); // should evict 'b', not 'a'
    expect(cache.residentFamilies()).toEqual(['a', 'c']);
  });

  it('never counts pinned shards toward the family cap', async () => {
    const cache = new CareerShardCache({ maxFamilies: 1 });
    await cache.ensureFamilies(['core', 'universal', '15'], 'r1');
    expect(cache.residentFamilies()).toEqual(['15']);
    expect(cache.isPinned('core')).toBe(true);
  });

  it('reports which families still need loading', async () => {
    const cache = new CareerShardCache({ maxFamilies: 3 });
    const first = await cache.ensureFamilies(['15', '27'], 'r1');
    expect(first).toEqual(['15', '27']);
    const second = await cache.ensureFamilies(['15', '29'], 'r2');
    expect(second).toEqual(['29']); // '15' already resident
  });

  it('is deterministic for identical access sequences', async () => {
    const a = new CareerShardCache({ maxFamilies: 3 });
    const b = new CareerShardCache({ maxFamilies: 3 });
    for (const cache of [a, b]) {
      await cache.ensureFamilies(['x', 'y', 'z'], 'r1');
      await cache.ensureFamilies(['w'], 'r2');
    }
    expect(a.residentFamilies()).toEqual(b.residentFamilies());
  });
});
