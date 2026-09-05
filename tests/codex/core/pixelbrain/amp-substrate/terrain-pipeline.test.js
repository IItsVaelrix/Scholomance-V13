/**
 * `terrain` pipeline — added to wire grass-amp.js into the activation
 * substrate. Unlike the item-pipeline predicates (measured from real
 * pre-existing `if` gates in item-foundry.js), this pipeline's one predicate
 * is DESIGNED: grass-amp.js and its caller
 * (scdl/fixtures/void_grove/generate-grass-blades.mjs) were both built the
 * same session, so there was no scattered gate to transcribe. These tests
 * prove the gate that exists now — class:terrain + archetype:void_grove_grass
 * — actually decides correctly, in both directions.
 */
import { describe, it, expect } from 'vitest';
import { loadRelevanceRecordsSync } from '../../../../../codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
import { GrassAMP } from '../../../../../codex/core/pixelbrain/grass-amp.js';

describe('terrain pipeline — grass-amp activation', () => {
  it('activates grass-amp for the real terrain spec its caller passes', () => {
    const records = loadRelevanceRecordsSync();
    const { activated, skipped } = selectActiveAmps(
      'terrain',
      { class: 'terrain', archetype: 'void_grove_grass' },
      records,
    );
    expect(activated).toEqual(['grass-amp']);
    expect(skipped).toEqual([]);
  });

  it('does not activate grass-amp for a different archetype', () => {
    const records = loadRelevanceRecordsSync();
    const { activated, skipped } = selectActiveAmps(
      'terrain',
      { class: 'terrain', archetype: 'void_grove_dirt' },
      records,
    );
    expect(activated).toEqual([]);
    expect(skipped).toEqual([{ ampId: 'grass-amp', reason: 'appliesTo did not match spec' }]);
  });

  it('does not activate grass-amp for a different class', () => {
    const records = loadRelevanceRecordsSync();
    const { activated } = selectActiveAmps(
      'terrain',
      { class: 'item', archetype: 'void_grove_grass' },
      records,
    );
    expect(activated).toEqual([]);
  });

  it('grass-amp does not leak into an unrelated pipeline scope', () => {
    const records = loadRelevanceRecordsSync();
    const { activated } = selectActiveAmps(
      'item',
      { class: 'terrain', archetype: 'void_grove_grass' },
      records,
    );
    expect(activated).not.toContain('grass-amp');
  });

  it('the activated grass-amp genuinely produces blade geometry when invoked', () => {
    const records = loadRelevanceRecordsSync();
    const { activated } = selectActiveAmps(
      'terrain',
      { class: 'terrain', archetype: 'void_grove_grass' },
      records,
    );
    expect(activated).toContain('grass-amp');
    const { blades } = GrassAMP({ width: 16, height: 16, seed: 7 });
    expect(blades.length).toBeGreaterThan(0);
    expect(blades).toBeInstanceOf(Int8Array);
    expect(blades.some((rank) => rank >= 3)).toBe(true);
    expect(blades.every((rank) => rank === -1 || (rank >= 3 && rank <= 5))).toBe(true);
  });
});
