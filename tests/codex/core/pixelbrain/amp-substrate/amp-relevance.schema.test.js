/**
 * PB-AMP-RELEVANCE-v1 contract (PDR §3.1 F1).
 *
 * The checksum tests are the load-bearing ones: this contract's whole claim is
 * that a record cannot carry an identity that disagrees with its own content.
 */

import { describe, it, expect } from 'vitest';
import {
  AMP_RELEVANCE_CONTRACT,
  canonicalAmpRelevanceJSON,
  computeAmpRelevanceChecksum,
  createAmpRelevanceRecord,
  validateAmpRelevance,
} from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const CHESTPLATE = {
  pipeline: 'item',
  ampId: 'chestplate-amp',
  order: 8,
  description: 'Chestplate trim/plate templating; gated on class:armor + archetype includes chestplate (item-foundry.js:325).',
  concept: 'structural',
  version: '1.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
  requires: [],
};

const ITEM_RECORD = {
  pipeline: 'item',
  ampId: 'chestplate-amp',
  order: 8,
  description: 'Chestplate trim/plate templating; gated on class:armor + archetype includes chestplate (item-foundry.js:325).',
  concept: 'structural',
  version: '2.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
  requires: [],
};

describe('PB-AMP-RELEVANCE-v1 contract', () => {
  it('createAmpRelevanceRecord produces a complete, self-consistent, frozen record', () => {
    const record = createAmpRelevanceRecord(CHESTPLATE);
    expect(record.contract).toBe(AMP_RELEVANCE_CONTRACT);
    expect(record.schemaVersion).toBe(AMP_RELEVANCE_CONTRACT);
    expect(record.ampId).toBe('chestplate-amp');
    expect(record.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(record)).toBe(true);
    expect(validateAmpRelevance(record).ok).toBe(true);
  });

  it('rejects a record whose content was edited without recomputing the checksum', () => {
    const record = createAmpRelevanceRecord(CHESTPLATE);
    const tampered = { ...record, appliesTo: [{ field: 'class', op: 'eq', value: 'weapon' }] };
    const result = validateAmpRelevance(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/checksum: declared/);
  });

  it('treats an empty appliesTo as valid — it is the "always relevant" shape, not an omission', () => {
    const universal = createAmpRelevanceRecord({
      pipeline: 'runtime',
      ampId: 'symmetry-amp',
      order: 0,
      description: 'Symmetry AMP',
      concept: 'structural',
      version: '1.0.0',
    });
    expect(universal.appliesTo).toEqual([]);
    expect(universal.requires).toEqual([]);
    expect(validateAmpRelevance(universal).ok).toBe(true);
  });

  it('accepts an anyOf disjunction of leaf clauses', () => {
    const record = createAmpRelevanceRecord({
      pipeline: 'render-fidelity',
      ampId: 'holyfire-motif-amp',
      order: 5,
      description: 'Holyfire motif AMP',
      concept: 'material',
      version: '1.0.0',
      appliesTo: [
        { field: 'class', op: 'eq', value: 'weapon' },
        {
          anyOf: [
            { field: 'parts.profile', op: 'eq', value: 'weapon.sword.holyfire_motif' },
            { field: 'parts.id', op: 'eq', value: ['holyFire', 'holy_fire'] },
          ],
        },
      ],
    });
    expect(validateAmpRelevance(record).ok).toBe(true);
  });

  it('refuses unknown fields, unknown ops, nested anyOf, and array values on matches', () => {
    const cases = [
      [{ field: 'colour', op: 'eq', value: 'x' }, /unknown field/],
      [{ field: 'class', op: 'startsWith', value: 'x' }, /unknown op/],
      [{ anyOf: [{ anyOf: [{ field: 'class', op: 'eq', value: 'x' }] }] }, /nested anyOf/],
      [{ field: 'class', op: 'matches', value: ['a', 'b'] }, /single pattern string/],
      [{ field: 'class', op: 'eq', value: 42 }, /string or a non-empty array/],
    ];
    for (const [clause, pattern] of cases) {
      const record = createAmpRelevanceRecord({
        pipeline: 'item',
        ampId: 'x-amp',
        order: 0,
        description: 'test amp',
        concept: 'test',
        version: '1.0.0',
        appliesTo: [clause],
      });
      const result = validateAmpRelevance(record);
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(pattern);
    }
  });

  it('requires a non-empty ampId, version, and the right contract tags', () => {
    const bad = createAmpRelevanceRecord({
      pipeline: 'item',
      ampId: '',
      order: 0,
      description: 'test',
      concept: 'test',
      version: '',
    });
    const result = validateAmpRelevance(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/ampId: required/);
    expect(result.errors.join(' ')).toMatch(/version: required/);

    const wrongContract = { ...createAmpRelevanceRecord(CHESTPLATE), contract: 'PB-SOMETHING-ELSE' };
    expect(validateAmpRelevance(wrongContract).errors.join(' ')).toMatch(/contract: expected/);
  });

  it('checksum is a pure function of content, insensitive to key insertion order', () => {
    const a = computeAmpRelevanceChecksum({
      pipeline: 'item',
      ampId: 'a-amp',
      order: 0,
      description: 'test',
      concept: 'test',
      version: '1.0.0',
      appliesTo: [],
      requires: [],
    });
    const b = computeAmpRelevanceChecksum({
      requires: [],
      appliesTo: [],
      concept: 'test',
      description: 'test',
      order: 0,
      version: '1.0.0',
      ampId: 'a-amp',
      pipeline: 'item',
    });
    expect(a).toBe(b);
  });

  it('canonical JSON pins the field order the checksum depends on', () => {
    const json = canonicalAmpRelevanceJSON({
      pipeline: 'item',
      ampId: 'a-amp',
      order: 0,
      description: 'test',
      concept: 'test',
      version: '1.0.0',
    });
    expect(json).toBe(
      '{"contract":"PB-AMP-RELEVANCE-v2","pipeline":"item","ampId":"a-amp","order":0,"description":"test","concept":"test","version":"1.0.0","appliesTo":[],"requires":[],"schemaVersion":"PB-AMP-RELEVANCE-v2"}',
    );
  });

  it('is deterministic across repeated construction', () => {
    const first = createAmpRelevanceRecord(CHESTPLATE);
    for (let i = 0; i < 100; i += 1) {
      expect(createAmpRelevanceRecord(CHESTPLATE).checksum).toBe(first.checksum);
    }
  });
});

