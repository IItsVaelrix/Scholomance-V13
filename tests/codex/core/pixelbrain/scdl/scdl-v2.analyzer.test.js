import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { parseRational, rationalToString } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

function analyze(source) {
  const parsed = parseSCDLV2(source);
  expect(parsed.ok).toBe(true);
  return analyzeSCDLV2(parsed.ast);
}

const BASE = `SCDL 2
ASSET typed
CANVAS WIDTH 9 HEIGHT 9
CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))
LAYER ink ORDER 10 { PAINT $orb FILL $ink RASTER MIDPOINT }`;

describe('SCDL v2 semantic analysis', () => {
  it('reduces exact decimal and division values', () => {
    expect(rationalToString(parseRational('1.250'))).toBe('5/4');
    expect(rationalToString(parseRational('-0.125'))).toBe('-1/8');
  });

  it('binds declarations before use and evaluates prefix math', () => {
    const result = analyze(BASE);
    expect(result.ok).toBe(true);
    expect(result.symbols.get('$two')).toEqual({ type: 'I32', value: 2 });
    expect(result.ir.shapes[0].value).toMatchObject({ kind: 'CIRCLE', radius: { type: 'PX' } });
  });

  it('rejects an unknown symbol at bind phase', () => {
    const result = analyze(BASE.replace('$two))', '$missing))'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-BIND-001' && d.relatedSymbols.includes('$missing'))).toBe(true);
  });

  it('rejects implicit I32-to-PX use', () => {
    const result = analyze(BASE.replace('RADIUS (PX $two)', 'RADIUS $two'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-TYPE-002' && d.expected.includes('PX') && d.received.includes('I32'))).toBe(true);
  });

  it('rejects duplicate symbols and use before declaration', () => {
    const duplicate = analyze(`${BASE}\nCONST $two I32 2`);
    expect(duplicate.diagnostics.some((d) => d.code === 'SCDL-BIND-002')).toBe(true);
    const early = analyze(BASE.replace('CONST $two I32 (ADD 1 1)\n', '').replace('LAYER ink', 'CONST $two I32 2\nLAYER ink'));
    expect(early.diagnostics.some((d) => d.code === 'SCDL-BIND-001')).toBe(true);
  });
});
