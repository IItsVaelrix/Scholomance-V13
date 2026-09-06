import { describe, expect, it } from 'vitest';
import { tokenizeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js';

describe('SCDL v2 tokenizer', () => {
  it('preserves comments/newlines and tokenizes typed source losslessly', () => {
    const source = 'SCDL 2\r\n# note\r\nCONST $x PX (PX -1.25)\nCONST $c COLOR #Aa00Ff80\n';
    const result = tokenizeSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.tokens.map((token) => token.raw).join('')).toBe(source);
    expect(result.tokens.find((token) => token.kind === 'SYMBOL').value).toBe('$x');
    expect(result.tokens.find((token) => token.kind === 'DECIMAL').value).toBe('-1.25');
    expect(result.tokens.find((token) => token.kind === 'COLOR').value).toBe('#AA00FF80');
  });

  it('treats a leading BOM as trivia and remains lossless', () => {
    const source = '\uFEFFSCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\nLAYER ink ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }\n';
    const result = tokenizeSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.tokens.map((token) => token.raw).join('')).toBe(source);
    expect(result.tokens[0]).toMatchObject({ kind: 'WHITESPACE', raw: '\uFEFF' });
    expect(result.diagnostics).toEqual([]);
  });

  it('reports the exact illegal character and keeps scanning', () => {
    const result = tokenizeSCDLV2('SCDL 2\nCONST $x I32 1 @ CONST $y I32 2\n');
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('SCDL-LEX-001');
    expect(result.diagnostics[0].span.start).toMatchObject({ line: 2, column: 16 });
    expect(result.tokens.some((token) => token.value === '$y')).toBe(true);
  });

  it('treats malformed hash lexemes as invalid colors rather than comments', () => {
    const result = tokenizeSCDLV2('CONST $c COLOR #GGGGGG\n');
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('SCDL-LEX-002');
    expect(result.tokens.some((token) => token.kind === 'INVALID' && token.raw === '#GGGGGG')).toBe(true);
    expect(result.tokens.some((token) => token.kind === 'COMMENT')).toBe(false);
  });

  it('reports exact spans for tokens and zero-width EOF', () => {
    const result = tokenizeSCDLV2('A\r\n  $x');
    const symbol = result.tokens.find((token) => token.kind === 'SYMBOL');
    const eof = result.tokens.at(-1);
    expect(symbol.span).toEqual({
      start: { line: 2, column: 3, offset: 5 },
      end: { line: 2, column: 5, offset: 7 },
    });
    expect(eof.kind).toBe('EOF');
    expect(eof.raw).toBe('');
    expect(eof.span.start).toEqual(eof.span.end);
  });

  it.each([null, undefined, 42, {}, []])('never throws for %j', (source) => {
    expect(() => tokenizeSCDLV2(source)).not.toThrow();
    expect(tokenizeSCDLV2(source).source).toBe('');
  });
});