describe('PB-AMP-RELEVANCE-v2 envelope', () => {
  it('contract is now v2', () => {
    expect(AMP_RELEVANCE_CONTRACT).toBe('PB-AMP-RELEVANCE-v2');
  });

  it('createAmpRelevanceRecord requires pipeline, order, description, concept', () => {
    const record = createAmpRelevanceRecord(ITEM_RECORD);
    expect(record.pipeline).toBe('item');
    expect(record.order).toBe(8);
    expect(record.description).toBe(ITEM_RECORD.description);
    expect(record.concept).toBe('structural');
    expect(validateAmpRelevance(record).ok).toBe(true);
  });

  it('rejects a record with no pipeline', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, pipeline: undefined });
    const { ok, errors } = validateAmpRelevance(record);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.startsWith('pipeline'))).toBe(true);
  });

  it('rejects an unknown pipeline', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, pipeline: 'not-a-real-pipeline' });
    expect(validateAmpRelevance(record).ok).toBe(false);
  });

  it('rejects a non-integer order', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, order: 1.5 });
    expect(validateAmpRelevance(record).ok).toBe(false);
  });

  it('rejects empty description or concept', () => {
    expect(validateAmpRelevance(createAmpRelevanceRecord({ ...ITEM_RECORD, description: '' })).ok).toBe(false);
    expect(validateAmpRelevance(createAmpRelevanceRecord({ ...ITEM_RECORD, concept: '   ' })).ok).toBe(false);
  });

  it('checksum changes when pipeline, order, description, or concept changes', () => {
    const base = createAmpRelevanceRecord(ITEM_RECORD);
    const repipelined = createAmpRelevanceRecord({ ...ITEM_RECORD, pipeline: 'render-fidelity' });
    const reordered = createAmpRelevanceRecord({ ...ITEM_RECORD, order: 9 });
    const redescribed = createAmpRelevanceRecord({ ...ITEM_RECORD, description: 'different text entirely here' });
    const reconcepted = createAmpRelevanceRecord({ ...ITEM_RECORD, concept: 'material' });
    expect(repipelined.checksum).not.toBe(base.checksum);
    expect(reordered.checksum).not.toBe(base.checksum);
    expect(redescribed.checksum).not.toBe(base.checksum);
    expect(reconcepted.checksum).not.toBe(base.checksum);
  });

  it('parts.shading is now a valid appliesTo field (facet-amp needs it)', () => {
    const record = createAmpRelevanceRecord({
      ...ITEM_RECORD,
      ampId: 'facet-amp',
      appliesTo: [{ field: 'parts.shading', op: 'eq', value: 'faceted' }],
    });
    expect(validateAmpRelevance(record).ok).toBe(true);
  });
});
