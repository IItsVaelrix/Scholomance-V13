import { describe, expect, it } from 'vitest';
import { serializeStable } from '../../src/lib/godot-export/stableSerialize.js';

describe('serializeStable', () => {
  it('sorts object keys recursively', () => {
    const first = { b: 2, a: { d: 4, c: 3 } };
    const second = { a: { c: 3, d: 4 }, b: 2 };

    expect(serializeStable(first)).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(serializeStable(first)).toBe(serializeStable(second));
  });

  it('preserves array order', () => {
    expect(serializeStable([{ b: 2, a: 1 }, { d: 4, c: 3 }])).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it('omits non-json object entries and normalizes non-json array entries', () => {
    const value = {
      keep: true,
      dropUndefined: undefined,
      dropFunction: () => false,
      array: [undefined, () => false, Symbol('x')],
    };

    expect(serializeStable(value)).toBe('{"array":[null,null,null],"keep":true}');
  });
});
