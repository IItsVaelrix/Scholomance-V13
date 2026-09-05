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
  ampId: 'chestplate-amp',
  version: '1.0.0',
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
    const universal = createAmpRelevanceRecord({ ampId: 'symmetry-amp', version: '1.0.0' });
    expect(universal.appliesTo).toEqual([]);
    expect(universal.requires).toEqual([]);
    expect(validateAmpRelevance(universal).ok).toBe(true);
  });

  it('accepts an anyOf disjunction of leaf clauses', () => {
    const record = createAmpRelevanceRecord({
      ampId: 'holyfire-motif-amp',
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
      const record = createAmpRelevanceRecord({ ampId: 'x-amp', version: '1.0.0', appliesTo: [clause] });
      const result = validateAmpRelevance(record);
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(pattern);
    }
  });

  it('requires a non-empty ampId, version, and the right contract tags', () => {
    const bad = createAmpRelevanceRecord({ ampId: '', version: '' });
    const result = validateAmpRelevance(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/ampId: required/);
    expect(result.errors.join(' ')).toMatch(/version: required/);

    const wrongContract = { ...createAmpRelevanceRecord(CHESTPLATE), contract: 'PB-SOMETHING-ELSE' };
    expect(validateAmpRelevance(wrongContract).errors.join(' ')).toMatch(/contract: expected/);
  });

  it('checksum is a pure function of content, insensitive to key insertion order', () => {
    const a = computeAmpRelevanceChecksum({ ampId: 'a-amp', version: '1.0.0', appliesTo: [], requires: [] });
    const b = computeAmpRelevanceChecksum({ requires: [], appliesTo: [], version: '1.0.0', ampId: 'a-amp' });
    expect(a).toBe(b);
  });

  it('canonical JSON pins the field order the checksum depends on', () => {
    const json = canonicalAmpRelevanceJSON({ ampId: 'a-amp', version: '1.0.0' });
    expect(json).toBe(
      '{"contract":"PB-AMP-RELEVANCE-v1","ampId":"a-amp","version":"1.0.0","appliesTo":[],"requires":[],"schemaVersion":"PB-AMP-RELEVANCE-v1"}',
    );
  });

  it('is deterministic across repeated construction', () => {
    const first = createAmpRelevanceRecord(CHESTPLATE);
    for (let i = 0; i < 100; i += 1) {
      expect(createAmpRelevanceRecord(CHESTPLATE).checksum).toBe(first.checksum);
    }
  });
});
