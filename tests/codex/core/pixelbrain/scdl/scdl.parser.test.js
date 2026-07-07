/**
 * SCDL Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseSCDL, tokenize } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';

const BASIC_SOURCE = `
asset void_chestplate canvas 64x64

palette {
  void0 = #05060D
  gold2 = #D8B84C
}

part torso material voidsteel {
  fill void0
  rim gold2 at north west
}

export json svg
`.trim();

describe('SCDL Parser — tokenizer', () => {
  it('tokenizes hex colours correctly', () => {
    const tokens = tokenize('color = #05060D');
    const hex = tokens.find(t => t.type === 'HEX');
    expect(hex).toBeTruthy();
    expect(hex.value).toBe('#05060D');
  });

  it('tokenizes malformed hex colours for SCDL diagnostics', () => {
    const tokens = tokenize('color = #GGGGGG');
    const badHex = tokens.find(t => t.type === 'BAD_HEX');
    expect(badHex).toBeTruthy();
    expect(badHex.value).toBe('#GGGGGG');
  });

  it('skips comments', () => {
    const tokens = tokenize('# this is a comment\nasset foo canvas 10x10');
    const comments = tokens.filter(t => t.type === 'COMMENT');
    expect(comments).toHaveLength(0);
    const idents = tokens.filter(t => t.type === 'IDENT');
    expect(idents[0].value).toBe('asset');
  });

  it('tokenizes dimension 64x64 correctly', () => {
    const tokens = tokenize('canvas 64x64');
    const int1 = tokens.find(t => t.type === 'INT' && t.value === '64');
    const xsep = tokens.find(t => t.type === 'X');
    expect(int1).toBeTruthy();
    expect(xsep).toBeTruthy();
  });

  it('tokenizes strings correctly', () => {
    const tokens = tokenize('image.region("body")');
    const str = tokens.find(t => t.type === 'STRING');
    expect(str?.value).toBe('body');
  });
});

describe('SCDL Parser — parseSCDL', () => {
  it('parses a valid asset declaration', () => {
    const { rawAst, errors } = parseSCDL(BASIC_SOURCE);
    expect(rawAst).toBeTruthy();
    expect(rawAst.asset).toBe('void_chestplate');
    expect(rawAst.canvas.width).toBe(64);
    expect(rawAst.canvas.height).toBe(64);
    const fatalErrors = errors.filter(e => e.severity === 'ERROR');
    expect(fatalErrors).toHaveLength(0);
  });

  it('parses the palette block', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.palette).toMatchObject({ void0: '#05060D', gold2: '#D8B84C' });
  });

  it('parses a part block with fill and rim', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.parts).toHaveLength(1);
    const torso = rawAst.parts[0];
    expect(torso.id).toBe('torso');
    expect(torso.material).toBe('voidsteel');
    const ops = torso.ops;
    expect(ops.some(o => o.op === 'fill')).toBe(true);
    expect(ops.some(o => o.op === 'rim')).toBe(true);
  });

  it('parses export targets', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.exports).toContain('json');
    expect(rawAst.exports).toContain('svg');
  });

  it('produces a checksum', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(typeof rawAst.checksum).toBe('string');
    expect(rawAst.checksum.length).toBeGreaterThan(0);
  });

  it('parses trace intent', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  trace outline from image.region("body")\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const traceOp = rawAst.parts[0].ops.find(o => o.op === 'trace');
    expect(traceOp).toBeTruthy();
    expect(traceOp.intent).toBe(true);
    expect(traceOp.source).toContain('body');
  });

  it('parses cell op', () => {
    const src = `asset x canvas 8x8\npart gem material source {\n  cell 3 5 #00E5FF\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const cellOp = rawAst.parts[0].ops.find(o => o.op === 'cell');
    expect(cellOp).toBeTruthy();
    expect(cellOp.x).toBe(3);
    expect(cellOp.y).toBe(5);
    expect(cellOp.colorRef?.value).toBe('#00E5FF');
  });

  it('parses glow op', () => {
    const src = `asset x canvas 8x8\npart gem material source {\n  glow radius 2\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const glowOp = rawAst.parts[0].ops.find(o => o.op === 'glow');
    expect(glowOp?.radius).toBe(2);
    expect(glowOp?.hint).toBe(true);
  });

  it('parses symmetry op', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  symmetry x\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const symOp = rawAst.parts[0].ops.find(o => o.op === 'symmetry');
    expect(symOp?.axis).toBe('x');
  });

  it('returns SCDL-AST-v1 contract', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.contract).toBe('SCDL-AST-v1');
    expect(rawAst.version).toBe('1.2.0');
  });

  it('preserves malformed palette hex literals for compiler validation', () => {
    const src = `asset x canvas 8x8\npalette { bad = #GGGGGG }\npart a material source {\n  fill bad\n}\nexport json`;
    const { rawAst, errors } = parseSCDL(src);
    expect(errors.filter(e => e.severity === 'ERROR')).toHaveLength(0);
    expect(rawAst.palette.bad).toBe('#GGGGGG');
  });
});
