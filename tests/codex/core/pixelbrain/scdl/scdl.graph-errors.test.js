import { describe, it, expect } from 'vitest';
import { SCDL_ERROR_CODES, scdlError, scdlWarn } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

describe('SCDL-016..021 graph error codes', () => {
  it('defines the six graph codes in the 0x1010 range', () => {
    expect(SCDL_ERROR_CODES.UNKNOWN_DEF_REF).toBe(0x1010);
    expect(SCDL_ERROR_CODES.DEF_CYCLE).toBe(0x1011);
    expect(SCDL_ERROR_CODES.DEPTH_CAP).toBe(0x1012);
    expect(SCDL_ERROR_CODES.INVALID_TRANSFORM).toBe(0x1013);
    expect(SCDL_ERROR_CODES.DEAD_INSTANCE).toBe(0x1014);
    expect(SCDL_ERROR_CODES.DEAD_DEF).toBe(0x1015);
  });
  it('labels them SCDL-016..SCDL-021 and encodes bytecode', () => {
    const e = scdlError('x', SCDL_ERROR_CODES.UNKNOWN_DEF_REF, { line: 1, col: 1 });
    expect(e.label).toBe('SCDL-016');
    expect(e.bytecodeString).toMatch(/^PB-ERR-v1-/);
    const w = scdlWarn('x', SCDL_ERROR_CODES.DEAD_DEF, { line: 1, col: 1 });
    expect(w.label).toBe('SCDL-021');
    expect(w.isWarn()).toBe(true);
  });
});
