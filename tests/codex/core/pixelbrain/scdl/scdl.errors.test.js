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
  it('has all 26 codes (v1 + frame codes + SCDL-016..021 graph codes v1.2 + SCDL-022 lexer + SCDL-023..026 boolean-op/color-ref)', () => {
    expect(Object.keys(SCDL_ERROR_CODES)).toHaveLength(26);
  });

  it('carries a code for a character that is legal in no token', () => {
    // The lexer used to skip such characters silently, so a hyphen in an asset
    // name reappeared as an unrelated canvas error at the wrong line.
    expect(SCDL_ERROR_CODES.ILLEGAL_CHARACTER).toBe(0x1016);
  });

  it('carries codes for the boolean-op arity and role-conflict diagnostics', () => {
    // These used to be raw {code,message} literals pushed straight into the
    // errors array, bypassing SCDLError entirely — compileSCDL's final
    // hasErrors check calls e.isError()/e.isWarn() unconditionally, so a
    // malformed union/subtract/intersect crashed the compiler instead of
    // failing cleanly.
    expect(SCDL_ERROR_CODES.BOOLEAN_OP_ARITY).toBe(0x1017);
    expect(SCDL_ERROR_CODES.SEMANTIC_ROLE_CONFLICT).toBe(0x1018);
  });

  it('carries a code for an unrecognized colorRef.kind', () => {
    expect(SCDL_ERROR_CODES.UNKNOWN_COLOR_REF_KIND).toBe(0x1019);
  });

  it('carries a code for a boolean-op target that is not another existing part', () => {
    expect(SCDL_ERROR_CODES.INVALID_BOOLEAN_TARGET).toBe(0x101A);
  });

  it('codes are unique numeric values', () => {
    const values = Object.values(SCDL_ERROR_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
