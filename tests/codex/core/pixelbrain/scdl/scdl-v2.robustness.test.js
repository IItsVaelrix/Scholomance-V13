import { describe, expect, it } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

function seededStrings(seed, count) {
  let state = seed >>> 0;
  const alphabet = 'SCDL 2\n{}()[]$#@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-_ \t';
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = state % 256;
    let value = 'SCDL 2\n';
    for (let i = 0; i < length; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      value += alphabet[state % alphabet.length];
    }
    return value;
  });
}

describe('SCDL v2 robustness', () => {
  it('never throws or returns a partial output for 2000 deterministic malformed programs', () => {
    for (const source of seededStrings(0x5cd12002, 2000)) {
      expect(() => compileSCDL(source)).not.toThrow();
      const result = compileSCDL(source);
      if (!result.ok) {
        expect(result.packet).toBeNull();
        expect(result.bytecode).toBeNull();
        expect(result.package).toBeNull();
      }
    }
  });

  it.each([
    ['SCDL-LEX-', 'SCDL 2\n@'],
    ['SCDL-PARSE-', 'SCDL 2\nASSET x\nCANVAS WIDTH'],
    ['SCDL-BIND-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p $missing'],
    ['SCDL-TYPE-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nCONST $n I32 1\nSHAPE $p (CIRCLE CENTER (VEC2 (PX 0) (PX 0)) RADIUS $n)'],
    ['SCDL-BUDGET-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nBUDGET INSTRUCTIONS 200001 GENERATED_SHAPES 1 RASTER_CELLS 1'],
  ])('fires a %s diagnostic', (prefix, source) => {
    const result = compileSCDL(source);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith(prefix))).toBe(true);
  });
});
