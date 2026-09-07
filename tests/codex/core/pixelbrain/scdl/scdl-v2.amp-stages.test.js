import { describe, it, expect } from 'vitest';
import {
  AMP_STAGES,
  getStageIndex,
  isValidStage,
  isStageBefore,
  compareAmpOrder,
  buildConveyorBelt,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-stages.js';

describe('SCDL v2 Fixed 12-Stage Conveyor-Belt Order', () => {
  const EXPECTED_STAGES = Object.freeze([
    'SOURCE_ANALYSIS',
    'CONSTRUCTION',
    'SHAPE_PRE',
    'SHAPE_POST',
    'MASK',
    'PAINT',
    'LAYER_POST',
    'PACKET_POST',
    'RENDER',
    'TIMELINE',
    'RUNTIME_DESCRIPTOR',
    'WORLD_DESCRIPTOR',
  ]);

  it('defines the exact 12-stage sequential conveyor belt', () => {
    expect(AMP_STAGES).toEqual(EXPECTED_STAGES);
    expect(AMP_STAGES).toHaveLength(12);
  });

  it('correctly maps stage indices and validity', () => {
    expect(getStageIndex('SOURCE_ANALYSIS')).toBe(0);
    expect(getStageIndex('SHAPE_POST')).toBe(3);
    expect(getStageIndex('WORLD_DESCRIPTOR')).toBe(11);
    expect(getStageIndex('UNKNOWN_STAGE')).toBe(-1);

    expect(isValidStage('PAINT')).toBe(true);
    expect(isValidStage('FLAT_PASS')).toBe(false);
  });

  it('determines chronological stage precedence with isStageBefore', () => {
    expect(isStageBefore('SOURCE_ANALYSIS', 'CONSTRUCTION')).toBe(true);
    expect(isStageBefore('SHAPE_PRE', 'SHAPE_POST')).toBe(true);
    expect(isStageBefore('PAINT', 'LAYER_POST')).toBe(true);
    expect(isStageBefore('LAYER_POST', 'PAINT')).toBe(false);
    expect(isStageBefore('RUNTIME_DESCRIPTOR', 'WORLD_DESCRIPTOR')).toBe(true);
    expect(() => isStageBefore('INVALID', 'PAINT')).toThrow();
  });

  it('stably sorts activations using compareAmpOrder', () => {
    const ampA = { ampId: 'amp.z', stage: 'CONSTRUCTION', order: 10 };
    const ampB = { ampId: 'amp.a', stage: 'SHAPE_POST', order: 1 };
    // CONSTRUCTION comes before SHAPE_POST despite order 10 vs 1
    expect(compareAmpOrder(ampA, ampB)).toBeLessThan(0);

    // Within same stage: order integer determines sequence
    const ampC = { ampId: 'amp.y', stage: 'SHAPE_POST', order: 5 };
    expect(compareAmpOrder(ampB, ampC)).toBeLessThan(0);

    // Same stage and same order: ampId breaks ties lexicographically
    const ampD1 = { ampId: 'pixelbrain.facet', stage: 'SHAPE_POST', order: 20 };
    const ampD2 = { ampId: 'pixelbrain.crystal', stage: 'SHAPE_POST', order: 20 };
    expect(compareAmpOrder(ampD2, ampD1)).toBeLessThan(0); // crystal < facet
  });

  it('builds a conveyor belt across mixed stages and orders', () => {
    const activations = [
      { ampId: 'amp.runtime', stage: 'RUNTIME_DESCRIPTOR', order: 10 },
      { ampId: 'amp.source', stage: 'SOURCE_ANALYSIS', order: 50 },
      { ampId: 'amp.layer', stage: 'LAYER_POST', order: 20 },
      { ampId: 'amp.shape2', stage: 'SHAPE_POST', order: 40 },
      { ampId: 'amp.shape1', stage: 'SHAPE_POST', order: 10 },
    ];

    const belt = buildConveyorBelt(activations);

    expect(belt.map((x) => x.ampId)).toEqual([
      'amp.source',
      'amp.shape1',
      'amp.shape2',
      'amp.layer',
      'amp.runtime',
    ]);
    expect(Object.isFrozen(belt)).toBe(true);
  });

  it('rejects activations with invalid stages in buildConveyorBelt', () => {
    expect(() => buildConveyorBelt([{ ampId: 'bad', stage: 'NON_EXISTENT' }])).toThrow(
      /unknown stage 'NON_EXISTENT'/
    );
  });
});
