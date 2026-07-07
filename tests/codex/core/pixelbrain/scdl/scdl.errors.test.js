/**
 * SCDL Error System Tests
 */

import { describe, it, expect } from 'vitest';
import {
  SCDLError,
  SCDL_ERROR_CODES,
  scdlError,
  scdlWarn,
  scdlInfo,
} from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';
import { decodeBytecodeError } from '../../../../../codex/core/pixelbrain/bytecode-error.js';

const LOC = { line: 5, col: 12 };

describe('SCDL Error — SCDLError constructor', () => {
  it('builds a valid SCDLError', () => {
    const err = scdlError('Unknown verb foo', SCDL_ERROR_CODES.UNKNOWN_VERB, LOC, { verb: 'foo' });
    expect(err).toBeInstanceOf(SCDLError);
    expect(err.severity).toBe('ERROR');
    expect(err.label).toBe('SCDL-001');
    expect(err.loc).toEqual(LOC);
    expect(err.message).toContain('Unknown verb');
  });

  it('scdlWarn has WARN severity', () => {
    const w = scdlWarn('Unknown material', SCDL_ERROR_CODES.UNKNOWN_MATERIAL, LOC);
    expect(w.severity).toBe('WARN');
    expect(w.isWarn()).toBe(true);
    expect(w.isError()).toBe(false);
  });

  it('scdlInfo has INFO severity', () => {
    const i = scdlInfo('Trace intent stored', SCDL_ERROR_CODES.TRACE_INTENT, LOC);
    expect(i.severity).toBe('INFO');
    expect(i.isInfo()).toBe(true);
  });

  it('bytecodeString starts with PB-ERR-v1', () => {
    const err = scdlError('Bad color', SCDL_ERROR_CODES.INVALID_HEX_COLOR, LOC, { color: '#GGG' });
    expect(err.bytecodeString.startsWith('PB-ERR-v1')).toBe(true);
  });

  it('bytecodeString is decodable', () => {
    const err = scdlError('Cell OOB', SCDL_ERROR_CODES.CELL_OUT_OF_BOUNDS, LOC, { x: 99, y: 99 });
    const decoded = decodeBytecodeError(err.bytecodeString);
    expect(decoded).toBeTruthy();
    expect(decoded.valid).toBe(true);
    expect(decoded.context.scdlCode).toBe('SCDL-007');
  });

  it('toJSON returns all expected fields', () => {
    const err = scdlError('Missing asset', SCDL_ERROR_CODES.MISSING_ASSET, LOC);
    const json = err.toJSON();
    expect(json.label).toBe('SCDL-002');
    expect(json.severity).toBe('ERROR');
    expect(json.bytecodeString).toBeTruthy();
    expect(json.loc).toEqual(LOC);
  });

  it('bytecodeString is deterministic — same input = same output', () => {
    const a = scdlError('Test', SCDL_ERROR_CODES.UNKNOWN_VERB, LOC, { extra: 'data' });
    const b = scdlError('Test', SCDL_ERROR_CODES.UNKNOWN_VERB, LOC, { extra: 'data' });
    expect(a.bytecodeString).toBe(b.bytecodeString);
  });
});

describe('SCDL_ERROR_CODES catalogue', () => {
  it('has all 21 codes (v1 + frame codes + SCDL-016..021 graph codes v1.2)', () => {
    expect(Object.keys(SCDL_ERROR_CODES)).toHaveLength(21);
  });

  it('codes are unique numeric values', () => {
    const values = Object.values(SCDL_ERROR_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
