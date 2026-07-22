import { describe, it, expect } from 'vitest';
import { AXIS_SLOTS, ISOLATION, LIVE_AXES } from '../../../src/core/phenotype/isolation';
import {
  UNMEASURED_BLOCK,
  vectorToBlocks,
  vectorToSCD64,
  type MeasurementVector,
} from '../../../src/core/phenotype/vector';
import { parseSCD64 } from '../../../src/core/scd64/parseSCD64';

const PROFILE = 'A1B2C3';

const FULL: MeasurementVector = {
  luminance: 'high',
  stacking: 'base',
  size: 'panel',
  chromaticity: 'ember',
  shape: 'pill',
  density: 'measured',
};

describe('isolation contracts', () => {
  it('declares a contract for every live axis — no contract, no seal', () => {
    for (const axis of LIVE_AXES) {
      expect(ISOLATION[axis]).toBeDefined();
      expect(ISOLATION[axis].source.length).toBeGreaterThan(0);
      expect(ISOLATION[axis].normalization.length).toBeGreaterThan(0);
      expect(ISOLATION[axis].pausedState.length).toBeGreaterThan(0);
    }
  });

  it('excludes motion from v1', () => {
    expect(LIVE_AXES).toHaveLength(6);
    expect(LIVE_AXES).not.toContain('motion');
  });

  it('reads luminance from computed styles, not pixels — the stacking isolation', () => {
    expect(ISOLATION.luminance.source).toMatch(/computed/i);
    expect(ISOLATION.luminance.source).not.toMatch(/pixel|screenshot/i);
  });

  it('normalizes density by the clipped region, not the bounding box', () => {
    expect(ISOLATION.density.normalization).toMatch(/clipped/i);
    expect(ISOLATION.density.normalization).not.toMatch(/bounding box/i);
  });
});

describe('vectorToSCD64', () => {
  it('produces exactly 64 uppercase hex characters', () => {
    const code = vectorToSCD64(FULL, PROFILE, true);
    expect(code).toMatch(/^[0-9A-F]{64}$/);
    expect(parseSCD64(code)).toHaveLength(8);
  });

  it('puts the profile discriminator in slot 0 after the version byte', () => {
    const blocks = parseSCD64(vectorToSCD64(FULL, PROFILE, true));
    expect(blocks[0].slice(2)).toBe(PROFILE);
  });

  it('marks an unconfirmed vector with the predicted version byte', () => {
    const confirmed = parseSCD64(vectorToSCD64(FULL, PROFILE, true))[0].slice(0, 2);
    const predicted = parseSCD64(vectorToSCD64(FULL, PROFILE, false))[0].slice(0, 2);
    expect(confirmed).not.toBe(predicted);
  });

  it('is deterministic across 100 runs (Law 6)', () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => vectorToSCD64(FULL, PROFILE, true)),
    );
    expect(codes.size).toBe(1);
  });
});

describe('vectorToBlocks', () => {
  it('changes exactly one block when exactly one axis term changes', () => {
    const before = vectorToBlocks(FULL, PROFILE);
    const after = vectorToBlocks({ ...FULL, size: 'region' }, PROFILE);

    const differing = before
      .map((block, i) => (block === after[i] ? null : i))
      .filter((i): i is number => i !== null);

    expect(differing).toEqual([3]); // slot 3 is size
  });

  it('renders an unmeasured axis as the sentinel block, never as a default term', () => {
    const blocks = vectorToBlocks({ ...FULL, density: null }, PROFILE);
    expect(blocks[6]).toBe(UNMEASURED_BLOCK);
  });

  it('gives a different block to the unmeasured sentinel than to any real term', () => {
    // Scoped to the LIVE axes only. Slot 7 (motion) is legitimately unmeasured
    // in v1, so asserting over the whole array would contradict the next test.
    // The property under test is that no real term COLLIDES with the sentinel.
    const blocks = vectorToBlocks(FULL, PROFILE);
    const liveBlocks = LIVE_AXES.map((axis) => blocks[AXIS_SLOTS[axis]]);
    expect(liveBlocks).toHaveLength(6);
    expect(liveBlocks).not.toContain(UNMEASURED_BLOCK);
  });

  it('reserves slot 7 for motion and leaves it unmeasured in v1', () => {
    expect(vectorToBlocks(FULL, PROFILE)[7]).toBe(UNMEASURED_BLOCK);
  });
});
