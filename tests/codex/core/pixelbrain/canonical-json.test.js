import { describe, it, expect } from 'vitest';
import {
  canonicalStringify,
  canonicalizeJsonText,
  parseCanonicalJson,
  pythonFloatRepr,
  pyFloat,
  JsonNumber,
} from '../../../../codex/core/pixelbrain/canonical-json.js';

describe('pythonFloatRepr', () => {
  it('renders integral floats with a trailing .0 like Python repr()', () => {
    expect(pythonFloatRepr(64)).toBe('64.0');
    expect(pythonFloatRepr(0)).toBe('0.0');
    expect(pythonFloatRepr(-3)).toBe('-3.0');
    expect(pythonFloatRepr(1e15)).toBe('1000000000000000.0');
  });

  it('renders fractional floats positionally inside Python thresholds', () => {
    expect(pythonFloatRepr(31.5)).toBe('31.5');
    expect(pythonFloatRepr(0.1)).toBe('0.1');
    expect(pythonFloatRepr(123.456)).toBe('123.456');
    expect(pythonFloatRepr(0.0001)).toBe('0.0001');
  });

  it('switches to scientific notation at Python thresholds (exp ≥ 16, exp < -4)', () => {
    expect(pythonFloatRepr(1e16)).toBe('1e+16');
    expect(pythonFloatRepr(1.5e20)).toBe('1.5e+20');
    expect(pythonFloatRepr(0.00001)).toBe('1e-05');
    expect(pythonFloatRepr(-2.5e-7)).toBe('-2.5e-07');
  });

  it('handles -0.0 and rejects non-finite values', () => {
    expect(pythonFloatRepr(-0)).toBe('-0.0');
    expect(() => pythonFloatRepr(Infinity)).toThrow(TypeError);
    expect(() => pythonFloatRepr(NaN)).toThrow(TypeError);
  });
});

describe('canonicalStringify', () => {
  it('emits Python-compact separators with insertion key order', () => {
    const value = new Map([
      ['b', 1],
      ['a', [true, false, null]],
    ]);
    expect(canonicalStringify(value)).toBe('{"b":1,"a":[true,false,null]}');
  });

  it('keeps JS safe integers as ints and marks floats via pyFloat', () => {
    expect(canonicalStringify({ x: 64, y: pyFloat(64) })).toBe('{"x":64,"y":64.0}');
  });

  it('escapes non-ASCII like Python ensure_ascii=True', () => {
    expect(canonicalStringify('glyph ✨')).toBe('"glyph \\u2728"');
    expect(canonicalStringify('tab\there')).toBe('"tab\\there"');
  });

  it('rejects non-string map keys and unserializable values', () => {
    expect(() => canonicalStringify(new Map([[1, 'x']]))).toThrow(TypeError);
    expect(() => canonicalStringify(undefined)).toThrow(TypeError);
  });
});

describe('parseCanonicalJson', () => {
  it('preserves float literals that JSON.parse collapses', () => {
    const parsed = parseCanonicalJson('{"w":64.0,"h":64}');
    expect(parsed.get('w')).toBeInstanceOf(JsonNumber);
    expect(parsed.get('w').isFloat).toBe(true);
    expect(parsed.get('h').isFloat).toBe(false);
    expect(canonicalStringify(parsed)).toBe('{"w":64.0,"h":64}');
  });

  it('preserves object key order including integer-like keys', () => {
    const text = '{"10":"a","2":"b","alpha":"c"}';
    expect(canonicalizeJsonText(text)).toBe(text);
  });

  it('round-trips escapes and whitespace to compact form', () => {
    expect(canonicalizeJsonText('{ "s" : "a\\u2728b" ,\n "n": [ 1 , 2.50 ] }'))
      .toBe('{"s":"a\\u2728b","n":[1,2.5]}');
  });

  it('rejects malformed input', () => {
    expect(() => parseCanonicalJson('{"a":}')).toThrow(SyntaxError);
    expect(() => parseCanonicalJson('{"a":1} extra')).toThrow(SyntaxError);
  });
});
