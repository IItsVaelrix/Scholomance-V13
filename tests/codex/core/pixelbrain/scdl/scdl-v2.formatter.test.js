import { describe, expect, it } from 'vitest';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';

// The formatter reflows layout (inserts blank lines, expands brace bodies onto
// their own indented lines) and rewrites lexical spelling (e.g. lowercasing
// COLOR literals), so a reparsed canonical program necessarily carries
// different source spans and, for canonicalized tokens, different `raw` text
// than the AST parsed from the original, differently-spelled source.
// "Idempotent" here means the same parsed *program* (same declarations,
// opcodes, and semantic values) survives a format/reparse round trip, not
// that source positions or lexical spelling are preserved byte-for-byte.
// Strip `span` and `raw` before the structural comparison.
function normalizeForComparison(value) {
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'span' || key === 'raw') continue;
      clone[key] = normalizeForComparison(child);
    }
    return clone;
  }
  return value;
}

describe('SCDL v2 canonical formatter', () => {
  it('canonicalizes trivia, color case, and indentation', () => {
    const source = `SCDL 2\r\n# ignored\r\nASSET orb\r\nCANVAS WIDTH 5 HEIGHT 5\r\nCONST $c COLOR #AAbbCC\r\nSHAPE $p (PIXEL AT (VEC2 (PX 1) (PX 2)))\r\nLAYER ink ORDER 1 {\r\n PAINT $p FILL $c RASTER CENTER\r\n}\r\n`;
    const result = formatSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.output).toBe(`SCDL 2
ASSET orb
CANVAS WIDTH 5 HEIGHT 5

CONST $c COLOR #aabbcc
SHAPE $p (PIXEL AT (VEC2 (PX 1) (PX 2)))

LAYER ink ORDER 1 {
  PAINT $p FILL $c RASTER CENTER
}
`);
  });

  it('is idempotent and preserves the parsed program', () => {
    const once = formatSCDLV2('SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\nLAYER a ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }');
    const twice = formatSCDLV2(once.output);
    expect(twice.output).toBe(once.output);
    expect(normalizeForComparison(twice.ast)).toEqual(normalizeForComparison(once.ast));
  });

  it('does not manufacture output from invalid source', () => {
    const result = formatSCDLV2('SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))');
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
  });

  it('canonicalizes integer and decimal literal spelling, including negative zero, and uppercases the declared type', () => {
    const source = [
      'SCDL 2',
      'ASSET nums',
      'CANVAS WIDTH 1 HEIGHT 1',
      'CONST $intZero I32 -0',
      'CONST $intPad I32 007',
      'CONST $decZero fixed -0.0',
      'CONST $decPad FIXED 001.2500',
      'CONST $decTrail FIXED 1.000',
      'SHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))',
      'LAYER a ORDER 0 { PAINT $p FILL #000000 RASTER CENTER }',
    ].join('\n');
    const result = formatSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('CONST $intZero I32 0');
    expect(result.output).toContain('CONST $intPad I32 7');
    expect(result.output).toContain('CONST $decZero FIXED 0.0');
    expect(result.output).toContain('CONST $decPad FIXED 1.25');
    expect(result.output).toContain('CONST $decTrail FIXED 1.0');
  });

  it('inserts exactly one blank line between header and layer when no bindings exist', () => {
    // No CONST/SHAPE binding declarations at all: the PAINT statement's shape
    // is an inline expression, not a $-symbol reference, so this parses
    // cleanly straight from HEADER into LAYER (the direct transition path).
    const source = [
      'SCDL 2',
      'ASSET orb',
      'CANVAS WIDTH 1 HEIGHT 1',
      'LAYER a ORDER 0 { PAINT (PIXEL AT (VEC2 (PX 0) (PX 0))) FILL #000000 RASTER CENTER }',
    ].join('\n');
    const result = formatSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.output).toBe([
      'SCDL 2',
      'ASSET orb',
      'CANVAS WIDTH 1 HEIGHT 1',
      '',
      'LAYER a ORDER 0 {',
      '  PAINT (PIXEL AT (VEC2 (PX 0) (PX 0))) FILL #000000 RASTER CENTER',
      '}',
      '',
    ].join('\n'));
  });

  it('does not insert a blank line between consecutive LAYER declarations', () => {
    const source = [
      'SCDL 2',
      'ASSET orb',
      'CANVAS WIDTH 1 HEIGHT 1',
      'SHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))',
      'LAYER a ORDER 0 { PAINT $p FILL #000000 RASTER CENTER }',
      'LAYER b ORDER 1 { PAINT $p FILL #111111 RASTER CENTER }',
    ].join('\n');
    const result = formatSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.output).toBe([
      'SCDL 2',
      'ASSET orb',
      'CANVAS WIDTH 1 HEIGHT 1',
      '',
      'SHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))',
      '',
      'LAYER a ORDER 0 {',
      '  PAINT $p FILL #000000 RASTER CENTER',
      '}',
      'LAYER b ORDER 1 {',
      '  PAINT $p FILL #111111 RASTER CENTER',
      '}',
      '',
    ].join('\n'));
  });

  describe('never throws on malformed non-string input', () => {
    it('returns a failure shape for an empty object (no declarations at all)', () => {
      expect(() => formatSCDLV2({})).not.toThrow();
      const result = formatSCDLV2({});
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape when a declaration has an unrecognized kind', () => {
      const input = { declarations: [{ kind: 'Bogus' }] };
      expect(() => formatSCDLV2(input)).not.toThrow();
      const result = formatSCDLV2(input);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape for null', () => {
      expect(() => formatSCDLV2(null)).not.toThrow();
      const result = formatSCDLV2(null);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape for a bare number', () => {
      expect(() => formatSCDLV2(42)).not.toThrow();
      const result = formatSCDLV2(42);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape for an array (not a plain AST object)', () => {
      expect(() => formatSCDLV2([])).not.toThrow();
      const result = formatSCDLV2([]);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape for an object missing declarations entirely', () => {
      const input = { kind: 'Program', span: { start: {}, end: {} } };
      expect(() => formatSCDLV2(input)).not.toThrow();
      const result = formatSCDLV2(input);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });

    it('returns a failure shape when a nested expression has an unrecognized kind', () => {
      const input = {
        declarations: [
          { kind: 'ShapeDeclaration', symbol: '$p', value: { kind: 'Mystery' } },
        ],
      };
      expect(() => formatSCDLV2(input)).not.toThrow();
      const result = formatSCDLV2(input);
      expect(result).toEqual({ ok: false, output: null, ast: null, diagnostics: [] });
    });
  });
});
